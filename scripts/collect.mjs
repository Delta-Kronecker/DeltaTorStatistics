import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REPO = process.env.STATS_REPO || 'Delta-Kronecker/ForInstallationStatistics';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=100`;
const HISTORY = path.resolve('data/history.json');
const MAX_POINTS = 90 * 24;
const MIN_GAP_MS = 50 * 60 * 1000;

const INSTALL = ['deltatorandroid213'];
const CONNECT = ['connected'];

const headers = { Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const res = await fetch(API, { headers });
if (!res.ok) {
  console.error(`GitHub API error: ${res.status}`);
  process.exit(1);
}
const releases = await res.json();

const assets = { install: 0, connect: 0, raw: {} };
for (const rel of releases) {
  for (const a of rel.assets || []) {
    const k = a.name.toLowerCase();
    assets.raw[a.name] = a.download_count;
    if (INSTALL.includes(k)) assets.install += a.download_count;
    if (CONNECT.includes(k)) assets.connect += a.download_count;
  }
}

let history = { updated: null, points: [] };
if (existsSync(HISTORY)) {
  try {
    history = JSON.parse(await readFile(HISTORY, 'utf8'));
  } catch {
    console.warn('history.json unreadable, recreating');
  }
}

const now = Date.now();
const last = history.points[history.points.length - 1];
if (!last || now - new Date(last.t).getTime() >= MIN_GAP_MS) {
  history.points.push({
    t: new Date(now).toISOString(),
    assets: { install: assets.install, connect: assets.connect },
  });
  if (history.points.length > MAX_POINTS) {
    history.points = history.points.slice(-MAX_POINTS);
  }
  history.updated = new Date(now).toISOString();
}

await mkdir(path.dirname(HISTORY), { recursive: true });
await writeFile(HISTORY, JSON.stringify(history, null, 2) + '\n');

console.log(
  `snapshots=${history.points.length} install=${assets.install} connect=${assets.connect}`
);
