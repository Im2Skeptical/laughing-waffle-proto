const BUTTON_WIDTH = 132;
const BUTTON_HEIGHT = 54;

function makeButton(root, label) {
  const container = new PIXI.Container();
  const bg = new PIXI.Graphics();
  const text = new PIXI.Text(label, {
    fontFamily: "Georgia",
    fontSize: 17,
    fontWeight: "bold",
    fill: 0xf7f2e9,
  });
  text.anchor.set(0.5);
  text.x = BUTTON_WIDTH * 0.5;
  text.y = BUTTON_HEIGHT * 0.5;
  container.addChild(bg, text);
  container.eventMode = "static";
  root.addChild(container);
  return { container, bg, text };
}

function drawButton(bg, enabled) {
  bg.clear();
  bg.lineStyle(2, enabled ? 0x9ec087 : 0x5f5a55, 0.95);
  bg.beginFill(enabled ? 0x314c2b : 0x4a4743, 0.98);
  bg.drawRoundedRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 20);
  bg.endFill();
}

export function createSettlementVassalControlsView({
  app,
  layer,
  getSkipState,
  onSkip,
  getNextState,
  onNext,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 6;
  layer?.addChild(root);
  const skipButton = makeButton(root, "Skip to Death");
  const nextButton = makeButton(root, "Next Vassal");
  skipButton.container.on("pointertap", () => {
    if (getSkipState?.()?.enabled !== true) return;
    onSkip?.();
  });
  nextButton.container.on("pointertap", () => {
    if (getNextState?.()?.enabled !== true) return;
    onNext?.();
  });

  function updateButton(button, state, fallbackLabel) {
    const enabled = state?.enabled === true;
    button.container.eventMode = enabled ? "static" : "none";
    button.container.cursor = enabled ? "pointer" : "default";
    button.text.text = typeof state?.label === "string" && state.label.length > 0 ? state.label : fallbackLabel;
    drawButton(button.bg, enabled);
  }

  function layout() {
    const screenWidth = Math.floor(app?.screen?.width ?? 2424);
    const screenHeight = Math.floor(app?.screen?.height ?? 1080);
    nextButton.container.x = screenWidth - BUTTON_WIDTH - 26;
    nextButton.container.y = screenHeight - 116;
    skipButton.container.x = screenWidth - BUTTON_WIDTH - 26;
    skipButton.container.y = screenHeight - 52;
  }

  return {
    init() {
      layout();
    },
    update() {
      layout();
      updateButton(skipButton, getSkipState?.() ?? null, "Skip to Death");
      updateButton(nextButton, getNextState?.() ?? null, "Next Vassal");
    },
    getScreenRect: () => (!root.visible || typeof root.getBounds !== "function" ? null : root.getBounds()),
  };
}
