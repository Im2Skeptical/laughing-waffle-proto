import { getResourceTexture, RESOURCE_ART_IDS } from '../chronicle-art.js';

export function getStockTransferIconLayout(packet) {
  const size = 32 + Math.min(4, Math.max(0, Number(packet.amount ?? 0)) / 5);
  return { size, width: packet.glyph.icons.length * (size + 2) + 6, height: size + 8 };
}

// View-local sprites survive frame updates and are reconciled only when the
// transfer batch changes. The shared resource atlas supplies the card icons.
export function createStockTransferIcons(parent) {
  const nodes = new Map();
  const remove = node => { node.container.removeFromParent(); node.container.destroy({ children: true }); };
  return {
    sync(packets) {
      const present = new Set(packets.filter(packet => packet.glyph.icons).map(packet => packet.transferId));
      for (const [id, node] of nodes) if (!present.has(id)) { remove(node); nodes.delete(id); }
      for (const packet of packets) {
        if (!packet.glyph.icons) continue;
        const ids = packet.glyph.icons.map(trait => {
          const id = trait ? `stock-${trait.toLowerCase()}` : 'stock';
          return RESOURCE_ART_IDS.includes(id) ? id : 'stock';
        });
        const signature = JSON.stringify([ids, packet.kind, packet.amount, packet.glyph.color]);
        if (nodes.get(packet.transferId)?.signature === signature) continue;
        if (nodes.has(packet.transferId)) remove(nodes.get(packet.transferId));
        const container = new PIXI.Container();
        container.eventMode = 'none'; container.visible = false;
        const { size, width, height } = getStockTransferIconLayout(packet);
        const plate = new PIXI.Graphics();
        plate.lineStyle(packet.kind === 'require' ? 2 : 1, packet.glyph.color, packet.kind === 'require' ? 1 : .45);
        plate.beginFill(0x111614, packet.kind === 'require' ? .4 : .82)
          .drawRoundedRect(-width / 2, -height / 2, width, height, 5).endFill();
        container.addChild(plate);
        const icons = ids.map((id, index) => {
          const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
          sprite.anchor.set(.5); sprite.x = (index - (ids.length - 1) / 2) * (size + 2);
          sprite.eventMode = 'none'; sprite.visible = false;
          container.addChild(sprite);
          return { id, sprite, loaded: false };
        });
        parent.addChild(container);
        nodes.set(packet.transferId, { container, icons, size, signature });
      }
    },
    beginFrame() { for (const node of nodes.values()) node.container.visible = false; },
    draw(packet, pose, alpha) {
      const node = nodes.get(packet.transferId);
      if (!node) return;
      node.container.position.set(pose.x, pose.y);
      node.container.alpha = alpha;
      node.container.visible = true;
      for (const icon of node.icons) if (!icon.loaded) {
        const texture = getResourceTexture(icon.id);
        if (!texture?.baseTexture.valid) continue;
        icon.sprite.texture = texture;
        icon.sprite.scale.set(Math.min(node.size / texture.width, node.size / texture.height));
        icon.sprite.visible = true; icon.loaded = true;
      }
    },
    snapshot(transferId) {
      const node = nodes.get(transferId);
      return { iconIds: node?.icons.map(icon => icon.id) ?? [], renderedIconCount: node?.icons.filter(icon => icon.loaded).length ?? 0 };
    },
    clear() { for (const node of nodes.values()) remove(node); nodes.clear(); },
  };
}
