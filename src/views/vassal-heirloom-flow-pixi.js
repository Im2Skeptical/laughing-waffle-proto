import { FAITH_TIER_COLORS, PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import {
  getHeirloomInheritanceLabel,
  getHeirloomQualityLabel,
} from "../defs/gamepieces/vassal-heirloom-defs.js";
import { presentHeirloom } from "../model/vassal-life-map.js";

const PANEL = Object.freeze({ x: 512, y: 150, width: 1400, height: 760 });

function addButton(parent, rect, label, enabled, onPress, selected = false) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = enabled ? "static" : "none";
  root.cursor = enabled ? "pointer" : "default";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointertap", (event) => {
    event?.stopPropagation?.();
    if (enabled) onPress?.();
  });
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 8,
    enabled ? (selected ? 0x536d48 : 0x40533b) : 0x464743,
    enabled ? (selected ? PALETTE.green : PALETTE.accent) : PALETTE.stroke,
    selected ? 3 : 1);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title, fontSize: 18, fill: enabled ? PALETTE.text : PALETTE.textMuted,
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  parent.addChild(root);
  return root;
}

function drawItemCard(parent, rect, item, {
  selected = false, outcome = null, onToggle = null,
} = {}) {
  const presented = presentHeirloom(item) ?? item;
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = onToggle ? "static" : "none";
  root.cursor = onToggle ? "pointer" : "default";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  if (onToggle) root.on("pointertap", (event) => { event.stopPropagation(); onToggle(); });
  const gfx = new PIXI.Graphics();
  const rim = selected
    ? PALETTE.green
    : FAITH_TIER_COLORS[presented.quality] ?? PALETTE.stroke;
  roundedRect(gfx, 0, 0, rect.width, rect.height, 8, 0x2b332e, rim, selected ? 3 : 2);
  root.addChild(gfx,
    createText(String(presented.label ?? "").toUpperCase(), {
      ...TEXT_STYLES.header, fontSize: 18, fill: PALETTE.text,
      wordWrap: true, wordWrapWidth: rect.width - 20,
    }, 10, 8),
    createText(`${getHeirloomQualityLabel(presented.quality)} · ${
      getHeirloomInheritanceLabel(presented.inheritanceState ?? presented.fromState)
    }`, {
      ...TEXT_STYLES.chip, fontSize: 13, fill: rim,
    }, 10, 48),
    createText(presented.description ?? "", {
      ...TEXT_STYLES.body, fontSize: 14, fill: PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: rect.width - 20,
    }, 10, 70));
  if (outcome) {
    const broke = outcome === "broke";
    root.addChild(createText(broke ? "BROKE" : outcome === "survived" && presented.toState === "fragile"
      ? "FRAGILE" : "SURVIVED", {
      ...TEXT_STYLES.title, fontSize: 16,
      fill: broke ? PALETTE.red : PALETTE.green,
    }, 10, rect.height - 28));
  }
  parent.addChild(root);
  return root;
}

export function createVassalHeirloomFlowView({
  app, layer, getState, isRecapOpen, onResolveOverflow, onConfirmLoadout,
  onDismissSummary, onOpenChooser,
} = {}) {
  const root = new PIXI.Container();
  root.visible = false;
  root.zIndex = 186;
  root.eventMode = "static";
  layer?.addChild(root);
  let signature = "";
  let dismissedReportId = null;
  let selectedIds = [];
  let lastMode = null;

  function snapshot() {
    const state = getState?.() ?? null;
    const lineage = state?.civilization?.vassalLineage ?? null;
    const report = lineage?.lastInheritanceReport ?? null;
    const overflow = lineage?.pendingVaultOverflow ?? [];
    const loadoutPending = lineage?.pendingHeirloomLoadout === true;
    const recapOpen = isRecapOpen?.() === true;
    const reportOpen = !!report && report.vassalId !== dismissedReportId
      && ((report.entries ?? []).length > 0 || overflow.length > 0);
    return {
      state, lineage, report, overflow, loadoutPending, recapOpen,
      visible: !recapOpen && (overflow.length > 0 || reportOpen || loadoutPending),
      mode: overflow.length > 0 ? "overflow"
        : reportOpen ? "summary"
          : loadoutPending ? "loadout" : null,
    };
  }

  function render(force = false) {
    const snap = snapshot();
    root.visible = snap.visible;
    root.eventMode = snap.visible ? "static" : "none";
    if (!snap.visible) {
      if (root.children.length) clearChildren(root);
      signature = "";
      return;
    }
    if (snap.mode !== lastMode) {
      selectedIds = snap.mode === "overflow"
        ? (snap.overflow ?? []).slice(0, 6).map((item) => item.instanceId)
        : [];
      lastMode = snap.mode;
    }
    const nextSignature = JSON.stringify({
      mode: snap.mode,
      report: snap.report,
      overflow: (snap.overflow ?? []).map((item) => item.instanceId),
      vault: (snap.state?.civilization?.heirloomVault ?? []).map((item) => item?.instanceId ?? null),
      selectedIds,
      loadout: snap.loadoutPending,
    });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);

    const blocker = new PIXI.Graphics();
    blocker.beginFill(0x171713, 0.72)
      .drawRect(0, 0, app?.screen?.width ?? 2424, app?.screen?.height ?? 1080).endFill();
    blocker.eventMode = "static";
    blocker.on("pointertap", (event) => event.stopPropagation());
    const bg = new PIXI.Graphics();
    roundedRect(bg, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 16, 0x292f2b, PALETTE.accent, 3);
    root.addChild(blocker, bg);

    if (snap.mode === "summary" || snap.mode === "overflow") {
      root.addChild(createText("HEIRLOOM INHERITANCE", {
        ...TEXT_STYLES.title, fontSize: 28, fill: PALETTE.accent,
      }, PANEL.x + 36, PANEL.y + 24));
      const entries = snap.report?.entries ?? [];
      if (!entries.length && snap.mode === "summary") {
        root.addChild(createText("No Heirlooms were carried through this life.", {
          ...TEXT_STYLES.body, fontSize: 20, fill: PALETTE.textMuted,
        }, PANEL.x + 36, PANEL.y + 80));
      }
      if (snap.mode === "summary") {
        entries.forEach((entry, index) => {
          const col = index % 3;
          const row = Math.floor(index / 3);
          drawItemCard(root, {
            x: PANEL.x + 36 + col * 440, y: PANEL.y + 80 + row * 210,
            width: 420, height: 190,
          }, { ...entry, inheritanceState: entry.toState ?? entry.fromState }, {
            outcome: entry.outcome,
          });
        });
      }
      if (snap.mode === "overflow") {
        entries.forEach((entry, index) => {
          const broke = entry.outcome === "broke";
          root.addChild(createText(
            `${String(entry.label ?? "").toUpperCase()}  ${getHeirloomInheritanceLabel(entry.fromState)}  →  ${
              broke ? "BROKE" : getHeirloomInheritanceLabel(entry.toState)
            }`, {
              ...TEXT_STYLES.body, fontSize: 16,
              fill: broke ? PALETTE.red : PALETTE.text,
            }, PANEL.x + 36, PANEL.y + 72 + index * 22
          ));
        });
        root.addChild(createText("The Vault holds six relics. Choose which six to keep.", {
          ...TEXT_STYLES.header, fontSize: 20, fill: PALETTE.accent,
        }, PANEL.x + 36, PANEL.y + 220));
        (snap.overflow ?? []).forEach((item, index) => {
          const col = index % 3;
          const row = Math.floor(index / 3);
          const selected = selectedIds.includes(item.instanceId);
          drawItemCard(root, {
            x: PANEL.x + 36 + col * 440, y: PANEL.y + 260 + row * 150,
            width: 420, height: 138,
          }, item, {
            selected,
            onToggle: () => {
              if (selected) selectedIds = selectedIds.filter((id) => id !== item.instanceId);
              else if (selectedIds.length < 6) selectedIds = [...selectedIds, item.instanceId];
              render(true);
            },
          });
        });
        addButton(root, {
          x: PANEL.x + PANEL.width - 340, y: PANEL.y + PANEL.height - 72,
          width: 300, height: 50,
        }, selectedIds.length === 6 ? "KEEP THESE SIX" : `${selectedIds.length} / 6 SELECTED`,
        selectedIds.length === 6, () => {
          const result = onResolveOverflow?.(selectedIds);
          if (result?.ok !== false) {
            selectedIds = [];
            render(true);
          }
        });
      } else {
        addButton(root, {
          x: PANEL.x + PANEL.width - 340, y: PANEL.y + PANEL.height - 72,
          width: 300, height: 50,
        }, "CONTINUE", true, () => {
          dismissedReportId = snap.report?.vassalId ?? null;
          onDismissSummary?.();
          onOpenChooser?.();
          render(true);
        });
      }
      return;
    }

    root.addChild(createText("EQUIP HEIRLOOMS FOR THIS LIFE", {
      ...TEXT_STYLES.title, fontSize: 28, fill: PALETTE.accent,
    }, PANEL.x + 36, PANEL.y + 24));
    root.addChild(createText("Choose 0–3 Vault relics to Equip. Carry begins empty. Sanctified relics become Unmarked.", {
      ...TEXT_STYLES.body, fontSize: 18, fill: PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: 1200,
    }, PANEL.x + 36, PANEL.y + 68));
    const vault = (snap.state?.civilization?.heirloomVault ?? []).filter(Boolean);
    if (!vault.length) {
      root.addChild(createText("The Vault is empty.", {
        ...TEXT_STYLES.header, fontSize: 22, fill: PALETTE.textMuted,
      }, PANEL.x + 36, PANEL.y + 130));
    }
    vault.forEach((item, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const selected = selectedIds.includes(item.instanceId);
      drawItemCard(root, {
        x: PANEL.x + 36 + col * 440, y: PANEL.y + 120 + row * 210,
        width: 420, height: 190,
      }, item, {
        selected,
        onToggle: () => {
          if (selected) selectedIds = selectedIds.filter((id) => id !== item.instanceId);
          else if (selectedIds.length < 3) selectedIds = [...selectedIds, item.instanceId];
          render(true);
        },
      });
    });
    addButton(root, {
      x: PANEL.x + PANEL.width - 360, y: PANEL.y + PANEL.height - 72,
      width: 320, height: 50,
    }, selectedIds.length ? `EQUIP ${selectedIds.length}` : "BEGIN UNARMED", true, () => {
      const result = onConfirmLoadout?.(selectedIds);
      if (result?.ok !== false) {
        selectedIds = [];
        render(true);
      }
    });
  }

  return {
    init: () => render(true),
    update: () => render(),
    refresh: () => render(true),
    isOpen: () => root.visible === true,
  };
}
