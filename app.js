const REPO = 'Delta-Kronecker/ForInstallationStatistics';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=100`;

const INSTALL_ASSETS = ['deltatorandroid', 'deltatorandroid213'];
const CONNECT_ASSETS = ['connected'];

const els = {
  installs: document.getElementById('androidInstalls'),
  connects: document.getElementById('androidConnects'),
  table: document.getElementById('assetsTable').querySelector('tbody'),
  bars: document.getElementById('bars'),
  lastUpdate: document.getElementById('lastUpdate'),
  refreshBtn: document.getElementById('refreshBtn'),
  errorBox: document.getElementById('errorBox'),
};

const fmt = (n) => new Intl.NumberFormat('en-US').format(n);

function classify(name) {
  const key = name.toLowerCase();
  if (INSTALL_ASSETS.includes(key)) return 'install';
  if (CONNECT_ASSETS.includes(key)) return 'connect';
  return 'other';
}

function showError(msg) {
  els.errorBox.textContent = msg;
  els.errorBox.classList.remove('hidden');
  setTimeout(() => els.errorBox.classList.add('hidden'), 8000);
}

function render(releases) {
  const assets = [];
  for (const rel of releases) {
    for (const a of rel.assets || []) {
      assets.push({
        name: a.name,
        downloads: a.download_count,
        published: rel.published_at || rel.created_at,
        release: rel.tag_name,
        kind: classify(a.name),
      });
    }
  }
  assets.sort((a, b) => b.downloads - a.downloads);

  const installs = assets.filter((a) => a.kind === 'install').reduce((s, a) => s + a.downloads, 0);
  const connects = assets.filter((a) => a.kind === 'connect').reduce((s, a) => s + a.downloads, 0);

  animateNumber(els.installs, installs);
  animateNumber(els.connects, connects);

  els.table.innerHTML = assets.length
    ? assets.map(rowHtml).join('')
    : '<tr><td colspan="4" class="loading">No release assets found.</td></tr>';

  renderBars(assets);

  const now = new Date();
  els.lastUpdate.textContent = `Updated: ${now.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

function rowHtml(a) {
  const badge =
    a.kind === 'install'
      ? '<span class="badge badge-install">Android Install</span>'
      : a.kind === 'connect'
      ? '<span class="badge badge-connect">Android Connection</span>'
      : '<span class="badge badge-other">Other</span>';
  const date = a.published ? new Date(a.published).toISOString().slice(0, 10) : '—';
  return `<tr>
    <td>${escapeHtml(a.name)}</td>
    <td>${badge}</td>
    <td class="num">${fmt(a.downloads)}</td>
    <td class="date">${date}</td>
  </tr>`;
}

function renderBars(assets) {
  if (!assets.length) {
    els.bars.innerHTML = '<div class="loading">No data.</div>';
    return;
  }
  const max = Math.max(...assets.map((a) => a.downloads), 1);
  els.bars.innerHTML = assets
    .map(
      (a) => `
      <div class="bar-row">
        <div class="bar-meta">
          <span class="name">${escapeHtml(a.name)}</span>
          <span class="val">${fmt(a.downloads)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${a.kind === 'connect' ? 'connect' : a.kind === 'other' ? 'other' : ''}" data-w="${(a.downloads / max) * 100}"></div>
        </div>
      </div>`
    )
    .join('');

  requestAnimationFrame(() => {
    els.bars.querySelectorAll('.bar-fill').forEach((el) => {
      el.style.width = el.dataset.w + '%';
    });
  });
}

function animateNumber(el, target) {
  const start = Number(el.dataset.value || 0);
  el.dataset.value = target;
  if (start === target) {
    el.textContent = fmt(target);
    return;
  }
  const duration = 900;
  const t0 = performance.now();
  function step(t) {
    const p = Math.min((t - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(start + (target - start) * eased));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function load() {
  els.refreshBtn.classList.add('loading');
  try {
    const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.status === 403 || res.status === 429) {
      throw new Error('GitHub API rate limit reached. Try again in a few minutes.');
    }
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    render(await res.json());
  } catch (err) {
    showError(err.message || 'Failed to load statistics.');
    if (!els.table.querySelector('tr:not(.loading)')) {
      els.table.innerHTML = '<tr><td colspan="4" class="loading">Could not load data.</td></tr>';
    }
    els.lastUpdate.textContent = 'Update failed';
  } finally {
    els.refreshBtn.classList.remove('loading');
  }
}

els.refreshBtn.addEventListener('click', load);
load();
setInterval(load, 5 * 60 * 1000);
