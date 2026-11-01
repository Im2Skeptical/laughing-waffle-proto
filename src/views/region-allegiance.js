// Shared read-only palette/counts for the regional header and map bar.
export function regionAllegianceParts(control){
  return [
    {id:'player',name:'Free',count:control.support.player??0,colour:0xe4c271},
    {id:'external-a',name:'Crown',count:control.support['external-a']??0,colour:0xc17a57},
    {id:'neutral',name:'Unaffiliated',count:Math.max(0,control.total-(control.support.player??0)-(control.support['external-a']??0)),colour:0x8e9c91},
  ];
}
