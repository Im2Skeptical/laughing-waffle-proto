import {
  settlementVassalProfessionDefs,
  settlementVassalTraitDefs,
} from "../defs/gamepieces/settlement-vassal-defs.js";

export function capitalizeTier(value) {
  const text = typeof value === "string" ? value : "";
  if (!text.length) return "None";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function capitalizeLabel(value) {
  const text = typeof value === "string" ? value : "";
  if (!text.length) return "None";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatPartialFeedMemory(partialFeedRatios) {
  const ratios = Array.isArray(partialFeedRatios) ? partialFeedRatios : [];
  if (!ratios.length) return "None";
  return ratios
    .map((value) => `${Math.round((Number.isFinite(value) ? Number(value) : 0) * 100)}%`)
    .join(" -> ");
}

export function formatPracticeBlockedReason(reason) {
  const text = typeof reason === "string" ? reason : "";
  if (!text.length) return "";
  if (text.startsWith("upgradeTargetMissing:")) {
    return `${text.slice("upgradeTargetMissing:".length)} missing`;
  }
  if (text.startsWith("upgradeTier:")) {
    return `${capitalizeTier(text.slice("upgradeTier:".length))} tier`;
  }
  if (text.startsWith("faithTier:")) {
    return `faith ${capitalizeTier(text.slice("faithTier:".length))}+`;
  }
  if (text.startsWith("chaosGod:")) {
    const [, godId = "god", key = "pressure"] = text.split(":");
    return `${godId} ${key}`;
  }
  return text
    .replace(/^stockpileHigh:/, "")
    .replace(/^stockpile:/, "")
    .replace(/^capability:/, "")
    .replace(/^priority$/, "higher priority practice")
    .replace(/^mirrorSource$/, "villager practice")
    .replace(/^seasonMismatch$/, "season")
    .replace(/^freePopulation$/, "free population");
}

export function formatSignedNumber(value) {
  const safe = Number.isFinite(value) ? Math.floor(value) : 0;
  return safe >= 0 ? `+${safe}` : String(safe);
}

export function getVassalProfessionLabel(professionId) {
  if (typeof professionId !== "string" || professionId.length <= 0) return "None";
  return settlementVassalProfessionDefs?.[professionId]?.label ?? professionId;
}

export function getVassalTraitLabel(traitId) {
  if (typeof traitId !== "string" || traitId.length <= 0) return "None";
  return settlementVassalTraitDefs?.[traitId]?.label ?? traitId;
}

export function formatVassalDeathCause(causeOfDeath) {
  if (causeOfDeath === "starvation") return "starvation";
  if (causeOfDeath === "oldAge") return "old age";
  return "unknown causes";
}
