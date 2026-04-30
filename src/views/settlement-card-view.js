import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import { GAMEPIECE_HOVER_SCALE } from "./layout-pixi.js";
import { getPracticeDrainColor } from "./settlement-agenda-view.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { createText, roundedRect } from "./settlement-view-primitives.js";

function measureTextWidth(label, style) {
  const text = new PIXI.Text(String(label ?? ""), style);
  const width = text.width;
  text.destroy?.();
  return width;
}

function fitTitleFontSize(title, style, maxWidth, preferredFontSize, minFontSize) {
  const words = String(title ?? "")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const longestWord = words.reduce(
    (best, word) => (word.length > best.length ? word : best),
    String(title ?? "")
  );
  const preferred = Math.max(1, Math.floor(preferredFontSize));
  const min = Math.max(1, Math.min(preferred, Math.floor(minFontSize)));
  const width = Math.max(1, Math.floor(maxWidth));
  for (let fontSize = preferred; fontSize > min; fontSize -= 1) {
    if (measureTextWidth(longestWord, { ...style, fontSize }) <= width) {
      return fontSize;
    }
  }
  return min;
}

function getTitleTextStyle(title, rect, showBody, options = {}) {
  const titlePadding = Number.isFinite(options.titlePadding)
    ? Math.max(4, Math.floor(options.titlePadding))
    : rect.width < 112
      ? 5
      : 12;
  const preferredFontSize = Number.isFinite(options.titleFontSize)
    ? Math.max(1, Math.floor(options.titleFontSize))
    : showBody
      ? TEXT_STYLES.cardTitle.fontSize
      : rect.width < 112
        ? 15
        : rect.width < 152
          ? 16
          : 17;
  const minFontSize = Number.isFinite(options.titleMinFontSize)
    ? Math.max(1, Math.floor(options.titleMinFontSize))
    : showBody
      ? 12
      : rect.width < 112
        ? 9
        : 11;
  const wordWrapWidth = Math.max(1, rect.width - titlePadding * 2);
  const fontSize = fitTitleFontSize(
    title,
    TEXT_STYLES.cardTitle,
    wordWrapWidth,
    preferredFontSize,
    minFontSize
  );
  return {
    x: titlePadding,
    y: showBody
      ? 14
      : Number.isFinite(options.titleYOffset)
        ? options.titleYOffset
        : rect.width < 112
          ? 8
          : titlePadding,
    style: {
      ...TEXT_STYLES.cardTitle,
      fontSize,
      wordWrap: true,
      breakWords: true,
      wordWrapWidth,
      lineHeight: Number.isFinite(options.titleLineHeight)
        ? Math.max(fontSize + 1, Math.floor(options.titleLineHeight))
        : fontSize + (showBody ? 3 : 2),
    },
  };
}

export function drawCard(
  container,
  rect,
  title,
  lines,
  fill,
  outline = PALETTE.stroke,
  bodyStyleOverrides = null,
  opts = null
) {
  const options = opts && typeof opts === "object" ? opts : {};
  const showBody = options.showBody !== false;
  const tooltipView = options.tooltipView ?? null;
  const tooltipSpec =
    options.tooltipSpec && typeof options.tooltipSpec === "object" ? options.tooltipSpec : null;
  const edgeColor = Number.isFinite(options.edgeColor) ? Math.floor(options.edgeColor) : null;
  const edgeStrokeWidth = Number.isFinite(options.edgeStrokeWidth)
    ? Math.max(1, Math.floor(options.edgeStrokeWidth))
    : 5;
  const safeLines = Array.isArray(lines) ? lines : [];
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;

  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 22, fill, outline, 3);
  root.addChild(gfx);

  if (edgeColor != null) {
    const edge = new PIXI.Graphics();
    const inset = edgeStrokeWidth * 0.5;
    edge.lineStyle(edgeStrokeWidth, edgeColor, 0.96);
    edge.drawRoundedRect(
      inset,
      inset,
      Math.max(1, rect.width - edgeStrokeWidth),
      Math.max(1, rect.height - edgeStrokeWidth),
      Math.max(1, 22 - inset)
    );
    root.addChild(edge);
  }

  const titleLayout = getTitleTextStyle(title, rect, showBody, options);
  const titleText = createText(title, titleLayout.style, titleLayout.x, titleLayout.y);
  root.addChild(titleText);

  if (showBody) {
    const body = createText(
      safeLines.join("\n"),
      {
        ...TEXT_STYLES.body,
        fontSize: 13,
        wordWrap: true,
        wordWrapWidth: rect.width - 32,
        lineHeight: 18,
        ...(bodyStyleOverrides && typeof bodyStyleOverrides === "object"
          ? bodyStyleOverrides
          : {}),
      },
      16,
      44
    );
    root.addChild(body);
  }

  if (tooltipView && (tooltipSpec || safeLines.length > 0)) {
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
    root.on("pointerenter", () => {
      const anchor =
        tooltipView.getAnchorRectForDisplayObject?.(root, "parent") ?? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          coordinateSpace: "parent",
        };
      const scale = Math.max(
        Number.isFinite(GAMEPIECE_HOVER_SCALE) ? GAMEPIECE_HOVER_SCALE : 1,
        tooltipView.getRelativeDisplayScale?.(root, 1) ?? 1
      );
      tooltipView.show?.(
        tooltipSpec
          ? { ...tooltipSpec, scale }
          : {
              title,
              lines: safeLines,
              maxWidth: 300,
              scale,
            },
        anchor
      );
    });
    root.on("pointerleave", () => {
      tooltipView.hide?.();
    });
  }

  container.addChild(root);
  return root;
}

function isMissionPractice(card) {
  return settlementPracticeDefs?.[card?.defId]?.completionBehavior === "removePractice";
}

export function drawPracticeCard(
  container,
  rect,
  card,
  title,
  lines,
  fill,
  outline = PALETTE.stroke,
  opts = null
) {
  const options = opts && typeof opts === "object" ? opts : {};
  const showBody = options.showBody !== false;
  const tooltipView = options.tooltipView ?? null;
  const def = settlementPracticeDefs[card?.defId];
  const practiceMode = def?.practiceMode === "passive" ? "passive" : "active";
  const runtime =
    card?.props?.settlement && typeof card.props.settlement === "object"
      ? card.props.settlement
      : {};
  const root = new PIXI.Container();
  root.x = rect.x;
  root.y = rect.y;
  const isMission = isMissionPractice(card);
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx,
    0,
    0,
    rect.width,
    rect.height,
    practiceMode === "passive" ? 16 : 22,
    fill,
    outline,
    practiceMode === "passive" ? 4 : 3
  );
  root.addChild(gfx);

  if (isMission) {
    const missionFrame = new PIXI.Graphics();
    roundedRect(
      missionFrame,
      6,
      6,
      rect.width - 12,
      rect.height - 12,
      practiceMode === "passive" ? 12 : 18,
      PALETTE.missionFill,
      PALETTE.mission,
      2,
      0.08,
      0.9
    );
    root.addChild(missionFrame);
  }

  if (
    (runtime.activeReservation === true || runtime.activeProgressKind === "cadence") &&
    Number.isFinite(runtime.activeProgressRemaining)
  ) {
    const innerX = 4;
    const innerY = 4;
    const innerWidth = Math.max(0, rect.width - 8);
    const innerHeight = Math.max(0, rect.height - 8);
    const fillHeight = innerHeight * Math.max(0, Math.min(1, runtime.activeProgressRemaining));

    const drainFill = new PIXI.Graphics();
    roundedRect(
      drainFill,
      innerX,
      innerY,
      innerWidth,
      innerHeight,
      practiceMode === "passive" ? 12 : 18,
      getPracticeDrainColor(card),
      outline,
      0,
      0.42,
      0
    );
    root.addChild(drainFill);

    const drainMask = new PIXI.Graphics();
    if (fillHeight > 0.0001) {
      const drainY = innerY + innerHeight - fillHeight;
      drainMask.beginFill(PALETTE.hitArea, 1);
      drainMask.drawRect(innerX, drainY, innerWidth, fillHeight + 1);
      drainMask.endFill();
    }
    root.addChild(drainMask);
    drainFill.mask = drainMask;
  }

  const titleLayout = getTitleTextStyle(title, rect, showBody, options);
  const titleText = createText(title, titleLayout.style, titleLayout.x, titleLayout.y);
  root.addChild(titleText);

  if (isMission) {
    const badgeWidth = 70;
    const badgeHeight = 18;
    const badgeX = rect.width - badgeWidth - 12;
    const badge = new PIXI.Graphics();
    roundedRect(
      badge,
      badgeX,
      12,
      badgeWidth,
      badgeHeight,
      9,
      PALETTE.missionSoft,
      PALETTE.mission,
      1
    );
    root.addChild(badge);
    root.addChild(
      createText(
        "MISSION",
        {
          ...TEXT_STYLES.muted,
          fontSize: 10,
          fontWeight: "bold",
          fill: PALETTE.accent,
        },
        badgeX + badgeWidth * 0.5,
        12 + badgeHeight * 0.5,
        0.5,
        0.5
      )
    );
  }

  if (showBody) {
    const body = createText(
      lines.join("\n"),
      {
        ...TEXT_STYLES.body,
        fontSize: 13,
        wordWrap: true,
        wordWrapWidth: rect.width - 28,
        lineHeight: 18,
      },
      14,
      48
    );
    root.addChild(body);
  }

  if (tooltipView && Array.isArray(lines) && lines.length > 0) {
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
    root.on("pointerenter", () => {
      const anchor =
        tooltipView.getAnchorRectForDisplayObject?.(root, "parent") ?? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          coordinateSpace: "parent",
        };
      tooltipView.show?.(
        {
          title,
          lines,
          maxWidth: 300,
          scale: Math.max(
            Number.isFinite(GAMEPIECE_HOVER_SCALE) ? GAMEPIECE_HOVER_SCALE : 1,
            tooltipView.getRelativeDisplayScale?.(root, 1) ?? 1
          ),
        },
        anchor
      );
    });
    root.on("pointerleave", () => {
      tooltipView.hide?.();
    });
  }

  container.addChild(root);
  return root;
}
