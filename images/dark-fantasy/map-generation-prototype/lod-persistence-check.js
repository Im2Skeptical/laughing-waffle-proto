// Browser regression check: exercises the real workbench renderer and PNG output.
export async function verifyTerrainPersistence() {
  const state = mapWorkbench.state, camera = mapWorkbench.camera;
  const capture = async () => {
    const image = new Image(); image.src = mapWorkbench.exportPng(); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 450;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 700, 260, 1000, 450, 0, 0, 1000, 450);
    return ctx.getImageData(0, 0, 1000, 450).data;
  };
  try {
    mapWorkbench.setState({ sites: false, detailMode: 'regional' });
    mapWorkbench.setCamera({ zoom: 2, x: -2200, y: -550 });
    const regional = await capture();
    mapWorkbench.setState({ detailMode: 'close' });
    const close = await capture(); let changed = 0;
    for (let i = 0; i < regional.length; i += 4) {
      if (Math.max(...[0, 1, 2].map(c => Math.abs(regional[i + c] - close[i + c]))) > 8) changed++;
    }
    if (changed) throw new Error(`Terrain moved across LOD: ${changed} changed pixels`);
    const terrain = mapWorkbench.pixelRendering;
    for (const texel of [2, 4, 6]) {
      mapWorkbench.setState({ texel });
      if (mapWorkbench.pixelRendering !== terrain) throw new Error('Pixel density regenerated the landscape');
    }
    mapWorkbench.setState({ texel: state.texel });
    mapWorkbench.setState({ detailMode: 'auto' });
    const before = await capture(), pose = mapWorkbench.camera;
    mapWorkbench.setCamera({ ...pose, zoom: .35 });
    mapWorkbench.setCamera({ ...pose, zoom: 2.5 });
    mapWorkbench.setCamera(pose);
    const after = await capture(); let drift = 0;
    for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > 1) drift++;
    if (drift) throw new Error(`Zoom round trip changed ${drift} channels`);
    return { pass: true, changedPixels: changed, roundTripDrift: drift };
  } finally { mapWorkbench.setState(state); mapWorkbench.setCamera(camera); }
}
