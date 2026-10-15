// Calm water materials on the same world lattice as the ocean. The bed, reeds
// and floating mats stay fixed; only reflection/ripple palette indices cycle.
const clamp = n => Math.max(0, Math.min(1, n));
const fract = n => n - Math.floor(n);

export function prepareInlandPalette(bank, mix) {
  for (let n = 0; n < 16; n++) {
    const crest = Math.pow(Math.max(0, Math.cos(n / 16 * Math.PI * 2)), 3);
    bank[112 + n] = mix(0x3c5960, 0x93b1ab, crest);
    bank[240 + n] = mix(0x556e60, 0xa7b69a, crest * .8);
  }
  for (let n = 0; n < 8; n++) {
    const crest = Math.pow(Math.max(0, Math.cos(n / 8 * Math.PI * 2)), 3);
    bank[48 + n] = mix(0x3b484b, 0x869690, crest);
  }
}

export function sampleInlandWater({ kind, seed, x, y, distance, noise, mix, ripple = null }) {
  const peat = kind === 'peat';
  const shelf = noise(seed ^ 17233, x, y, 28);
  const patch = noise(seed ^ 8171, x * .65, y, 11);
  const grain = fract(Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453);
  const shallow = Math.exp(-distance / (peat ? 8 + shelf * 9 : 8 + shelf * 18));
  const cloud = noise(seed ^ 7319, x * .48, y * 1.7, 31);
  const wind = noise(seed ^ 8729, x * .45, y * 1.6, 13);
  const bend = Math.sin(x / 33) * 2.2 + noise(seed ^ 6197, x, y, 37) * 5;
  const radial = ripple && ripple.weight > .06;
  const phase = fract(radial ? ripple.phase : (y + x * .08 + bend) / (peat ? 11 : 14));
  let base = mix(peat ? 0x354449 : 0x3e5964, peat ? 0x626a53 : 0x708c79, shallow * .82);
  // Broad sky reflections leave dark open channels between them. Avoid the old
  // evenly spaced diagonal striping and uniformly grey pool centres.
  base = mix(base, peat ? 0x7a8585 : 0x91a5a2, clamp((cloud - .38) * 1.7) * (peat ? .29 : .26));
  base = mix(base, peat ? 0x786b50 : 0x9b9d7b, shallow * clamp((shelf - .40) * 2) * .35);
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
  const strength = (radial ? (peat ? .035 + ripple.weight * .16 : .045 + ripple.weight * .25)
    : peat ? .055 + clamp((wind - .42) * 2.6) * .22
    : glint ? .32 : .055 + clamp((wind - .35) * 2.2) * .37) * (1 - vegetation * .92) * (reeds ? .15 : 1);
  return { base, index, strength: Math.round(strength * 255), vegetation: vegetation > .18, reeds, glint,
    ripple: strength > (peat ? .12 : .18) };
}
