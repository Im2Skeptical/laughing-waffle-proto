import { recordCommissionAction } from './commissions.js';
// The experimental civilization owns one treasury across all successive lives.
// Authored laboratory fixtures may still exercise the original personal economy.
export const prestigeAccount = (state,vassal) => state?.rulesetId ? state.civilization : vassal;
export function quotePrestige(available,cost,explicitPressure=0) {
  return cost>available?{prestigeCost:0,monsterPressureCost:10+explicitPressure}:{prestigeCost:cost,monsterPressureCost:explicitPressure};
}

export function creditPrestige(state,vassal,amount,{commission=true}={}) {
  const income=Math.max(0,Math.floor(amount??0));
  prestigeAccount(state,vassal).prestige+=income;
  if(state.rulesetId)state.civilization.treasury.grossIncome+=income;
  if(commission&&income)recordCommissionAction(state,vassal,{kind:'prestigeGained',amount:income});
  return income;
}
