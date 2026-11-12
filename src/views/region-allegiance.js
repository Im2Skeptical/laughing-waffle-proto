// Shared read-only palette/counts for the regional header and map bar.
export function unrestReading(episode){
  return episode ? [
    `Unrest: ${Number(episode.remainingYears.toFixed(1))} years remaining. No faction controls this settlement.`,
    `Generates ${episode.chaosPerYear} Chaos per year into the shared world threat.`,
    'Local production and population continue; faction supply and Prestige income are unavailable.',
    'Peaceful claims are blocked until Unrest ends. Military conquest is separate.',
    'At expiry this becomes an ordinary unheld town; no faction automatically takes control.',
  ] : [];
}
export function regionAllegianceParts(control){
  return [
    {id:'player',name:'Free',count:control.support.player??0,colour:0xe4c271},
    {id:'external-a',name:'Crown',count:control.support['external-a']??0,colour:0xc17a57},
    {id:'neutral',name:'Unaffiliated',count:Math.max(0,control.total-(control.support.player??0)-(control.support['external-a']??0)),colour:0x8e9c91},
  ];
}
