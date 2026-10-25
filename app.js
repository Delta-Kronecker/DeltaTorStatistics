const REPO = 'Delta-Kronecker/ForInstallationStatistics';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=100`;
const HISTORY_URL = 'data/history.json';


// Keep in sync with the asset lists in scripts/collect.mjs
const INSTALL_ASSETS = ['deltatorandroid213'];
const CONNECT_ASSETS = ['connected'];

const els = {
  installs: document.getElementById('androidInstalls'),
  connects: document.getElementById('androidConnects'),
  lastUpdate: document.getElementById('lastUpdate'),
  errorBox: document.getElementById('errorBox'),
  ranges: document.getElementById('ranges'),
  chartEmpty: document.getElementById('chartEmpty'),
};

const state = {
  history: { points: [] },
  rangeDays: 1,
  chart: null,
};

const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n));

function classify(name) {
  const k = name.toLowerCase();
  if (INSTALL_ASSETS.includes(k)) return 'install';
  if (CONNECT_ASSETS.includes(k)) return 'connect';
  return 'other';
}

function showError(msg) {
  els.errorBox.textContent = msg;
  els.errorBox.classList.remove('hidden');
  setTimeout(() => els.errorBox.classList.add('hidden'), 8000);
}

/* ---------------- data ---------------- */

function collectAssets(releases) {
  const list = [];
  for (const rel of releases) {
    for (const a of rel.assets || []) {
      list.push({
        name: a.name,
        downloads: a.download_count,
        published: rel.published_at || rel.created_at,
        release: rel.tag_name,
        kind: classify(a.name),
      });
    }
  }
  return list.sort((a, b) => b.downloads - a.downloads);
}

function totals(assets) {
  return {
    installs: assets.filter((a) => a.kind === 'install').reduce((s, a) => s + a.downloads, 0),
    connects: assets.filter((a) => a.kind === 'connect').reduce((s, a) => s + a.downloads, 0),
  };
}

function pointsIn(points, days) {
  if (days === 'all') return points;
  const cutoff = Date.now() - days * 86400000;
  return points.filter((p) => new Date(p.t).getTime() >= cutoff);
}

/* ---------------- rendering ---------------- */

function renderTiles(assets) {
  const t = totals(assets);
  animateNumber(els.installs, t.installs);
  animateNumber(els.connects, t.connects);
}

/* ---------------- chart ---------------- */

const EMPTY_MSG = 'Not enough snapshots in this range yet.<br><small>A snapshot is collected every hour.</small>';

// Asia/Tehran is UTC+3:30; Iran has had no DST since 2022
const TZ_OFFSET_MS = 3.5 * 60 * 60 * 1000;

const floorTehran = (time, ms) => Math.floor((time + TZ_OFFSET_MS) / ms) * ms - TZ_OFFSET_MS;

function bucketConfig(days) {
  if (days === 1) return { ms: 3600000, fmt: (d) => d.getUTCHours().toString().padStart(2, '0') + ':00' };
  if (days === 7) return { ms: 21600000, fmt: (d) => `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${d.getUTCHours().toString().padStart(2, '0')}h` };
  return { ms: 86400000, fmt: (d) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}` };
}

function buildSeries(points, days) {
  const cfg = bucketConfig(days);
  const slice = pointsIn(points, days);
  if (slice.length < 2) return null;

  const buckets = new Map();
  const keys = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1];
    const cur = slice[i];
    const time = new Date(cur.t).getTime();
    const bucket = floorTehran(time, cfg.ms);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, { installs: 0, connects: 0, t: bucket });
      keys.push(bucket);
    }
    const b = buckets.get(bucket);
    const di = cur.assets.install - prev.assets.install;
    const dc = cur.assets.connect - prev.assets.connect;
    if (di > 0) b.installs += di;
    if (dc > 0) b.connects += dc;
  }
  keys.sort((a, b) => a - b);

  return {
    labels: keys.map((k) => cfg.fmt(new Date(k + TZ_OFFSET_MS))),
    installs: keys.map((k) => buckets.get(k).installs),
    connects: keys.map((k) => buckets.get(k).connects),
  };
}

function renderChart() {
  const series = buildSeries(state.history.points || [], state.rangeDays);
  if (!series || typeof Chart === 'undefined') {
    els.chartEmpty.innerHTML = typeof Chart === 'undefined'
      ? 'Chart library failed to load.<br><small>Reload the page.</small>'
      : EMPTY_MSG;
    els.chartEmpty.classList.remove('hidden');
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    return;
  }
  els.chartEmpty.classList.add('hidden');

  const ctx = document.getElementById('chart');
  if (state.chart) {
    state.chart.data.labels = series.labels;
    state.chart.data.datasets[0].data = series.installs;
    state.chart.data.datasets[1].data = series.connects;
    state.chart.update();
    return;
  }

  state.chart = new Chart(ctx, {
    data: {
      labels: series.labels,
      datasets: [
        {
          type: 'line',
          label: 'Installs',
          data: series.installs,
          borderColor: '#2196f3',
          backgroundColor: 'rgba(33, 150, 243, .12)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: '#2196f3',
          tension: .3,
          fill: true,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: 'Connections',
          data: series.connects,
          borderColor: '#7fd4ff',
          backgroundColor: 'rgba(127, 212, 255, .08)',
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: '#7fd4ff',
          tension: .3,
          fill: false,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111a2e',
          borderColor: '#1f2b47',
          borderWidth: 1,
          titleColor: '#e8eef7',
          bodyColor: '#a9b6cc',
          padding: 10,
          displayColors: true,
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,.04)' },
          ticks: { color: '#7e8aa3', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
          border: { color: '#1e293f' },
        },
        y: {
          position: 'left',
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,.04)' },
          ticks: { color: '#7e8aa3', font: { size: 11 }, precision: 0 },
          border: { color: '#1e293f' },
          title: { display: true, text: 'Installs', color: '#7e8aa3', font: { size: 11 } },
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { color: '#7e8aa3', font: { size: 11 }, precision: 0 },
          border: { color: '#1e293f' },
          title: { display: true, text: 'Connections', color: '#7e8aa3', font: { size: 11 } },
        },
      },
    },
  });
}

/* ---------------- helpers ---------------- */

function animateNumber(el, target) {
  const start = Number(el.dataset.value || 0);
  el.dataset.value = target;
  if (start === target) {
    el.textContent = fmt(target);
    return;
  }
  const t0 = performance.now();
  const dur = 800;
  (function step(t) {
    const p = Math.min((t - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(start + (target - start) * eased);
    if (p < 1) requestAnimationFrame(step);
  })(performance.now());
}

/* ---------------- load ---------------- */

async function loadHistory() {
  try {
    const res = await fetch(`${HISTORY_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    state.history = await res.json();
  } catch {
    state.history = { points: [] };
  }
}

async function loadLive() {
  const releases = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${API}&page=${page}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.status === 403 || res.status === 429) throw new Error('GitHub API rate limit reached. Try again in a few minutes.');
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const batch = await res.json();
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  return releases;
}

async function load() {
  await loadHistory();

  try {
    renderTiles(collectAssets(await loadLive()));
  } catch (err) {
    showError(err.message || 'Failed to load statistics.');
    const last = (state.history.points || []).at(-1);
    if (last) {
      animateNumber(els.installs, last.assets.install);
      animateNumber(els.connects, last.assets.connect);
    }
  }

  renderChart();
  els.lastUpdate.textContent = `Updated ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })}`;
}

els.ranges.addEventListener('click', (e) => {
  const btn = e.target.closest('.range');
  if (!btn) return;
  els.ranges.querySelectorAll('.range').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  const v = btn.dataset.days;
  state.rangeDays = v === 'all' ? 'all' : Number(v);
  renderChart();
});

load();
setInterval(load, 5 * 60 * 1000);
