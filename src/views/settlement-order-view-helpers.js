import {
  capitalizeLabel,
  formatSignedNumber,
} from "./settlement-formatters.js";

export function getOrderRuntime(card) {
  return card?.props?.settlement && typeof card.props.settlement === "object"
    ? card.props.settlement
    : {};
}

export function getSortedOrderMembers(card) {
  const runtime = getOrderRuntime(card);
  return (Array.isArray(runtime.members) ? runtime.members : [])
    .slice()
    .sort(
      (a, b) =>
        Math.floor(b?.prestige ?? 0) - Math.floor(a?.prestige ?? 0) ||
        Math.floor(b?.ageYears ?? 0) - Math.floor(a?.ageYears ?? 0) ||
        String(a?.memberId ?? "").localeCompare(String(b?.memberId ?? ""))
    );
}

export function getSelectedAgendaForMember(member, selectedClassId) {
  return Array.isArray(member?.agendaByClass?.[selectedClassId])
    ? member.agendaByClass[selectedClassId]
    : [];
}

function getOrderModifierDef(orderDef, member) {
  const modifierId = typeof member?.modifierId === "string" ? member.modifierId : "";
  return orderDef?.prestigeModifiers?.[modifierId] ?? null;
}

export function buildElderDetailTooltipSpec(orderDef, member) {
  const ageYears = Math.max(0, Math.floor(member?.ageYears ?? 0));
  const joinedYear = Math.max(0, Math.floor(member?.joinedYear ?? 0));
  const prestige = Math.max(0, Math.floor(member?.prestige ?? 0));
  const modifierDef = getOrderModifierDef(orderDef, member);
  const prestigeDelta = Number(modifierDef?.prestigeDelta ?? 0);
  const modifierLabel = modifierDef?.label ?? member?.modifierLabel ?? member?.modifierId ?? "None";
  return {
    title: modifierLabel || "Elder",
    subtitle: `Prestige ${prestige}`,
    maxWidth: 320,
    sections: [
      {
        type: "table",
        title: "Details",
        rows: [
          { label: "Age", value: `${ageYears} years` },
          { label: "Joined", value: joinedYear > 0 ? `Year ${joinedYear}` : "Unknown" },
          { label: "Class", value: capitalizeLabel(member?.sourceClassId) },
          { label: "Origin", value: member?.sourceVassalId ? "Vassal" : "Council" },
          { label: "Trait", value: modifierLabel },
          { label: "Buff/Nerf", value: `${formatSignedNumber(prestigeDelta)} prestige` },
        ],
      },
      {
        type: "paragraph",
        title: "Prestige Formula",
        text: `${ageYears} age + ${formatSignedNumber(prestigeDelta)} trait = ${prestige}`,
      },
    ],
  };
}
