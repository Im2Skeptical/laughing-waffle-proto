// Calm water materials on the same world lattice as the ocean. The bed, reeds
// and floating mats stay fixed; only reflection/ripple palette indices cycle.
const clamp = n => Math.max(0, Math.min(1, n));
const fract = n => n - Math.floor(n);

export function prepareInlandPalette(bank, mix) {
  for (let n = 0; n < 16; n++) {
    const crest = Math.pow(Math.max(0, Math.cos(n / 16 * Math.PI * 2)), 3);
    bank[112 + n] = mix(0x3d5356, 0x758a83, crest);
    bank[240 + n] = mix(0x525e50, 0x90977b, crest * .65);
  }
  for (let n = 0; n < 8; n++) {
    const crest = Math.pow(Math.max(0, Math.cos(n / 8 * Math.PI * 2)), 3);
    bank[48 + n] = mix(0x3d4846, 0x758078, crest);
  }
}

export function sampleInlandWater({ kind, seed, x, y, distance, noise, mix }) {
  const peat = kind === 'peat';
  const warpX=(noise(seed^4817,x,y,54)-.5)*27,warpY=(noise(seed^9217,x+53,y-71,61)-.5)*27;
  const shelf = noise(seed ^ 17233, x+warpX, y+warpY, 28);
  const mixing = noise(seed ^ 3167, x+warpY, y-warpX, peat?25:31);
  const patch = noise(seed ^ 8171, x * .65, y, 11);
  const grain = fract(Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453);
  const shallow = Math.exp(-distance / (peat ? 5 + shelf * shelf * 13 : 4 + shelf * shelf * 24));
  const cloud = noise(seed ^ 7319, x+warpX, y+warpY, 39);
  const wind = noise(seed ^ 8729, x * .45, y * 1.6, 13);
  // Disconnected, irregular reflection patches instead of point-emitter rings.
  const phase = fract(mixing*2.3+cloud*.7+patch*.22);
  let base=mix(peat?0x35433f:0x30474f,peat?0x545a44:0x5c6b59,clamp((mixing-.32)*2.4));
  base=mix(base,peat?0x67664f:0x78806a,shallow*(.32+shelf*.28));
  base = mix(base, peat ? 0x6c7773 : 0x82928c, clamp((cloud - .5) * 2) * .18);
  base = mix(base, peat ? 0x786b50 : 0x959477, shallow * clamp((shelf - .48) * 2) * .25);
  base = mix(base, grain > .5 ? 0x869583 : 0x394a4b, .025);
  // Broken sheltered colonies, strongest near the bank, with holes exposing
  // water. They are part of the static substrate, never palette-cycled foliage.
  const mat = shallow * clamp((patch - (peat ? .40 : .61)) * (peat ? 4.5 : 3.5));
  const vegetation = mat * (grain > .25 ? .8 : .25);
  base = mix(base, peat ? mix(0x566044, 0x87906a, grain * .65) : 0x69795a, vegetation);
  const reeds = distance < (peat ? 6 : 4) && patch > .59 && grain > .7;
  if (reeds) base = mix(base, grain > .9 ? 0x969573 : 0x515b40, .56);
  const glint = !peat && distance < 4 && patch < .6 && wind > .38;
  const index = (peat ? 48 : glint ? 240 : 112) + Math.floor(phase * (peat ? 8 : 16));
  const strength = (peat ? .055 + clamp((wind - .42) * 2.6) * .10
    : glint ? .18 : .065 + clamp((wind - .35) * 2.2) * .12) * (1-clamp(vegetation*2.4)) * (reeds ? .1 : 1);
  return { base, index, strength: Math.round(strength * 255), vegetation: vegetation > .18, reeds, glint,
    ripple: strength > (peat ? .085 : .11) };
}
