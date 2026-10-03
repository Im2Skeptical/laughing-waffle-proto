import { getGamepieceFace } from '../../../src/model/gamepiece-presentation.js';
import { attachDevPreviewDisplay } from '../../../src/views/dev-preview-display.js';
import { addPreviewCard } from './preview-renderer.js';

const ROOT = 'images/dark-fantasy/tooltip-prototype/';
export async function createScreenPreview(host) {
  const textures = {};
  for (const context of ['settlement', 'shop']) textures[context] = await PIXI.Assets.load(`${ROOT}${context}-reference.png`);
  const app = new PIXI.Application({ width: 2048, height: 945, backgroundColor: 0x111c21, antialias: true, autoStart: false });
  app.renderer.plugins.accessibility.div.classList.add('prototype-accessibility');
  app.view.setAttribute('aria-label', 'Cards in their game screen context'); host.append(app.view);
  const display = attachDevPreviewDisplay(host);
  function render(selected, context, graphics) {
    for (const child of app.stage.removeChildren()) child.destroy({ children: true });
    const background = new PIXI.Sprite(textures[context]); background.width = 2048; background.height = 945; app.stage.addChild(background);
    const cover = new PIXI.Graphics().beginFill(0x202925);
    if (context === 'settlement') cover.drawRect(825, 181, 1192, 344).drawRect(58, 101, 705, 543);
    else cover.drawRect(1097, 218, 815, 478);
    cover.endFill(); app.stage.addChild(cover);
    const samples = context === 'settlement' ? ['forage', 'logging', 'smelting', 'alchemy', 'anatomicalStudy'] : ['forage', 'smelting', 'alchemy'];
    samples[0] = selected.definitionId;
    const faces = samples.map((id, index) => index === 0 ? selected : getGamepieceFace({ tSec: 0 }, 'practice', id));
    faces.forEach((face, index) => {
      const x = context === 'settlement' ? 831 + index * 240 : 246 + index * 304;
      const y = context === 'settlement' ? 201 : 282;
      const width = context === 'settlement' ? 226 : 100;
      if (context === 'shop') {
        const clear = new PIXI.Graphics().beginFill(0x202925).drawRect(160 + index * 304, 204, 272, 227).endFill();
        app.stage.addChild(clear);
        const title = new PIXI.Text(`Learn Bronze ${face.label}`, { fontFamily: 'Georgia', fontSize: 22, fill: 0xe0d3ae, wordWrap: true, wordWrapWidth: 255 });
        title.position.set(x - 78, 214); app.stage.addChild(title);
      }
      addPreviewCard(app.stage, face, { x, y, width, height: width * 1.4 }, graphics);
    });
    const note = new PIXI.Text(`${context === 'settlement' ? 'Regional settlement · five Practice slots' : 'Practice shop · three offers'}\n${graphics === 'source' ? 'Current game graphics' : 'Prototype graphics'}\n\n${faces.map(face => face.label).join('\n')}\n\nScreen reference with preview cards.\nThe first card follows your edits.`, { fontFamily: 'Georgia', fontSize: 26, fill: 0xd5c7a4, lineHeight: 40, wordWrap: true, wordWrapWidth: 590 });
    note.position.set(context === 'settlement' ? 88 : 1120, context === 'settlement' ? 140 : 255); app.stage.addChild(note);
    host.dataset.context = context; host.dataset.graphics = graphics; host.dataset.cardCount = faces.length;
    app.view.setAttribute('aria-label', `${context === 'settlement' ? 'Regional settlement' : 'Practice shop'}, ${graphics} graphics: ${faces.map(face => face.label).join(', ')}`);
    app.render();
  }
  return { render, destroy() { display.destroy(); app.destroy(true, { children: true }); } };
}
