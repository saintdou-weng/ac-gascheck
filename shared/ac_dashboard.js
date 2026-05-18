/**
 * AC_GASCHECK Platform — Shared Dashboard Helpers
 * Renders KPI cards, trend charts, comparison tables
 */
const AC_DASH = (() => {
  const _chartInsts = {};

  // Render KPI grid
  const renderKpis = (containerId, items) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = items.map(item => `
      <div style="background:#fff;border:1px solid var(--border,#e4e8f0);border-radius:12px;padding:12px 10px;text-align:center;position:relative;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.05)">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${item.color||'#4f6ef7'}"></div>
        <div style="font-size:20px;margin-bottom:4px">${item.icon||'📊'}</div>
        <div style="font-size:22px;font-weight:700;line-height:1;color:var(--text,#1a2035)">${item.value ?? '—'}</div>
        <div style="font-size:9px;color:var(--text2,#556080);font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-top:3px">${item.label||''}</div>
        ${item.sub ? `<div style="font-size:9px;color:var(--text3,#9aa3bc);margin-top:2px">${item.sub}</div>` : ''}
      </div>`).join('');
  };

  // Render a chart using Chart.js (auto-destroys previous instance)
  const renderChart = (canvasId, type, labels, datasets, opts = {}) => {
    if (_chartInsts[canvasId]) { _chartInsts[canvasId].destroy(); }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    _chartInsts[canvasId] = new Chart(ctx, {
      type,
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { font:{ size:10, family:'DM Sans,IBM Plex Sans,Noto Sans TC,sans-serif' }, color:'#556080' } },
          tooltip: { bodyFont:{ size:11 } },
        },
        scales: (type==='bar'||type==='line') ? {
          x: { ticks:{ font:{ size:9 }, color:'#9aa3bc' }, grid:{ color:'#e4e8f0' } },
          y: { ticks:{ font:{ size:9 }, color:'#9aa3bc' }, grid:{ color:'#e4e8f0' } },
        } : {},
        ...opts,
      }
    });
    return _chartInsts[canvasId];
  };

  // Render a compact comparison table (this month vs last month)
  const renderComparison = (containerId, rows) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>
        ${['指標','本月','上月','變動'].map(h => `<th style="background:var(--bg,#f4f6fb);padding:5px 8px;text-align:left;font-weight:700;color:var(--text2,#556080);border-bottom:2px solid var(--border,#e4e8f0);font-size:9px;white-space:nowrap">${h}</th>`).join('')}
      </tr></thead>
      <tbody>${rows.map(r => {
        const pct = r.prev > 0 ? ((r.cur - r.prev) / r.prev * 100).toFixed(1) : null;
        const chg = pct !== null ? (r.cur >= r.prev ? `▲${Math.abs(pct)}%` : `▼${Math.abs(pct)}%`) : '—';
        const cls = r.cur > r.prev ? 'color:#c04040;font-weight:700' : r.cur < r.prev ? 'color:#1e7a45;font-weight:700' : 'color:#9aa3bc';
        return `<tr>
          <td style="padding:5px 8px;border-bottom:1px solid var(--border,#e4e8f0)">${r.label}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--border,#e4e8f0);font-weight:700">${r.cur ?? '—'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--border,#e4e8f0)">${r.prev ?? '—'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--border,#e4e8f0);${cls}">${chg}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  };

  // Standard palette
  const PAL = ['#4f6ef7','#22c55e','#ef4444','#f59e0b','#0891b2','#7c3aed','#e8640a','#14b8a6'];

  return { renderKpis, renderChart, renderComparison, PAL };
})();
