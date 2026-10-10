// OCHE — eenvoudige SVG-lijngrafiek met tik-/hoverinfo. Geen externe bibliotheek.

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// points: [{ label, value, sub }]
export function lineChart(points, { height = 220, unit = '' } = {}) {
  if (!points.length) return '<div class="empty-chart">Nog geen gegevens. Rond een training af en je ziet hier je lijn groeien.</div>';
  const W = 600, H = height, padL = 36, padR = 14, padT = 16, padB = 28;
  const vals = points.map(p => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; }
  lo = Math.max(0, Math.floor((lo - 3) / 5) * 5);
  hi = Math.ceil((hi + 3) / 5) * 5;
  const x = i => points.length === 1 ? (padL + W - padR) / 2 : padL + (i * (W - padL - padR)) / (points.length - 1);
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const ticks = [];
  const step = Math.max(5, Math.ceil((hi - lo) / 4 / 5) * 5);
  for (let v = lo; v <= hi; v += step) {
    ticks.push(`<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}</text>`);
  }
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1).toFixed(1)} ${H - padB}L${x(0).toFixed(1)} ${H - padB}Z`;
  // trendlijn (kleinste kwadraten)
  let trend = '';
  if (points.length >= 3) {
    const n = points.length, mx = (n - 1) / 2, my = vals.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    vals.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
    const slope = num / den, b = my - slope * mx;
    trend = `<line x1="${x(0)}" y1="${y(b)}" x2="${x(n - 1)}" y2="${y(b + slope * (n - 1))}" class="trend"/>`;
  }
  const every = Math.ceil(points.length / 6);
  const labels = points.map((p, i) => (i % every === 0 || i === points.length - 1) ? `<text x="${x(i)}" y="${H - 8}" class="tick" text-anchor="middle">${esc(p.label)}</text>` : '').join('');
  const dots = points.map((p, i) => `<g class="pt" data-i="${i}"><circle cx="${x(i)}" cy="${y(p.value)}" r="14" class="hit"/><circle cx="${x(i)}" cy="${y(p.value)}" r="4" class="dot"/></g>`).join('');
  const data = esc(JSON.stringify(points.map(p => [p.label, p.value.toFixed(2).replace('.', ','), p.sub || ''])));
  return `<div class="chart" data-points="${data}" data-unit="${esc(unit)}">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Grafiek van je gemiddelde">
      <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.join('')}<path d="${area}" fill="url(#cg)"/><path d="${line}" class="line"/>${trend}${dots}${labels}
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;
}

export function bindChart(root) {
  root.querySelectorAll('.chart').forEach(chart => {
    const pts = JSON.parse(chart.dataset.points);
    const tip = chart.querySelector('.chart-tip');
    const show = g => {
      const [lab, val, sub] = pts[Number(g.dataset.i)];
      tip.innerHTML = `<b>${esc(val)}</b> <span>${esc(lab)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
      tip.hidden = false;
      chart.querySelectorAll('.pt.on').forEach(p => p.classList.remove('on'));
      g.classList.add('on');
    };
    chart.querySelectorAll('.pt').forEach(g => {
      g.addEventListener('pointerenter', () => show(g));
      g.addEventListener('click', () => show(g));
    });
  });
}
