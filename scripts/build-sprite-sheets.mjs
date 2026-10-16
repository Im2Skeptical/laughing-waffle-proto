import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const texturePacker = process.env.TEXTURE_PACKER ?? 'TexturePacker';
const manifest = JSON.parse(readFileSync('images/asset-manifest.json', 'utf8'));
const jobs = [
  ['heirlooms', 'images/dark-fantasy/heirlooms-v1', ['--scale', '0.3', '--scale-mode', 'Fast', '--max-size', '2048']],
  ['resource-language', 'images/dark-fantasy/resource-language-v1', ['--scale', '0.3', '--max-size', '4096']],
  ['settlement-pieces', 'images/dark-fantasy/settlement-pieces-v4', ['--scale', '0.3', '--scale-mode', 'Fast', '--max-size', '4096', '--multipack']],
  ['piece-frames', 'images/dark-fantasy/piece-frames-v1', ['--scale', '0.5', '--max-size', '2048']],
  ['class-picker-frames', 'images/dark-fantasy/class-picker-frames-v1', ['--scale', '1', '--scale-mode', 'Fast', '--max-size', '2048']],
  ['vassal-class', 'images/dark-fantasy/vassal-class-v1', ['--scale', '1', '--scale-mode', 'Fast', '--max-size', '2048']],
  ['chronicle-illustrations', 'images/dark-fantasy/chronicle-illustrations-v1', ['--scale', '1', '--max-size', '4096']],
  ['region-landmarks', 'images/dark-fantasy/region-landmarks-v1', ['--scale', '0.4', '--scale-mode', 'Fast', '--max-size', '2048']],
  ['vassal-portraits', 'images/dark-fantasy/vassal-portraits-v1', ['--scale', '0.8', '--max-size', '2048']],
  // These single-frame sheets let the DOM and Pixi use the same packed source.
  ['chronicle-gate', 'images/dark-fantasy/chronicle-gate-v1', ['--scale', '1', '--max-size', '2048', '--padding', '0', '--border-padding', '0', '--extrude', '0']],
  ['timegraph-chronicle', 'images/dark-fantasy/timegraph-chronicle-v1', ['--scale', '1', '--max-size', '4096', '--padding', '0', '--border-padding', '0', '--extrude', '0']],
];

// Optional atlas names support focused art rebuilds without rewriting other sheets.
const requested = process.argv.slice(2);
for (const name of requested) {
  if (!jobs.some(job => job[0] === name)) throw new Error(`Unknown sprite sheet: ${name}`);
}
for (const [name, source, sizing] of jobs) {
  if (requested.length && !requested.includes(name)) continue;
  const result = spawnSync(texturePacker, [
    '--format', 'json',
    '--texture-format', 'png8',
    '--dither-type', 'PngQuantLow',
    '--sheet', `images/sprite-sheets/${name}.png`,
    '--data', `images/sprite-sheets/${name}.json`,
    ...sizing,
    '--disable-rotation',
    '--trim-mode', 'None',
    ...(sizing.includes('--extrude') ? [] : ['--extrude', '2']),
    // Pack only registered sprites; generated reference sheets must never enter an atlas.
    ...manifest.spriteSheets[name].files.map(file => `${source}/${file}`),
  ], { stdio: 'inherit', windowsHide: true });
  if (result.error) {
    console.error(`[sprites] Could not run ${texturePacker}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
