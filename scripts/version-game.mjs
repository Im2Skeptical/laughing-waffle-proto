import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const requested = process.argv[2];
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', windowsHide: true }).trim();
if (branch !== 'main') throw new Error('Game versions are assigned on main after integration. Keep the inherited version in worktrees; see docs/development-workflow.md.');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const context = await readFile('ai/ai-context.md', 'utf8');
const version = requested === 'patch'
  ? pkg.version.replace(/\d+$/, value => String(Number(value) + 1)) : requested;
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Use npm run version:game -- patch (or an explicit x.y.z version)');
const currentParts = pkg.version.split('.').map(Number);
const nextParts = version.split('.').map(Number);
const changedPart = nextParts.findIndex((value, index) => value !== currentParts[index]);
if (changedPart === -1 || nextParts[changedPart] < currentParts[changedPart]) {
  throw new Error(`Integrated game version must increase beyond ${pkg.version}`);
}
if (!/^Game build version: `[^`]+`\.$/m.test(context)) throw new Error('Missing AI build version marker');
pkg.version = lock.version = lock.packages[''].version = version;
await writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
await writeFile('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
await writeFile('ai/ai-context.md', context.replace(/^Game build version: `[^`]+`\.$/m, `Game build version: \`${version}\`.`));
console.log(`Game and AI documentation version: ${version}`);
