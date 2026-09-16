import { spawnSync } from 'node:child_process';

const texturePacker = process.env.TEXTURE_PACKER ?? 'TexturePacker';
const jobs = [
  ['resource-language', 'images/dark-fantasy/resource-language-v1', ['--scale', '0.3', '--max-size', '2048']],
  ['settlement-pieces', 'images/dark-fantasy/settlement-pieces-v2', ['--scale', '0.8', '--max-size', '4096']],
  ['piece-frames', 'images/dark-fantasy/piece-frames-v1', ['--scale', '0.5', '--max-size', '2048']],
  ['chronicle-illustrations', 'images/dark-fantasy/chronicle-illustrations-v1', ['--scale', '1', '--max-size', '4096']],
  ['vassal-portraits', 'images/dark-fantasy/vassal-portraits-v1', ['--scale', '1', '--max-size', '2048']],
  // These single-frame sheets let the DOM and Pixi use the same packed source.
  ['chronicle-gate', 'images/dark-fantasy/chronicle-gate-v1', ['--scale', '1', '--max-size', '2048', '--padding', '0', '--border-padding', '0', '--extrude', '0']],
  ['timegraph-chronicle', 'images/dark-fantasy/timegraph-chronicle-v1', ['--scale', '1', '--max-size', '4096', '--padding', '0', '--border-padding', '0', '--extrude', '0']],
];

for (const [name, source, sizing] of jobs) {
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
    source,
  ], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) {
    console.error(`[sprites] Could not run ${texturePacker}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
