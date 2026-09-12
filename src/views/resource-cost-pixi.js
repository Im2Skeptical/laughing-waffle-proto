import { getResourceTexture, getChronicleTexture } from './chronicle-art.js';
import { getVassalPhaseDurationParts, formatVassalPhaseDuration } from '../model/vassal-life-map.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES, PALETTE } from './settlement-theme.js';

// The approved PNGs remain original assets; Pixi only places/scales their sprites.
export function addResourceIcon(parent, id, x, y, size) {
  if (['trade','knowledge','research','housingCapacity','foodCapacity','activation'].includes(id)) {
    const symbol = new PIXI.Graphics(); symbol.position.set(x-size/2,y-size/2);
    symbol.scale.set(size/32);symbol.lineStyle(2,0xe7ca8c,1);
    if(id==='trade') {
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
  const text = createText(String(value), { ...TEXT_STYLES.body, fontSize, fill }, 0, iconSize / 2, 0, .5);
  root.addChild(text);
  addResourceIcon(root, id, text.width + 6 + iconSize / 2, iconSize / 2, iconSize);
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
    const amount = addResourceAmount(row, id, value, { x: cursor, fontSize, iconSize, fill });
    cursor += amount.width + 14;
  }
  const rowWidth = Math.max(1, cursor - 14);
  const scale = Math.min(1, width / rowWidth, height / iconSize);
  row.scale.set(scale);
  row.position.set(x + (width - rowWidth * scale) / 2, y + (height - iconSize * scale) / 2);
  row.eventMode = 'none';
  parent.addChild(row);
  return row;
}

// One footer for options, shop offers, inspections, and draft receipts. Prices
// remain live text; the entire framed area owns the action, independently of art.
export function addCostPanel(parent, rect, {
  phaseCost = 0, prestigeCost = 0, state = null, selected = false, staged = false,
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
    const frame = new PIXI.NineSlicePlane(texture, 100, 100, 100, 100);
    const scale = .16;
    frame.width = rect.width / scale;
    frame.height = rect.height / scale;
    frame.scale.set(scale);
    frame.eventMode = 'none';
    root.addChild(frame);
  }
  const ink = disabled && !staged && !selected && !unaffordable ? PALETTE.textMuted : PALETTE.text;
  const twoRows = prestigeCost > 0;
  const inset = Math.min(22, rect.width * .055);
  const rowHeight = Math.min(iconSize + 6, twoRows ? rect.height * .44 : rect.height - 16);
  const timeY=twoRows?rect.height*.07:(rect.height-rowHeight)/2;
  const timeWidth=rect.width-inset*2;
  const hourglassWidth=Math.min(timeWidth*.28,rowHeight*1.2);
  const timeFrame=getChronicleTexture('piece-frames-v1/time-group.png');
  if(timeFrame?.baseTexture.valid){
    const graphic=new PIXI.NineSlicePlane(timeFrame,timeFrame.width*.24,8,timeFrame.width*.04,8);
    const frameScale=rowHeight/timeFrame.height;
    graphic.width=timeWidth/frameScale;graphic.height=timeFrame.height;graphic.scale.set(frameScale);
    graphic.position.set(inset,timeY);graphic.eventMode='none';root.addChild(graphic);
  }
  addTimeCostTokens(root, phaseCost, state, {
    x: inset+hourglassWidth, y:timeY+4,
    width: timeWidth-hourglassWidth-6, height: rowHeight-8, fontSize:fontSize*.84, iconSize:iconSize*.8, fill: ink,
  });
  if (twoRows) {
    const divider = new PIXI.Graphics();
    divider.lineStyle(1, 0x829078, .5).moveTo(inset, rect.height * .53).lineTo(rect.width - inset, rect.height * .53);
    root.addChild(divider);
    const amount = addResourceAmount(root, 'prestige', prestigeCost, {
      fontSize: fontSize * .92, iconSize: iconSize * .86, fill: unaffordable ? 0xf0ad97 : ink,
    });
    const scale = Math.min(1, (rect.width - inset * 2) / amount.width, rect.height * .36 / amount.height);
    amount.scale.set(scale);
    amount.position.set((rect.width - amount.width) / 2, rect.height * .72 - amount.height / 2);
  }
  if (selected || staged || unaffordable) {
    const accent = unaffordable ? 0xdb967f : staged ? 0xa4c3c3 : 0xb6ce92;
    const outline = new PIXI.Graphics();
    if (selected || staged) outline.lineStyle(3, accent).drawRect(0, 0, rect.width, rect.height);
    root.addChild(outline, createText(unaffordable ? '!' : '✓', {
      ...TEXT_STYLES.body, fontSize: 27, fill: accent,
    }, rect.width - 12, 7, 1, 0));
  }
  const description = `${formatVassalPhaseDuration(phaseCost, state)}${prestigeCost ? `, ${prestigeCost} Prestige` : ''}`;
  root.accessible = interactive;
  root.accessibleType = 'button';
  root.accessibleTitle = `${label}: ${description}${unaffordable ? ' — not enough Prestige' : ''}`;
  root.costSummary = { phaseCost, prestigeCost, description, selected, staged, disabled, unaffordable };
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
