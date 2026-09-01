const SKIN = Object.freeze({
  umber: 0x6f4632, sienna: 0x915b3f, ochre: 0xb8784f,
  olive: 0xb08b65, rose: 0xc89578, ivory: 0xe2bea0,
});
const HAIR = Object.freeze({
  black: 0x211d1c, brown: 0x4b3026, auburn: 0x75402d,
  gold: 0xb99757, silver: 0xb7b2aa,
});
const CLOTHING = Object.freeze({
  red: 0x8f4d46, blue: 0x4c6986, green: 0x506d52,
  gold: 0x9a7941, purple: 0x675575, charcoal: 0x48494a,
});

function drawHair(gfx, portrait, center, headWidth, headTop, headHeight) {
  const color = HAIR[portrait?.hairColor] ?? HAIR.brown;
  gfx.beginFill(color, 1);
  if (portrait?.hairStyle === "shaved") {
    gfx.drawEllipse(center, headTop + headHeight * 0.22, headWidth * 0.47, headHeight * 0.2);
  } else if (portrait?.hairStyle === "long") {
    gfx.drawRoundedRect(center - headWidth * 0.58, headTop + headHeight * 0.08,
      headWidth * 1.16, headHeight * 1.12, headWidth * 0.38);
  } else if (portrait?.hairStyle === "braids") {
    gfx.drawEllipse(center, headTop + headHeight * 0.18, headWidth * 0.58, headHeight * 0.27);
    gfx.drawRoundedRect(center - headWidth * 0.61, headTop + headHeight * 0.3,
      headWidth * 0.16, headHeight * 0.9, headWidth * 0.08);
    gfx.drawRoundedRect(center + headWidth * 0.45, headTop + headHeight * 0.3,
      headWidth * 0.16, headHeight * 0.9, headWidth * 0.08);
  } else if (portrait?.hairStyle === "coils") {
    for (let index = 0; index < 7; index += 1) {
      const angle = Math.PI + index * Math.PI / 6;
      gfx.drawCircle(center + Math.cos(angle) * headWidth * 0.48,
        headTop + headHeight * 0.32 + Math.sin(angle) * headHeight * 0.25, headWidth * 0.18);
    }
  } else if (portrait?.hairStyle === "waves") {
    gfx.drawEllipse(center, headTop + headHeight * 0.2, headWidth * 0.62, headHeight * 0.3);
    gfx.drawCircle(center - headWidth * 0.52, headTop + headHeight * 0.42, headWidth * 0.17);
    gfx.drawCircle(center + headWidth * 0.52, headTop + headHeight * 0.42, headWidth * 0.17);
  } else {
    gfx.drawEllipse(center, headTop + headHeight * 0.2, headWidth * 0.56, headHeight * 0.28);
  }
  gfx.endFill();
}

export function createVassalPortraitView(portrait, { size = 96, borderColor = 0xe3c46c } = {}) {
  const root = new PIXI.Container();
  const gfx = new PIXI.Graphics();
  const center = size / 2;
  gfx.lineStyle(Math.max(2, size * 0.035), borderColor, 1)
    .beginFill(0x28302c, 1).drawCircle(center, center, size * 0.48).endFill();

  const clothing = CLOTHING[portrait?.clothingColor] ?? CLOTHING.green;
  gfx.beginFill(clothing, 1)
    .drawEllipse(center, size * 0.91, size * 0.38, size * 0.29).endFill();

  const headWidth = portrait?.faceShape === "round" ? size * 0.3
    : portrait?.faceShape === "angular" ? size * 0.265 : size * 0.28;
  const headHeight = portrait?.faceShape === "round" ? size * 0.37 : size * 0.42;
  const headTop = size * 0.24;
  drawHair(gfx, portrait, center, headWidth, headTop, headHeight);
  gfx.beginFill(SKIN[portrait?.skinTone] ?? SKIN.ochre, 1)
    .drawEllipse(center, headTop + headHeight * 0.56, headWidth, headHeight).endFill();

  const eyeY = headTop + headHeight * 0.48;
  gfx.beginFill(0x231f1c, 1)
    .drawCircle(center - headWidth * 0.38, eyeY, size * 0.024)
    .drawCircle(center + headWidth * 0.38, eyeY, size * 0.024).endFill();
  gfx.lineStyle(Math.max(1, size * 0.018), 0x6d3f35, 0.95);
  const mouthY = headTop + headHeight * 0.88;
  if (portrait?.expression === "bright") {
    gfx.arc(center, mouthY - size * 0.03, size * 0.09, 0.25, Math.PI - 0.25);
  } else if (portrait?.expression === "stern") {
    gfx.moveTo(center - size * 0.07, mouthY).lineTo(center + size * 0.07, mouthY - size * 0.01);
  } else {
    gfx.moveTo(center - size * 0.055, mouthY).lineTo(center + size * 0.055, mouthY);
  }

  gfx.lineStyle(Math.max(2, size * 0.025), 0xd7bd72, 1);
  if (portrait?.accessory === "band") {
    gfx.moveTo(center - headWidth * 0.82, headTop + headHeight * 0.28)
      .lineTo(center + headWidth * 0.82, headTop + headHeight * 0.28);
  } else if (portrait?.accessory === "pin") {
    gfx.beginFill(0xd7bd72, 1).drawCircle(center + headWidth * 0.78,
      headTop + headHeight * 0.24, size * 0.045).endFill();
  } else if (portrait?.accessory === "earring") {
    gfx.drawCircle(center + headWidth * 0.9, headTop + headHeight * 0.68, size * 0.04);
  } else if (portrait?.accessory === "beads") {
    for (let index = -2; index <= 2; index += 1) {
      gfx.beginFill(0xd7bd72, 1).drawCircle(center + index * size * 0.045,
        headTop + headHeight * 1.34 + Math.abs(index) * size * 0.012, size * 0.018).endFill();
    }
  }
  root.addChild(gfx);
  root.hitArea = new PIXI.Circle(center, center, size * 0.5);
  return root;
}
