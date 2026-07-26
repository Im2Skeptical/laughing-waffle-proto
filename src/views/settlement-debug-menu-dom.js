import { createMapLabDom } from "./map-lab-dom.js";

export function createSettlementDebugMenuDom({ mapLabController } = {}) {
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Debug";
  openButton.dataset.testid = "debug-open";
  openButton.style.cssText = [
    "position:fixed", "right:12px", "top:10px", "z-index:1000",
    "min-height:34px", "padding:5px 12px", "border-radius:6px",
    "border:1px solid #d7b450", "background:#384755", "color:#f6efe3",
  ].join(";");

  const panel = document.createElement("section");
  panel.className = "codex-debug-panel";
  panel.style.cssText = [
    "display:none", "position:fixed", "inset:8px", "z-index:999",
    "overflow:auto", "padding:12px", "border:1px solid #d7b450",
    "border-radius:8px", "background:#252c33",
  ].join(";");

  const header = document.createElement("header");
  header.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:10px";
  const title = document.createElement("strong");
  title.textContent = "Development Tools";
  const mapLabTab = document.createElement("button");
  mapLabTab.type = "button";
  mapLabTab.textContent = "Map Lab";
  mapLabTab.dataset.testid = "debug-map-lab-tab";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.style.marginLeft = "auto";
  header.append(title, mapLabTab, close);
  panel.append(header);

  const mapLab = createMapLabDom({
    controller: mapLabController,
    onRequestClose: () => {
      panel.style.display = "none";
      openButton.style.display = "";
    },
  });
  panel.append(mapLab.element);
  let initialized = false;

  function open() {
    panel.style.display = "block";
    openButton.style.display = "none";
    panel.classList.add("map-lab-active");
    mapLab.render();
  }

  openButton.addEventListener("click", open);
  mapLabTab.addEventListener("click", open);
  close.addEventListener("click", () => {
    panel.style.display = "none";
    openButton.style.display = "";
  });

  return {
    init() {
      if (initialized) return;
      initialized = true;
      document.body.append(openButton, panel);
      mapLab.init();
    },
    update() {},
    refresh() {
      if (panel.style.display !== "none") mapLab.render();
    },
    destroy() {
      mapLab.destroy();
      openButton.remove();
      panel.remove();
    },
  };
}
