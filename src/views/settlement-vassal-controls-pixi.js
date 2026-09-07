import { paintRelicPanel, RELIC, drawHourglass } from './chronicle-skin.js';
const PRIMARY_BUTTON_WIDTH = 308;
const PRIMARY_BUTTON_HEIGHT = 98;

function makeButton(root, label, width, height, textStyle = {}) {
  const container = new PIXI.Container();
  const bg = new PIXI.Graphics();
  const text = new PIXI.Text(label, {
    fontFamily: "Georgia",
    fontSize: 17,
    fontWeight: "bold",
    fill: 0xf7f2e9,
    ...textStyle,
  });
  text.anchor.set(0.5);
  text.x = width * 0.5;
  text.y = height * 0.5;
  container.addChild(bg, text);
  container.eventMode = "static";
  root.addChild(container);
  return { container, bg, text, width, height };
}

function drawButton(bg, enabled, width, height, radius, fillColor) {
  bg.clear();
  paintRelicPanel(bg,0,0,width,height,enabled?RELIC.raised:RELIC.stone,enabled?RELIC.gold:RELIC.brass,3);
  drawHourglass(bg,width/2,18,17,RELIC.gold);
}

export function createSettlementVassalControlsView({
  app,
  layer,
  getPrimaryState,
  onPrimary,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 20;
  layer?.addChild(root);
  const primaryButton = makeButton(root, "Intervene", PRIMARY_BUTTON_WIDTH, PRIMARY_BUTTON_HEIGHT, {
    fontSize: 27,
  });
  primaryButton.container.on("pointertap", (event) => {
    event?.stopPropagation?.();
    if (getPrimaryState?.()?.enabled !== true) return;
    onPrimary?.();
  });

  function updateButton(button, state, fallbackLabel, drawSpec) {
    button.container.visible = state?.visible !== false;
    if (!button.container.visible) return;
    const enabled = state?.enabled === true;
    button.container.eventMode = enabled ? "static" : "none";
    button.container.cursor = enabled ? "pointer" : "default";
    button.text.text = typeof state?.label === "string" && state.label.length > 0 ? state.label : fallbackLabel;
    drawButton(
      button.bg,
      enabled,
      button.width,
      button.height,
      drawSpec.radius,
      drawSpec.fillColor
    );
  }

  function layout() {
    const screenHeight = Math.floor(app?.screen?.height ?? 1080);
    primaryButton.container.x = 28;
    primaryButton.container.y = screenHeight - PRIMARY_BUTTON_HEIGHT - 52;
  }

  return {
    init() {
      layout();
    },
    update() {
      if (!root.visible) return;
      layout();
      updateButton(primaryButton, getPrimaryState?.() ?? null, "Intervene", {
        radius: 38,
        fillColor: 0x314c2b,
      });
    },
    setVisible: (visible) => { root.visible = visible === true; },
    getScreenRect: () => (!root.visible || typeof root.getBounds !== "function" ? null : root.getBounds()),
    getPrimaryClickPoint: () => primaryButton.container?.toGlobal
      ? primaryButton.container.toGlobal(new PIXI.Point(PRIMARY_BUTTON_WIDTH * 0.5, PRIMARY_BUTTON_HEIGHT * 0.5))
      : null,
  };
}
