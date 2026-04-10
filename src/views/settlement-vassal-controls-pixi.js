const PRIMARY_BUTTON_WIDTH = 180;
const PRIMARY_BUTTON_HEIGHT = 88;
const JUMP_BUTTON_WIDTH = 120;
const JUMP_BUTTON_HEIGHT = 42;

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
  bg.lineStyle(2, enabled ? 0x9ec087 : 0x5f5a55, 0.95);
  bg.beginFill(enabled ? fillColor : 0x4a4743, 0.98);
  bg.drawRoundedRect(0, 0, width, height, radius);
  bg.endFill();
}

export function createSettlementVassalControlsView({
  app,
  layer,
  getJumpState,
  onJump,
  getPrimaryState,
  onPrimary,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 6;
  layer?.addChild(root);
  const jumpButton = makeButton(root, "Jump to Death", JUMP_BUTTON_WIDTH, JUMP_BUTTON_HEIGHT, {
    fontSize: 14,
  });
  const primaryButton = makeButton(root, "Intervene", PRIMARY_BUTTON_WIDTH, PRIMARY_BUTTON_HEIGHT, {
    fontSize: 22,
  });
  jumpButton.container.on("pointertap", () => {
    if (getJumpState?.()?.enabled !== true) return;
    onJump?.();
  });
  primaryButton.container.on("pointertap", () => {
    if (getPrimaryState?.()?.enabled !== true) return;
    onPrimary?.();
  });

  function updateButton(button, state, fallbackLabel, drawSpec) {
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
    const screenWidth = Math.floor(app?.screen?.width ?? 2424);
    const screenHeight = Math.floor(app?.screen?.height ?? 1080);
    primaryButton.container.x = screenWidth - PRIMARY_BUTTON_WIDTH - 28;
    primaryButton.container.y = screenHeight - PRIMARY_BUTTON_HEIGHT - 52;
    jumpButton.container.x = screenWidth - JUMP_BUTTON_WIDTH - 58;
    jumpButton.container.y = primaryButton.container.y - JUMP_BUTTON_HEIGHT - 10;
  }

  return {
    init() {
      layout();
    },
    update() {
      layout();
      updateButton(jumpButton, getJumpState?.() ?? null, "Jump to Death", {
        radius: 18,
        fillColor: 0x47513c,
      });
      updateButton(primaryButton, getPrimaryState?.() ?? null, "Intervene", {
        radius: 38,
        fillColor: 0x314c2b,
      });
    },
    getScreenRect: () => (!root.visible || typeof root.getBounds !== "function" ? null : root.getBounds()),
  };
}
