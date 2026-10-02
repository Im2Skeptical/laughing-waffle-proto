// Throwaway vector art study: identity and age are independent of class clothing.
// Explicit descriptors only; this view never rolls or consumes simulation RNG.
export function classMark(classId) {
  const paths = classId === 'warrior'
    ? '<path d="M16 3 25 7v10q0 8-9 12-9-4-9-12V7Z"/><path d="M16 7v15m-5-8h10"/>'
    : classId === 'scholar'
      ? '<path d="M3 8q7-4 13 0 6-4 13 0v18q-7-4-13 0-6-4-13 0Z"/><path d="M16 8v18M7 12h5m8 0h5M7 16h5m8 0h5"/>'
      : '<path d="M16 4 27 14l-4 14H9L5 14Z"/><path d="M11 17h10m-5-5v12"/>';
  return `<svg class="vp-mark" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">${paths}</svg>`;
}

export function portraitArt({ classId = 'warrior', identity = 0, kit = 0, palette = 0, age = 'young', founder = false, plain = false } = {}) {
  const skins = ['#ae795c', '#765244', '#ceaa7d', '#996e52'];
  const hairs = ['#262420', '#151a1a', '#563b2d', '#3e342c'];
  const cloths = classId === 'warrior' ? ['#8b4539', '#55705d', '#7b6743'] : classId === 'scholar' ? ['#666587', '#3e7779', '#7a595f'] : ['#72634b', '#55705d', '#65566e'];
  const skin = skins[identity % skins.length], hair = age === 'elder' ? '#a59e86' : hairs[identity % hairs.length];
  const cloth = cloths[palette % cloths.length];
  const cheek = identity % 2 === 0 ? 'M76 82Q77 130 120 148Q159 132 164 82Z' : 'M79 82Q73 131 120 146Q162 130 161 82Z';
  const outfit = classId === 'warrior'
    ? `<path d="M38 237 49 175 85 154h70l37 21 14 62Z" fill="${cloth}"/>
       <path d="m82 159 38 29 36-29 22 31-17 47H77l-17-47Z" fill="#5a6664"/>
       <path d="m88 174 32 14 30-14-6 42H94Z" fill="#79817a"/>
       <path d="M45 183q14-31 44-22l-12 32-35 8Zm111-23q29-6 42 24l5 16-39-6Z" fill="${kit === 1 ? '#9c957e' : '#66716b'}"/>
       ${kit === 1 ? '<path d="M87 198h65m-63 10h61m-59 10h57" stroke="#373e3a" stroke-width="5"/>' : '<path d="m88 171 9 55m54-55-10 55" stroke="#a49c80" stroke-width="3"/>'}
       ${kit === 2 ? `<path d="m43 178 25 10 22 49H33Z" fill="${cloth}"/><path d="m180 179-14 18-8 40h50Z" fill="${cloth}"/>` : ''}
       <path d="m192 120 6 1-3 69-7-1Z" fill="#adb1a0"/><path d="m180 184 23 2-1 5-23-2Z" fill="#bb9b62"/><path d="m188 190 8 1-1 32-8-1Z" fill="#443327"/>`
    : classId === 'scholar'
      ? `<path d="m36 237 17-63 33-21h69l33 21 17 63Z" fill="${cloth}"/>
         <path d="m85 151 35 36 35-36 12 22-34 64h-26l-35-64Z" fill="#a99874"/>
         <path d="m89 158 31 30 30-30-11 28-19 32-19-32Z" fill="#d1b68b"/>
         <path d="M61 192 50 235m129-43 12 43m-71-18v20" stroke="#252d32" stroke-width="3"/>
         ${kit === 1 ? '<path d="m48 180 42-19 16 76H40Zm144 0-41-19-17 76h65Z" fill="#343c4a"/>' : ''}
         ${kit === 2 ? `<path d="M73 142Q42 80 69 48q49-34 94 1 30 41 6 94l-14-32 1-44q-36-28-71 0v45Z" fill="${cloth}" stroke="#242b30" stroke-width="4"/>` : ''}
         <path d="m63 204 44 5 14 11 16-11 40-5-2 33H66Z" fill="#292f32" stroke="#b8a179" stroke-width="2"/>
         <path d="m68 208 36 6 17 9 17-9 34-6-1 24-33 1-17 4-17-4-33-1Z" fill="#c0ad83"/>
         <path d="M121 223v14m-44-20 26 3m36 0 25-3" stroke="#827253"/>
         <path d="m184 195 10-46q24-8 17-36-27 18-25 39Z" fill="#b5b7a1"/><path d="m185 195 13-65" stroke="#636e64" stroke-width="2"/>`
      : `<path d="m37 237 15-60 37-23h64l34 23 18 60Z" fill="${cloth}"/><path d="m87 153 33 33 33-33-12 35-21 20-22-21Z" fill="#b5a281"/><path d="m69 176 13 61m89-61-13 61" stroke="#363d33" stroke-width="3"/><path d="m89 204 45-7 4 21-45 7Z" fill="#aa9569"/>`;
  const ornament = plain ? '' : classId === 'warrior'
    ? '<path d="M16 64V25l27-9h154l27 9v39M16 179v33l28 19h152l28-19v-33"/><path d="m17 43 14 7 13-22m180 15-14 7-13-22"/><path d="M16 98 8 111v51l8 12m208-76 8 13v51l-8 12"/><path d="M24 215h27m165 0h-27"/>'
    : classId === 'scholar'
      ? '<path d="M16 224V77Q16 37 120 12 224 37 224 77v147M25 211V78q0-31 95-56 95 25 95 56v133"/><path d="M15 107q-17 10 0 27t0 27m210-54q17 10 0 27t0 27"/><path d="M29 230h74l17 6 17-6h74"/>'
      : '<path d="M16 224V24h208v200M23 217V31h194v186"/>';
  const crown = founder ? '<path d="m92 21-4-18 17 8 15-10 15 10 17-8-4 18Z" fill="#be9e59" stroke="#e0c78f"/><circle cx="120" cy="12" r="3" fill="#faf0c2"/>' : '';
  return `<svg class="vp-portrait" viewBox="0 0 240 250" role="img" aria-label="${founder ? 'Founder' : classId} portrait, ${age}, clothing set ${kit + 1}">
    <path d="M23 230V54Q40 26 120 20q80 6 97 34v176Z" fill="#162726"/>
    <path d="m24 228 67-85 48-20 76 103Z" fill="#314139" opacity=".6"/>
    <circle cx="120" cy="92" r="71" fill="${classId === 'scholar' ? '#74758c' : '#a48156'}" opacity=".13"/>
    ${outfit}
    <path d="M99 134v23l21 19 21-19v-23Z" fill="${skin}"/><path d="m101 142 19 9 20-10-4 14-16 11-14-11Z" fill="#51392f" opacity=".5"/>
    <path d="${cheek}" fill="${skin}" stroke="#292c28" stroke-width="3"/>
    <path d="M80 78Q66 43 97 37q41-18 64 14l10 40-17-14-6-20-35 9-24-9-4 34Z" fill="${hair}"/>
    ${identity % 2 ? `<path d="M83 68Q54 117 80 157l15-15-10-35Zm73-2q29 45 10 91l-19-18 12-27Z" fill="${hair}"/>` : ''}
    <path d="m87 93 18-3m30 0 17 3" stroke="#3c302a" stroke-width="4"/>
    <path d="m91 99 12 1m33 0 12-1" stroke="#212b29" stroke-width="3"/>
    <path d="m119 96-5 24 13 1" fill="none" stroke="#78523f" stroke-width="3"/>
    <path d="m107 132 13 2 14-3" stroke="#4b362e" stroke-width="2" fill="none"/>
    <path d="m85 111 11 14m56-14-11 14" stroke="#d3a780" opacity=".5" stroke-width="2"/>
    ${age === 'elder' ? `<path d="m98 132 22 6 23-8-4 18-19 18-18-16Z" fill="${hair}"/><path d="m86 104 11 3m45 0 11-3m-63 19 8 3m39 0 8-3" stroke="#583e32" fill="none"/>` : age === 'middle' ? `<path d="m102 137 18 7 17-8-6 13-11 7-10-7Z" fill="${hair}"/>` : ''}
    <g fill="none" stroke="${founder ? '#c8ac70' : classId === 'scholar' ? '#a39bb9' : '#a49b7c'}" stroke-width="2">${ornament}</g>${crown}
  </svg>`;
}

export function civilizationMap(region, threat) {
  const regions = [
    ['66,25 260,16 300,133 188,196 53,137', '#37443a'],
    ['260,16 466,34 509,143 402,216 300,133', '#36403d'],
    ['466,34 635,18 708,105 673,215 509,143', '#39473d'],
    ['53,137 188,196 223,327 113,399 13,309', '#394438'],
    ['188,196 300,133 402,216 398,338 223,327', '#5a6550'],
    ['402,216 509,143 673,215 641,359 526,389 398,338', '#536046'],
    ['113,399 223,327 398,338 435,487 198,506', '#354039'],
    ['398,338 526,389 641,359 696,469 574,527 435,487', '#323b37'],
  ];
  return `<svg class="vp-world" viewBox="0 0 720 550" aria-label="Illustrative civilization map with two settlements" role="img">
    <defs><pattern id="vp-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 9 9 0" stroke="#94a28a" stroke-opacity=".07"/></pattern></defs>
    ${regions.map(([points, fill]) => `<polygon points="${points}" fill="${fill}" stroke="#9b9b77" stroke-opacity=".35"/>`).join('')}
    <path d="M322 0q-5 72 37 127t-8 104q-55 64 3 148t-8 171" stroke="#738e85" stroke-width="16" opacity=".32" fill="none"/>
    <path d="m288 253 250 19" stroke="#ceb481" stroke-width="2" stroke-dasharray="6 7"/>
    <path d="m541 279 65-163" stroke="#a29872" stroke-width="1.5" stroke-dasharray="5 7"/>
    <polygon points="${region === 'capital' ? regions[4][0] : regions[5][0]}" fill="url(#vp-hatch)" stroke="#d2bb88" stroke-width="2"/>
    <g fill="#819078" opacity=".5">${[[100,82],[570,75],[190,432],[577,456],[71,245]].map(([x,y]) => `<path d="m${x} ${y}-10 20h20Zm12 6-8 17h16Z"/>`).join('')}</g>
    <g fill="#bdae82" stroke="#24332e" stroke-width="2"><path d="M266 268v-24l23-18 23 18v24Zm11 0v-22h25v22M279 231v-16h9v9M517 290v-23l23-17 23 17v23Z"/></g>
    <g fill="#e0d0a9" font-family="Georgia" font-size="18"><text x="289" y="300" text-anchor="middle">Hearth</text><text x="541" y="320" text-anchor="middle">Riverwatch</text></g>
    <g fill="#a4ad97" font-family="sans-serif" font-size="11" letter-spacing="2"><text x="93" y="103">FRONTIER</text><text x="487" y="439">UNSETTLED</text><text x="465" y="112">NEUTRAL</text></g>
    ${threat ? '<g fill="#c28468"><path d="m611 183 13-23 14 23Z"/><text x="625" y="179" fill="#1c2420" text-anchor="middle" font-size="14">!</text><text x="587" y="204" font-family="sans-serif" font-size="11">MONSTERS</text></g>' : ''}
    <path d="M695 37v37m-8-11 8-26 8 26" stroke="#b5a577" fill="none"/><text x="695" y="27" fill="#b5a577" text-anchor="middle" font-size="12">N</text>
  </svg>`;
}
