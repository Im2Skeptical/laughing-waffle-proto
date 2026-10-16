import { readFile, writeFile } from 'node:fs/promises';

const requested = process.argv[2];
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const context = await readFile('ai/ai-context.md', 'utf8');
const version = requested === 'patch'
  ? pkg.version.replace(/\d+$/, value => String(Number(value) + 1)) : requested;
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Use npm run version:game -- patch (or an explicit x.y.z version)');
if (!/^Game build version: `[^`]+`\.$/m.test(context)) throw new Error('Missing AI build version marker');
pkg.version = lock.version = lock.packages[''].version = version;
await writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
await writeFile('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
await writeFile('ai/ai-context.md', context.replace(/^Game build version: `[^`]+`\.$/m, `Game build version: \`${version}\`.`));
console.log(`Game and AI documentation version: ${version}`);
