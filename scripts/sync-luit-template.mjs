#!/usr/bin/env node
/**
 * Sync this client repo into the client-neutral Luit Console template.
 *
 *   npm run template:sync              # sync HEAD, commit in the template
 *   node scripts/sync-luit-template.mjs --commit-ish main --no-commit
 *
 * Only committed code is synced: the chosen commit is checked out into a
 * temporary git worktree, client data is removed, client names are replaced
 * (rules in scripts/luit-template.json), the template's own files are kept,
 * and the result replaces the template's working tree. The template records
 * the source commit in .luit-source and, with --commit, commits
 * "Sync from <repo>@<sha>".
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const rules = JSON.parse(fs.readFileSync(path.join(here, 'luit-template.json'), 'utf8'));

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const commitIsh = arg('--commit-ish', 'HEAD');
const templateDir = path.resolve(repo, arg('--template', rules.templateDir));
const shouldCommit = !args.includes('--no-commit');

const git = (cwd, ...gitArgs) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8' }).trim();

if (!fs.existsSync(path.join(templateDir, '.git'))) {
  throw new Error(`Template repo not found at ${templateDir}. Clone it there or pass --template <path>.`);
}
if (git(templateDir, 'status', '--porcelain')) {
  throw new Error('The template has uncommitted changes. Commit or discard them before syncing.');
}

const sha = git(repo, 'rev-parse', commitIsh);
const short = sha.slice(0, 7);
const sourceName = path.basename(repo);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'luit-sync-'));
const tree = path.join(work, 'tree');
// Plain LF checkout so the template matches what git stores, on Windows too.
git(repo, '-c', 'core.autocrlf=false', 'worktree', 'add', '--detach', tree, sha);

try {
  for (const rel of rules.drop) fs.rmSync(path.join(tree, rel), { recursive: true, force: true });

  const replacements = rules.replace.map(([from, to]) => [new RegExp(from, 'g'), to]);
  const isText = (file) => rules.textExtensions.some((ext) => file.endsWith(ext));
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  for (const file of walk(tree)) {
    const rel = path.relative(tree, file).split(path.sep).join('/');
    if (rules.keep.includes(rel) || !isText(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    let next = text;
    for (const [pattern, to] of replacements) next = next.replace(pattern, to);
    if (rel === 'lib/jwt-secret.js' && !next.includes("'luit-default-secret-change-me'")) {
      next = next.replace(/( {2}'suchii-tender-default-secret-change-me',\r?\n)/, "$1  'luit-default-secret-change-me',\n");
    }
    if (next !== text) fs.writeFileSync(file, next);
  }

  // The template owns these files; keep its versions.
  for (const rel of rules.keep) {
    const own = path.join(templateDir, rel);
    if (!fs.existsSync(own)) continue;
    fs.mkdirSync(path.dirname(path.join(tree, rel)), { recursive: true });
    fs.copyFileSync(own, path.join(tree, rel));
  }

  // Replace the template's working tree, keeping its .git and local git config.
  for (const entry of fs.readdirSync(templateDir)) {
    if (entry === '.git') continue;
    fs.rmSync(path.join(templateDir, entry), { recursive: true, force: true });
  }
  for (const entry of fs.readdirSync(tree)) {
    if (entry === '.git') continue; // the worktree's link back to this repo
    fs.cpSync(path.join(tree, entry), path.join(templateDir, entry), { recursive: true });
  }
  fs.writeFileSync(path.join(templateDir, '.luit-source'), `${JSON.stringify({ source: sourceName, commit: sha, syncedAt: new Date().toISOString() }, null, 2)}\n`);
} finally {
  git(repo, 'worktree', 'remove', '--force', tree);
  fs.rmSync(work, { recursive: true, force: true });
}

git(templateDir, 'add', '-A');

// Client names must not survive outside the allowed files.
let leaks = '';
try {
  leaks = execFileSync('git', ['grep', '--cached', '-I', '-l', '-i', 'suchii', '--', '.', ...rules.allowedMentions.map((file) => `:!${file}`)], {
    cwd: templateDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch (err) {
  if (err.status !== 1) throw err; // 1 means no match
}
if (leaks) {
  git(templateDir, 'reset', '-q');
  console.error(`Client names left in the template; fix scripts/luit-template.json and sync again:\n${leaks}`);
  process.exit(1);
}
// Every file is regenerated, but only real differences reach the template:
// unchanged files produce no diff, so the commit holds just what changed.
const changes = git(templateDir, '-c', 'core.quotepath=false', 'diff', '--cached', '--name-status')
  .split('\n').filter(Boolean)
  .filter((line) => !line.endsWith('\t.luit-source'));
if (!changes.length) {
  git(templateDir, 'reset', '-q', '--hard');
  console.log(`Template already matches ${sourceName}@${short}; nothing to sync.`);
  process.exit(0);
}
const summary = changes.map((line) => {
  const [status, ...rest] = line.split('\t');
  return `  ${{ A: 'added   ', M: 'changed ', D: 'removed ', R: 'renamed ' }[status[0]] || status.padEnd(8)} ${rest.join(' -> ')}`;
}).join('\n');
console.log(`${changes.length} file${changes.length === 1 ? '' : 's'} differ from the template:\n${summary}`);
if (shouldCommit) {
  git(templateDir, 'commit', '-q', '-m', `Sync from ${sourceName}@${short}`, '-m', `Generated by scripts/sync-luit-template.mjs from ${sha}.\n\n${summary}`);
  console.log(`Template committed: Sync from ${sourceName}@${short}`);
} else {
  console.log(`Template updated from ${sourceName}@${short}; review and commit it there.`);
}
