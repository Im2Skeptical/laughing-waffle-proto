import { spawnSync } from 'node:child_process';

const texturePacker = process.env.TEXTURE_PACKER ?? 'TexturePacker';
const jobs = [
  ['resource-language', 'images/dark-fantasy/resource-language-v1', ['--scale', '0.3', '--max-size', '2048']],
  ['settlement-pieces', 'images/dark-fantasy/settlement-pieces-v2', ['--scale', '0.8', '--max-size', '4096']],
  ['piece-frames', 'images/dark-fantasy/piece-frames-v1', ['--scale', '0.5', '--max-size', '2048']],
];

for (const [name, source, sizing] of jobs) {
  const result = spawnSync(texturePacker, [
    '--format', 'json',
    '--sheet', `images/sprite-sheets/${name}.png`,
    '--data', `images/sprite-sheets/${name}.json`,
    ...sizing,
    '--disable-rotation',
    '--trim-mode', 'None',
    '--extrude', '2',
    source,
  ], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) {
    console.error(`[sprites] Could not run ${texturePacker}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
