import { getResourceTexture, RESOURCE_ART_IDS } from './chronicle-art.js';

const SHOP_SPECIALTIES = Object.freeze({
  practiceReform: 'practiceReform', publicWorks: 'publicWorks',
  neutralMarket: 'neutralMarket', classMarket: 'classMarket',
  foodShop: 'foodShop', housingShop: 'settlement', knowledgeShop: 'development',
  stockShop: 'stockShop',
});

// Shops share a stall silhouette; the inset badge identifies their specialty.
export function drawLifeMapNodeIcon(graphics, node, { fill, accent, outline, x = 0, y = 0, scale = 1 }) {
  const variant = node.signatureNode?.variantId;
  const family = variant ?? node.family;
  const specialty = SHOP_SPECIALTIES[family];
  const kind = specialty ? 'shop' : ({ legacyPlus: 'legacy', removePractice: 'practiceReform',
    removeStructure: 'publicWorks', removeRoute: 'routes' })[variant] ?? family;
  drawSilhouette(graphics, kind, { fill, accent, outline, x, y, scale });
  if (specialty) {
    const badgeX = x + 20 * scale, badgeY = y + 16 * scale;
    graphics.lineStyle(3 * scale, outline, 1).beginFill(outline)
      .drawCircle(badgeX, badgeY, 18 * scale).endFill();
    graphics.lineStyle(2 * scale, accent, 1)
      .drawCircle(badgeX, badgeY, 16 * scale);
    const resourceId = typeof node.stockOutput === 'string'
      ? `stock-${node.stockOutput.toLowerCase()}` : 'stock';
    const texture = specialty === 'stockShop'
      ? getResourceTexture(RESOURCE_ART_IDS.includes(resourceId) ? resourceId : 'stock') : null;
    if (texture?.baseTexture.valid) {
      const size = 27 * scale;
      const matrix = new PIXI.Matrix().scale(size / texture.width, size / texture.height)
        .translate(badgeX - size / 2, badgeY - size / 2);
      graphics.lineStyle(0).beginTextureFill({ texture, matrix })
        .drawRect(badgeX - size / 2, badgeY - size / 2, size, size).endFill();
    } else {
      drawSilhouette(graphics, specialty, {
        fill, accent, outline, x: badgeX, y: badgeY, scale: scale * 0.4,
      });
    }
  }
  const transform = points => points.map((value, index) => value * scale + (index % 2 ? y : x));
  if (variant?.startsWith('remove')) {
    const points = transform([-26,29,27,-28]);
    for (const [width, color] of [[9, outline], [4, accent]]) {
      graphics.lineStyle(width * scale, color, 1)
        .moveTo(points[0], points[1]).lineTo(points[2], points[3]);
    }
  }
  if (node.signatureNode) {
    graphics.lineStyle(2 * scale,outline).beginFill(accent)
      .drawPolygon(transform([27,-39,31,-31,39,-27,31,-23,27,-15,23,-23,15,-27,23,-31])).endFill();
  }
}

function drawSilhouette(graphics, kind, { fill, accent, outline, x, y, scale }) {
  const transform = points => points.map((value, index) => value * scale + (index % 2 ? y : x));
  const polygon = points => graphics.lineStyle(3 * scale, outline, 1).beginFill(fill).drawPolygon(transform(points)).endFill();
  const line = (points, width = 4, color = outline) => {
    const mapped = transform(points);
    graphics.lineStyle(width * scale, color, 1).moveTo(mapped[0], mapped[1]);
    for (let i = 2; i < mapped.length; i += 2) graphics.lineTo(mapped[i], mapped[i + 1]);
  };
  switch (kind) {
    case 'patronage': // A tied purse, broad base and narrow neck.
      polygon([-12,-29, 12,-29, 7,-16, 22,0, 26,20, 15,29, -15,29, -26,20, -22,0, -7,-16]);
      line([-12,-14,12,-14],5,accent); line([0,-3,0,17],5,accent);
      break;
    case 'philosopherFounding':
    case 'development': // Open book.
      polygon([-29,-23,-10,-25,0,-18,10,-25,29,-23,29,22,10,20,0,27,-10,20,-29,22]);
      line([0,-17,0,24]); line([-22,-12,-9,-11]); line([9,-11,22,-12]);
      line([-22,0,-9,1],3,accent); line([9,1,22,0],3,accent);
      break;
    case 'travel': // Walking boot.
      polygon([-19,-29,7,-29,7,0,23,9,29,13,29,26,-26,26,-26,12,-19,3]);
      line([-24,18,27,18],4,accent); line([-14,-18,3,-18]); line([-14,-8,3,-8]);
      break;
    case 'practiceReform': // Open hand with a cuff — a governor's hand.
      polygon([-8,10,-16,-2,-12,-22,-6,-30,0,-18,4,-32,12,-24,16,-6,10,12,4,20,-4,20]);
      polygon([-8,10,-22,4,-24,-8,-14,-4,-8,2]);
      polygon([-14,18,14,18,16,28,-16,28]);
      line([-14,18,14,18],4,accent);
      break;
    case 'publicWorks': // Diagonal workshop hammer.
      polygon([-24,24,-17,30,14,-8,7,-15]);
      polygon([-9,-25,1,-32,28,-11,18,1,7,-10,2,-6,-9,-16]);
      line([-20,22,-14,27],4,accent);
      break;
    case 'shop': // Shared market stall with an open counter and striped awning.
      polygon([-30,-10,-23,-29,23,-29,30,-10,24,-3,-24,-3]);
      line([-23,-3,-23,27,23,27,23,-3]);
      line([-23,12,23,12],4,accent);
      line([-10,-25,-13,-8],4,accent); line([10,-25,13,-8],4,accent);
      break;
    case 'neutralMarket': // Exchange arrows.
      line([-25,-12,25,-12,13,-24],6,fill);
      line([25,12,-25,12,-13,24],6,fill);
      break;
    case 'classMarket': // Class diamond.
      polygon([0,-28,25,0,0,28,-25,0]);
      line([0,-15,0,15],5,accent);
      break;
    case 'stockShop': // A Stock crate with crossed boards.
      polygon([-26,-25,26,-25,26,25,-26,25]);
      line([-19,-18,19,18],5,accent);
      line([19,-18,-19,18],5,accent);
      break;
    case 'routes': // Bridge with a visible arch and piers.
      polygon([-31,24,-31,-3,-25,-3,-25,-22,-18,-22,-18,-7,18,-7,18,-22,25,-22,25,-3,31,-3,31,24,17,24,17,12,10,2,-10,2,-17,12,-17,24]);
      line([-29,-3,29,-3],4,accent);
      break;
    case 'settlement':
      polygon([-31,-3,0,-30,31,-3,23,2,23,27,7,27,7,9,-7,9,-7,27,-23,27,-23,2]);
      line([-23,-3,0,-23,23,-3],4,accent);
      break;
    case 'crisis': // Jagged lightning bolt.
      polygon([1,-33,-25,5,-6,5,-15,33,27,-12,6,-12,16,-33]);
      break;
    case 'relic': // Faceted reliquary.
      polygon([-18,-6,0,-32,18,-6,14,8,18,28,-18,28,-14,8]);
      line([-12,-2,0,-18,12,-2],4,accent);
      polygon([-6,10,0,2,6,10,0,18]);
      break;
    case 'warlordFounding':
    case 'legacy':
      polygon([-30,-23,-14,-10,0,-31,14,-10,30,-23,23,25,-23,25]);
      line([-23,14,23,14],5,accent); polygon([-5,-2,0,-9,5,-2,0,5]);
      break;
    case 'monsterHunt': // Horned skull.
      polygon([-14,-19,-30,-32,-27,-7,-20,3,-18,18,-8,20,-8,29,8,29,8,20,18,18,20,3,27,-7,30,-32,14,-19,0,-24]);
      line([-14,-3,-5,1],7); line([5,1,14,-3],7); line([0,12,0,19],4,accent);
      break;
    case 'foodShop': // Ear of grain.
      line([0,30,0,-28],5,fill);
      for (const y of [-18,-3,12]) {
        polygon([0,y+9,-18,y,-21,y-14,-5,y-8]);
        polygon([0,y+9,18,y,21,y-14,5,y-8]);
      }
      break;
    default:
      polygon([0,-32,9,-10,31,-10,14,5,21,29,0,15,-21,29,-14,5,-31,-10,-9,-10]);
  }
}
