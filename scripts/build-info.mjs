import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hashes = new Map();
const digest = value => createHash('sha256').update(value).digest('hex');
export const workspaceId = digest(root).slice(0, 16);

// Include uncommitted/untracked inputs. Cache file hashes, not the file list, so
// edits, additions and deletions all change the next page's build identity.
export async function getBuildInfo(channel, previewLabel = null) {
  const inputs = ['src', 'images', 'scripts', 'ai', 'docs', '.github', 'AGENTS.md', 'README.md',
    'index.html', 'styles.css', 'package.json', 'package-lock.json'];
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
    ...inputs], { cwd: root, encoding: 'utf8', windowsHide: true });
  const fingerprint = createHash('sha256');
  for (const file of [...new Set(files.split('\0').filter(Boolean))].sort()) {
    const full = path.join(root, file);
    let info;
    try { info = await stat(full); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!info.isFile()) continue;
    const signature = `${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
    let cached = hashes.get(file);
    if (cached?.signature !== signature) {
      const hash = createHash('sha256');
      if (/\.(?:js|mjs|json|html|css|md|ya?ml)$/.test(file)) {
        hash.update((await readFile(full, 'utf8')).replace(/\r\n/g, '\n'));
      } else {
        for await (const chunk of createReadStream(full)) hash.update(chunk);
      }
      cached = { signature, hash: hash.digest('hex') };
      hashes.set(file, cached);
    }
    fingerprint.update(`${file}\0${cached.hash}\n`);
  }
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim() || null;
  const dirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...inputs],
    { cwd: root, encoding: 'utf8', windowsHide: true }).trim());
  const preview = branch !== 'main' || dirty;
  return { version, build: fingerprint.digest('hex').slice(0, 12), revision, channel,
    branch, dirty, preview, previewLabel: preview ? previewLabel : null };
}

export function stampBuildInfo(html, info) {
  const marker = '<script id="game-build-info" type="application/json">null</script>';
  if (!html.includes(marker)) throw new Error('Missing build identity placeholder in index.html');
  return html.replace(marker, marker.replace('>null<', `>${JSON.stringify(info).replace(/</g, '\\u003c')}<`));
}
