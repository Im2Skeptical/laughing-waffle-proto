import { getVassalAge } from "../../model/vassal-life-map.js";
import { addResourceIcon } from '../resource-cost-pixi.js';
import { createText } from "../settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "../settlement-theme.js";
import {
  CURRENCY_COLOURS,
  PRESSURE_COLOURS,
} from "./constants.js";

export function addCrownCapitalMarker(parent, point, tooltipView) {
  const marker=new PIXI.Container();marker.label='crown-capital-marker';
  marker.position.set(point.x+38,point.y-50);
  marker.addChild(new PIXI.Graphics().lineStyle(2,0xd3a17b).beginFill(0x211b22,.95).drawCircle(0,0,19).endFill());
  addResourceIcon(marker,'crown',0,0,29);
  marker.eventMode='static';marker.cursor='help';marker.hitArea=new PIXI.Circle(0,0,23);
  const spec={title:'Crown capital',lines:['The Unbending Crown rules from this stronghold.','Its surrounding provinces share the Crown border.'],maxWidth:300};
  marker.on('pointerover',()=>tooltipView?.show?.(spec,marker.getBounds(),{dismissOnExit:true}));
  marker.on('pointerout',()=>tooltipView?.hide?.());
  marker.on('pointerdown',e=>{e.stopPropagation();tooltipView?.pin?.(spec,marker.getBounds(),'crown-capital');});
  parent.addChild(marker);return marker;
}

export function addActiveVassalMarker(parent, point, vassal, state) {
  const marker = new PIXI.Graphics();
  marker.lineStyle(4, 0x2b2721, 1);
  marker.beginFill(0x87c96a, 1);
  marker.drawCircle(point.x, point.y - 50, 18);
  marker.endFill();
  marker.lineStyle(3, 0xf4e7bd, 1);
  marker.drawCircle(point.x, point.y - 50, 11);
  marker.moveTo(point.x, point.y - 66);
  marker.lineTo(point.x, point.y - 35);
  marker.moveTo(point.x - 10, point.y - 50);
  marker.lineTo(point.x + 10, point.y - 50);
  marker.eventMode = "none";
  parent.addChild(
    marker,
    createText("VASSAL", {
      ...TEXT_STYLES.chip,
      fontSize: 11,
      fill: 0xf4e7bd,
    }, point.x, point.y - 79, 0.5, 0.5),
    createText(`Age ${getVassalAge(state, vassal)}`, {
      ...TEXT_STYLES.body,
      fontSize: 10,
      fill: PALETTE.text,
    }, point.x, point.y - 22, 0.5, 0.5)
  );
}

export function addSettlementStarvationIndicator(parent, point, pressure) {
  if (!pressure?.starvation) return;
  const x=point.x,y=point.y-70,glyph=new PIXI.Graphics();
  glyph.lineStyle(2,0x302d2a).beginFill(PRESSURE_COLOURS.starvation)
    .drawPolygon([x,y-13,x-13,y+11,x+13,y+11]).endFill();
  glyph.eventMode='none';
  parent.addChild(glyph,createText('!',{...TEXT_STYLES.title,fontSize:16,fill:PALETTE.text},x,y+3,.5,.5));
}
export function addSettlementCurrencyIndicator(parent, point, { currency, currencySpent } = {}) {
  if (!Number.isFinite(currency)) return;
  const spending = Number(currencySpent ?? 0) > 0;
  const empty = currency <= 0;
  if (!spending && !empty) return;
  const kinds = [spending ? "spending" : null, empty ? "empty" : null].filter(Boolean);
  const gap = 30;
  const startX = point.x - ((kinds.length - 1) * gap) / 2;
  const y = point.y - 102;
  kinds.forEach((kind, index) => {
    const x = startX + index * gap;
    const glyph = new PIXI.Graphics();
    glyph.lineStyle(2, 0x302d2a, 1);
    glyph.beginFill(CURRENCY_COLOURS[kind], 1);
    glyph.drawCircle(x, y, 12);
    glyph.endFill();
    glyph.lineStyle(2.5, 0x302d2a, 1);
    if (kind === "spending") {
      glyph.moveTo(x, y - 7);
      glyph.lineTo(x, y + 6);
      glyph.moveTo(x - 5, y + 1);
      glyph.lineTo(x, y + 6);
      glyph.lineTo(x + 5, y + 1);
    } else {
      glyph.moveTo(x - 7, y - 7);
      glyph.lineTo(x + 7, y + 7);
    }
    glyph.eventMode = "none";
    parent.addChild(glyph);
  });
}
