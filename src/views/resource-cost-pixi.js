import { getResourceTexture, getChronicleTexture } from './chronicle-art.js';
import { getVassalPhaseDurationParts, formatVassalPhaseDuration } from '../model/vassal-life-map.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES, PALETTE } from './settlement-theme.js';

// The approved PNGs remain original assets; Pixi only places/scales their sprites.
export function addResourceIcon(parent, id, x, y, size) {
  if (['trade','knowledge','research','housingCapacity','foodCapacity','population','hourglass','activation'].includes(id)) {
    const symbol = new PIXI.Graphics(); symbol.position.set(x-size/2,y-size/2);
    symbol.scale.set(size/32);symbol.lineStyle(2,0xe7ca8c,1);
    if(id==='population') {
      symbol.beginFill(0xe7ca8c).drawCircle(16,7,4).drawCircle(5,11,3).drawCircle(27,11,3).endFill();
      symbol.drawRoundedRect(10,14,12,15,4).drawRoundedRect(0,17,7,11,3).drawRoundedRect(25,17,7,11,3);
    } else if(id==='hourglass') {
      symbol.moveTo(7,3).lineTo(25,3).moveTo(7,29).lineTo(25,29);
      symbol.moveTo(9,4).lineTo(9,10).lineTo(22,22).lineTo(22,28).moveTo(23,4).lineTo(23,10).lineTo(10,22).lineTo(10,28);
      symbol.beginFill(0xe7ca8c,.7).drawPolygon([11,25,21,25,16,19]).endFill();
    } else if(id==='trade') {
      symbol.moveTo(4,10).lineTo(27,10).lineTo(22,5).moveTo(27,10).lineTo(22,15);
      symbol.moveTo(28,23).lineTo(5,23).lineTo(10,18).moveTo(5,23).lineTo(10,28);
    } else if(id==='knowledge'||id==='research') {
      symbol.beginFill(0x617e87,.8).drawPolygon([3,6,15,9,15,28,3,25]).drawPolygon([17,9,29,6,29,25,17,28]).endFill();
      if(id==='research')symbol.moveTo(11,3).lineTo(21,3).moveTo(16,0).lineTo(16,6);
    } else if(id==='housingCapacity') {
      symbol.moveTo(2,16).lineTo(16,4).lineTo(30,16).moveTo(7,13).lineTo(7,28).lineTo(25,28).lineTo(25,13);
    } else if(id==='foodCapacity') {
      symbol.drawRoundedRect(6,7,20,21,3).moveTo(6,13).lineTo(26,13).moveTo(12,3).lineTo(20,3);
    } else symbol.beginFill(0xf7df92).drawPolygon([16,1,20,12,30,16,20,20,16,31,12,20,2,16,12,12]).endFill();
    symbol.eventMode='none';parent.addChild(symbol);return symbol;
  }
  const texture = getResourceTexture(id);
  const sprite = new PIXI.Sprite(texture ?? PIXI.Texture.EMPTY);
  sprite.anchor.set(.5);
  sprite.position.set(x, y);
  sprite.width = sprite.height = size;
  sprite.eventMode = 'none';
  parent.addChild(sprite);
  return sprite;
}

export function addResourceAmount(parent, id, value, {
  x = 0, y = 0, fontSize = 36, iconSize = 46, fill = PALETTE.text,
} = {}) {
  const root = new PIXI.Container();
  root.position.set(x, y);
  const text = createText(String(value), { ...TEXT_STYLES.body, fontSize, fill }, iconSize + 6, iconSize / 2, 0, .5);
  root.addChild(text);
  addResourceIcon(root, id, iconSize / 2, iconSize / 2, iconSize);
  root.eventMode = 'none';
  parent.addChild(root);
  return root;
}

export function addTimeCostTokens(parent, phaseCost, state, {
  x = 0, y = 0, width = 300, height = 58, fontSize = 40, iconSize = 52, fill = PALETTE.text,
} = {}) {
  const parts = getVassalPhaseDurationParts(phaseCost, state);
  const units = [['year', parts.years], ['moon', parts.moons], ['phase', parts.phases]].filter(([, n]) => n > 0);
  if (!units.length) units.push(['phase', 0]);
  const row = new PIXI.Container();
  let cursor = 0;
  for (const [id, value] of units) {
    const size=iconSize*1.25;
    const coin=new PIXI.Container();coin.position.set(cursor,0);
    const texture=getChronicleTexture(`piece-frames-v1/time-${id}.png`);
    const token=new PIXI.Sprite(texture??PIXI.Texture.EMPTY);token.width=token.height=size;token.eventMode='none';coin.addChild(token);
    const valueText=createText(String(value),{...TEXT_STYLES.chip,fontSize:fontSize*.85,fill,stroke:0x101916,strokeThickness:3},size/2,size/2,.5,.5);
    valueText.scale.set(Math.min(1,size*.64/Math.max(1,valueText.width)));
    coin.addChild(valueText);row.addChild(coin);
    if(cursor>0)row.addChild(new PIXI.Graphics().beginFill(0xb69c63,.8).drawCircle(cursor-8,size/2,2).endFill());
    cursor += size + 16;
  }
  const rowWidth = Math.max(1, cursor - 16), rowHeight=iconSize*1.25;
  const scale = Math.min(1, width / rowWidth, height / rowHeight);
  row.scale.set(scale);
  row.position.set(x + (width - rowWidth * scale) / 2, y + (height - rowHeight * scale) / 2);
  row.eventMode = 'none';
  parent.addChild(row);
  return row;
}

// One footer for options, shop offers, inspections, and draft receipts. Prices
// remain live text; the entire framed area owns the action, independently of art.
export function addCostPanel(parent, rect, {
  phaseCost = 0, prestigeCost = 0, currencyCost = 0, state = null, selected = false, staged = false,
  disabled = false, unaffordable = false, label = 'Choose', onActivate, onUnavailable,
  interactive = true, fontSize = 40, iconSize = 52,
} = {}) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  const background = new PIXI.Graphics();
  background.beginFill(0x17211f).drawRect(0, 0, rect.width, rect.height).endFill();
  root.addChild(background);
  const texture = getResourceTexture('cost-frame');
  if (texture?.baseTexture.valid) {
    const corner=texture.height*.3;
    const frame = new PIXI.NineSlicePlane(texture, corner, corner, corner, corner);
    // Atlas resolution changes source-space dimensions. Specify the visible
    // corner size, leaving a stretchable center even on single-row footers.
    const scale = 14/corner;
    frame.width = rect.width / scale;
    frame.height = rect.height / scale;
    frame.scale.set(scale);
    frame.eventMode = 'none';
    root.addChild(frame);
  }
  const ink = disabled && !staged && !selected && !unaffordable ? PALETTE.textMuted : PALETTE.text;
  const resourceCosts = [
    prestigeCost > 0 ? { id: 'prestige', value: prestigeCost } : null,
    currencyCost > 0 ? { id: 'money', value: currencyCost } : null,
  ].filter(Boolean);
  const hasResources = resourceCosts.length > 0;
  const inset = Math.min(22, rect.width * .055);
  const gap=hasResources?8:0;
  const resourceHeight=hasResources?Math.min(iconSize*.8,(rect.height-32)*.48/resourceCosts.length):0;
  const resourcesTotal=resourceCosts.length*resourceHeight+Math.max(0,resourceCosts.length-1)*gap;
  const rowHeight=Math.min(iconSize*1.25,hasResources?(rect.height-24-resourcesTotal-gap)*.9:rect.height-24);
  const timeY=Math.max(8,(rect.height-rowHeight-resourcesTotal-gap)/2);
  const hourglass=addResourceIcon(root,'hourglass',13,timeY+rowHeight/2,Math.min(24,rowHeight*.42));hourglass.alpha=.65;
  addTimeCostTokens(root, phaseCost, state, {
    x: 30, y:timeY,
    width: rect.width-60, height: rowHeight, fontSize, iconSize, fill: ink,
  });
  if (hasResources) {
    resourceCosts.forEach((resource, index) => {
      const y = timeY + rowHeight + gap + index * (resourceHeight + gap);
      const divider = new PIXI.Graphics();
      divider.lineStyle(1, 0x829078, .3).moveTo(inset, y-gap/2).lineTo(rect.width - inset, y-gap/2);
      root.addChild(divider);
      const amount = addResourceAmount(root, resource.id, resource.value, {
        fontSize: fontSize * .82, iconSize: iconSize * .76, fill: unaffordable ? 0xf0ad97 : ink,
      });
      const scale = Math.min(1, (rect.width - inset * 2) / amount.width, resourceHeight / amount.height);
      amount.scale.set(scale);
      amount.position.set((rect.width - amount.width * scale) / 2,
        y + (resourceHeight - amount.height * scale) / 2);
    });
  }
  if (selected || staged || unaffordable) {
    const accent = unaffordable ? 0xdb967f : staged ? 0xa4c3c3 : 0xb6ce92;
    const outline = new PIXI.Graphics();
    if (selected || staged) outline.lineStyle(3, accent).drawRect(0, 0, rect.width, rect.height);
    root.addChild(outline, createText(unaffordable ? '!' : '✓', {
      ...TEXT_STYLES.body, fontSize: 27, fill: accent,
    }, rect.width - 12, 7, 1, 0));
  }
  const description = `${formatVassalPhaseDuration(phaseCost, state)}${prestigeCost ? `, ${prestigeCost} Prestige` : ''}${currencyCost ? `, ${currencyCost} Gold` : ''}`;
  root.accessible = interactive;
  root.accessibleType = 'button';
  root.accessibleTitle = `${label}: ${description}${unaffordable ? ' — cost unavailable' : ''}`;
  root.costSummary = { phaseCost, prestigeCost, currencyCost, description, selected, staged, disabled, unaffordable };
  root.eventMode = interactive ? 'static' : 'none';
  root.cursor = disabled ? 'default' : 'pointer';
  root.on('pointertap', event => {
    event.stopPropagation();
    if (disabled) onUnavailable?.();
    else onActivate?.();
  });
  parent.addChild(root);
  return root;
}
