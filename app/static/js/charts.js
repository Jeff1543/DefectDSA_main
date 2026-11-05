// ==========================================================================
// Pustaka grafik SVG ringan (tanpa dependensi) — dipakai halaman uji asumsi,
// hasil, dan laporan.
// ==========================================================================

const Charts = (() => {
  const esc = RS.esc;
  const f = (n, d = 2) => RS.fmtNum(n, d);
  const PAL = ["#2e2e37", "#8a3329", "#6b6b78", "#4a5d7a", "#b8860b", "#a3a3ad"];
  const short = (t, n = 12) => (String(t).length > n ? String(t).slice(0, n - 1) + "…" : String(t));

  function ticks(lo, hi, count = 4) {
    const span = hi - lo || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function marker(shape, x, y, color, r = 3.4) {
    if (shape === 1) return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${color}" fill-opacity=".75"/>`;
    if (shape === 2) return `<polygon points="${x},${y - r - 0.6} ${x + r + 0.6},${y + r} ${x - r - 0.6},${y + r}" fill="${color}" fill-opacity=".75"/>`;
    if (shape === 3) return `<polygon points="${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}" fill="${color}" fill-opacity=".75"/>`;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity=".7"/>`;
  }

  function yAxis(lo, hi, y, pl, W, pr) {
    return ticks(lo, hi)
      .map((t) => `<line class="ch-grid" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="ch-tx" x="${pl - 6}" y="${y(t) + 3}" text-anchor="end">${f(t, Math.abs(t) < 10 && t % 1 ? 1 : 0)}</text>`)
      .join("");
  }

  // ---------------- boxplot per kelompok ----------------
  function boxGroups(groups, { height = 230 } = {}) {
    const W = Math.max(340, 78 * groups.length + 70), H = height, pl = 46, pr = 10, pt = 12, pb = 42;
    let lo = Math.min(...groups.map((g) => g.min)), hi = Math.max(...groups.map((g) => g.max));
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    const y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
    const slot = (W - pl - pr) / groups.length;
    const bw = Math.min(48, slot * 0.56);

    const body = groups
      .map((g, i) => {
        const cx = pl + slot * (i + 0.5), c = PAL[i % PAL.length];
        const wl = g.whisker_low ?? g.min, wh = g.whisker_high ?? g.max;
        const out = [g.min < wl ? g.min : null, g.max > wh ? g.max : null].filter((v) => v !== null);
        return `<g><title>${esc(g.label)} (n=${g.n}): min ${f(g.min)}, Q1 ${f(g.q1)}, median ${f(g.median)}, Q3 ${f(g.q3)}, maks ${f(g.max)}, rata-rata ${f(g.mean)}</title>
          <line class="ch-whisker" x1="${cx}" x2="${cx}" y1="${y(wl)}" y2="${y(wh)}"/>
          <line class="ch-whisker" x1="${cx - bw / 4}" x2="${cx + bw / 4}" y1="${y(wl)}" y2="${y(wl)}"/>
          <line class="ch-whisker" x1="${cx - bw / 4}" x2="${cx + bw / 4}" y1="${y(wh)}" y2="${y(wh)}"/>
          <rect x="${cx - bw / 2}" y="${y(g.q3)}" width="${bw}" height="${Math.max(2, y(g.q1) - y(g.q3))}" rx="3" fill="${c}" fill-opacity=".16" stroke="${c}" stroke-width="1.6"/>
          <line x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${y(g.median)}" y2="${y(g.median)}" stroke="${c}" stroke-width="3"/>
          <polygon points="${cx},${y(g.mean) - 5} ${cx + 5},${y(g.mean)} ${cx},${y(g.mean) + 5} ${cx - 5},${y(g.mean)}" fill="#fff" stroke="${c}" stroke-width="1.5"/>
          ${out.map((v) => `<circle cx="${cx}" cy="${y(v)}" r="2.8" fill="none" stroke="${c}" stroke-width="1.3"/>`).join("")}
          <text class="ch-tx" x="${cx}" y="${H - 22}" text-anchor="middle">${esc(short(g.label))}</text>
          <text class="ch-tx2" x="${cx}" y="${H - 9}" text-anchor="middle">n=${g.n}</text></g>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="Boxplot per kelompok">${yAxis(lo, hi, y, pl, W, pr)}${body}</svg>`;
  }

  // ---------------- grafik sebar + garis regresi ----------------
  function scatter(pair, { groupLines = false } = {}) {
    const W = 460, H = 270, pl = 50, pr = 14, pt = 12, pb = 44;
    const xs = pair.points.map((p) => p[0]), ys = pair.points.map((p) => p[1]);
    let xlo = Math.min(...xs), xhi = Math.max(...xs), ylo = Math.min(...ys), yhi = Math.max(...ys);
    const px = (xhi - xlo) * 0.05 || 1, py = (yhi - ylo) * 0.08 || 1;
    xlo -= px; xhi += px; ylo -= py; yhi += py;
    const x = (v) => pl + (W - pl - pr) * ((v - xlo) / (xhi - xlo));
    const y = (v) => pt + (H - pt - pb) * (1 - (v - ylo) / (yhi - ylo));

    const dots = pair.points.map((p) => marker(pair.groups.length ? p[2] % 4 : 0, +x(p[0]).toFixed(1), +y(p[1]).toFixed(1), PAL[(pair.groups.length ? p[2] : 0) % PAL.length])).join("");
    const line = (slope, intercept, color, dash) =>
      `<line x1="${x(xlo)}" y1="${y(slope * xlo + intercept)}" x2="${x(xhi)}" y2="${y(slope * xhi + intercept)}" stroke="${color}" stroke-width="2" ${dash ? 'stroke-dasharray="6 4"' : ""}/>`;

    let lines;
    if (groupLines && pair.group_lines.length) {
      lines = pair.group_lines.map((g) => line(g.slope, g.intercept, PAL[pair.groups.indexOf(g.group) % PAL.length], false)).join("");
    } else {
      lines = line(pair.overall.slope, pair.overall.intercept, "#2e2e37", true);
    }
    const xt = ticks(xlo, xhi, 5).map((t) => `<text class="ch-tx" x="${x(t)}" y="${H - pb + 14}" text-anchor="middle">${f(t, Math.abs(t) < 10 && t % 1 ? 1 : 0)}</text>`).join("");
    const legend = pair.groups.length
      ? `<div class="ch-legend">${pair.groups.map((g, i) => `<span><svg width="14" height="14" viewBox="0 0 14 14">${marker(i % 4, 7, 7, PAL[i % PAL.length], 4)}</svg>${esc(short(g, 18))}</span>`).join("")}</div>`
      : "";
    return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="Grafik sebar ${esc(pair.x)} dan ${esc(pair.y)}">
      ${yAxis(ylo, yhi, y, pl, W, pr)}<line class="ch-axis" x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}"/>${xt}
      ${dots}${lines}
      <text class="ch-tx2" x="${(pl + W - pr) / 2}" y="${H - 6}" text-anchor="middle">${esc(pair.x)}</text>
      <text class="ch-tx2" transform="translate(11 ${(pt + H - pb) / 2}) rotate(-90)" text-anchor="middle">${esc(short(pair.y, 24))}</text></svg>${legend}`;
  }

  // ---------------- histogram + kurva normal ----------------
  function histNormal(s) {
    const W = 440, H = 210, pl = 34, pr = 10, pt = 10, pb = 28;
    const n = s.counts.length, lo = s.edges[0], hi = s.edges[n], bwid = (hi - lo) / n;
    const x = (v) => pl + ((v - lo) / (hi - lo)) * (W - pl - pr);
    const curve = (v) => s.n * bwid * (Math.exp(-0.5 * ((v - s.mean) / s.std) ** 2) / (s.std * Math.sqrt(2 * Math.PI)));
    const pts = [];
    for (let i = 0; i <= 60; i++) pts.push(lo + ((hi - lo) * i) / 60);
    const max = Math.max(...s.counts, ...pts.map(curve), 1) * 1.08;
    const y = (v) => pt + (H - pt - pb) * (1 - v / max);
    const bars = s.counts.map((c, i) => `<rect class="ch-bar" x="${(x(s.edges[i]) + 1).toFixed(1)}" y="${y(c).toFixed(1)}" width="${Math.max(1, x(s.edges[i + 1]) - x(s.edges[i]) - 2).toFixed(1)}" height="${(H - pb - y(c)).toFixed(1)}" rx="2"><title>${f(s.edges[i], 2)} – ${f(s.edges[i + 1], 2)}: ${c} data</title></rect>`).join("");
    const path = pts.map((v, i) => `${i ? "L" : "M"}${x(v).toFixed(1)},${y(curve(v)).toFixed(1)}`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="Histogram dengan kurva normal">
      ${yAxis(0, max, y, pl, W, pr)}${bars}<path d="${path}" fill="none" stroke="#8a3329" stroke-width="2"/>
      <line class="ch-axis" x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}"/>
      <text class="ch-tx" x="${pl}" y="${H - 10}">${f(lo, 2)}</text><text class="ch-tx" x="${W - pr}" y="${H - 10}" text-anchor="end">${f(hi, 2)}</text></svg>`;
  }

  // ---------------- Q-Q plot ----------------
  function qq(s) {
    const W = 290, H = 210, pl = 34, pr = 10, pt = 10, pb = 30;
    const t = s.qq.theoretical, v = s.qq.sample;
    const lo = Math.min(...t, ...v) - 0.2, hi = Math.max(...t, ...v) + 0.2;
    const x = (a) => pl + ((a - lo) / (hi - lo)) * (W - pl - pr);
    const y = (a) => pt + (H - pt - pb) * (1 - (a - lo) / (hi - lo));
    const dots = t.map((a, i) => `<circle cx="${x(a).toFixed(1)}" cy="${y(v[i]).toFixed(1)}" r="2.6" fill="#2e2e37" fill-opacity=".7"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="Q-Q plot normalitas">
      ${yAxis(lo, hi, y, pl, W, pr)}<line class="ch-axis" x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}"/>
      <line x1="${x(lo)}" y1="${y(lo)}" x2="${x(hi)}" y2="${y(hi)}" stroke="#8a3329" stroke-width="1.8" stroke-dasharray="6 4"/>${dots}
      <text class="ch-tx2" x="${(pl + W - pr) / 2}" y="${H - 8}" text-anchor="middle">Kuantil normal teoretis</text></svg>`;
  }

  // ---------------- simpangan baku per kelompok (Box's M) ----------------
  function groupSd(viz) {
    const W = Math.max(360, 90 * viz.groups.length + 70), H = 230, pl = 40, pr = 10, pt = 12, pb = 44;
    const max = Math.max(...viz.groups.flatMap((g) => g.sds), 0.0001) * 1.12;
    const y = (v) => pt + (H - pt - pb) * (1 - v / max);
    const slot = (W - pl - pr) / viz.groups.length, k = viz.variables.length, bw = Math.min(26, (slot * 0.8) / k);
    const bars = viz.groups.map((g, i) =>
      g.sds.map((sd, j) => {
        const bx = pl + slot * i + (slot - bw * k) / 2 + bw * j;
        return `<rect x="${bx}" y="${y(sd)}" width="${bw - 2}" height="${H - pb - y(sd)}" rx="2" fill="${PAL[j % PAL.length]}"><title>${esc(g.label)} · ${esc(viz.variables[j])}: SD ${f(sd)}</title></rect>`;
      }).join("") + `<text class="ch-tx" x="${pl + slot * (i + 0.5)}" y="${H - 22}" text-anchor="middle">${esc(short(g.label))}</text><text class="ch-tx2" x="${pl + slot * (i + 0.5)}" y="${H - 9}" text-anchor="middle">n=${g.n}</text>`
    ).join("");
    const legend = `<div class="ch-legend">${viz.variables.map((v, j) => `<span><i style="background:${PAL[j % PAL.length]}"></i>${esc(short(v, 20))}</span>`).join("")}</div>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="Simpangan baku per kelompok">${yAxis(0, max, y, pl, W, pr)}${bars}</svg>${legend}`;
  }


  // ---------------- Peta risiko berbentuk sapi ----------------
  const RISK_COLOR = { high: "#b42318", medium: "#f97316", low: "#7b8a6a", not_evaluated: "#d3d0d6" };
  const RISK_LABEL = { high: "Tinggi", medium: "Sedang", low: "Rendah", not_evaluated: "Belum dinilai" };
  const ZONES = {
    pipi:    { name: "Pipi",    box: [34, 82, 64, 56], label: [64, 104] },
    pundak:  { name: "Pundak",  box: [112, 56, 76, 54], label: [150, 84] },
    badan:   { name: "Badan",   box: [188, 56, 82, 54], label: [229, 84] },
    pinggul: { name: "Pinggul", box: [270, 56, 76, 106], label: [308, 112] },
    perut:   { name: "Perut",   box: [112, 110, 158, 52], label: [191, 138] },
  };

  function cowMap(items) {
    const byLoc = {};
    items.forEach((r) => { if (ZONES[r.location]) byLoc[r.location] = r; });

    const zone = (key) => {
      const z = ZONES[key], r = byLoc[key];
      const fill = r ? RISK_COLOR[r.risk_level] || RISK_COLOR.not_evaluated : "url(#cowHatch)";
      const tip = r ? `${z.name}: rata-rata ${f(r.mean_area_cm2)} (${RISK_LABEL[r.risk_level]})` : `${z.name}: tidak ada data`;
      const txt = r
        ? `<text x="${z.label[0]}" y="${z.label[1] - 2}" text-anchor="middle" class="cow-lab">${z.name}</text><text x="${z.label[0]}" y="${z.label[1] + 11}" text-anchor="middle" class="cow-val">${f(r.mean_area_cm2)}</text>`
        : `<text x="${z.label[0]}" y="${z.label[1] + 3}" text-anchor="middle" class="cow-lab muted">${z.name}</text>`;
      return { shape: `<rect x="${z.box[0]}" y="${z.box[1]}" width="${z.box[2]}" height="${z.box[3]}" fill="${fill}" fill-opacity="${r ? 0.88 : 1}"><title>${esc(tip)}</title></rect>`, txt };
    };
    const zs = Object.keys(ZONES).map(zone);

    return `<svg viewBox="0 0 400 236" class="ch cow" role="img" aria-label="Peta risiko defek pada tubuh sapi">
      <defs>
        <pattern id="cowHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#efedf0"/><line x1="0" y1="0" x2="0" y2="7" stroke="#d3d0d6" stroke-width="2"/></pattern>
        <clipPath id="cowClip"><rect x="110" y="55" width="236" height="107" rx="38"/><path d="M118 70 L96 61 Q70 58 52 78 L36 106 Q32 124 48 130 L70 132 Q88 130 100 120 L120 126 Z"/></clipPath>
      </defs>
      <!-- kaki -->
      <g fill="#fff" stroke="#2e2e37" stroke-width="2" stroke-linejoin="round">
        <rect x="134" y="150" width="20" height="62" rx="6"/><rect x="170" y="150" width="20" height="62" rx="6"/>
        <rect x="290" y="150" width="20" height="62" rx="6"/><rect x="324" y="150" width="20" height="62" rx="6"/>
      </g>
      <g fill="#2e2e37"><rect x="134" y="206" width="20" height="8" rx="3"/><rect x="170" y="206" width="20" height="8" rx="3"/><rect x="290" y="206" width="20" height="8" rx="3"/><rect x="324" y="206" width="20" height="8" rx="3"/></g>
      <!-- ekor -->
      <path d="M345 76 Q378 84 372 128" fill="none" stroke="#2e2e37" stroke-width="3" stroke-linecap="round"/><ellipse cx="372" cy="134" rx="6" ry="10" fill="#2e2e37"/>
      <!-- zona warna (dipotong mengikuti siluet) -->
      <g clip-path="url(#cowClip)">${zs.map((z) => z.shape).join("")}</g>
      <!-- siluet -->
      <rect x="110" y="55" width="236" height="107" rx="38" fill="none" stroke="#2e2e37" stroke-width="2.4"/>
      <path d="M118 70 L96 61 Q70 58 52 78 L36 106 Q32 124 48 130 L70 132 Q88 130 100 120 L120 126" fill="none" stroke="#2e2e37" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M92 62 Q86 46 98 42 M72 66 Q68 50 58 48" fill="none" stroke="#2e2e37" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="86" cy="76" rx="9" ry="5" transform="rotate(-25 86 76)" fill="#fff" stroke="#2e2e37" stroke-width="2"/>
      <circle cx="62" cy="92" r="3.2" fill="#2e2e37"/><ellipse cx="42" cy="119" rx="9" ry="6" fill="#fff" fill-opacity=".55" stroke="#2e2e37" stroke-width="1.6"/>
      ${zs.map((z) => z.txt).join("")}
    </svg>
    <div class="ch-legend cow-legend">${["high", "medium", "low"].map((k) => `<span><i style="background:${RISK_COLOR[k]}"></i>${RISK_LABEL[k]}</span>`).join("")}<span><i class="hatch"></i>Tidak ada data</span></div>`;
  }

  function riskPanel(items) {
    const known = items.filter((r) => ZONES[r.location]);
    const ranked = items.slice().sort((a, b) => b.mean_area_cm2 - a.mean_area_cm2);
    const max = Math.max(...ranked.map((r) => r.mean_area_cm2), 0.0001);
    const list = ranked
      .map((r) => `<div class="risk-row"><span class="rk-name" title="${esc(r.location)}">${esc(r.location)}</span>
        <div class="bar"><span style="width:${Math.max(3, (r.mean_area_cm2 / max) * 100)}%;background:${RISK_COLOR[r.risk_level] || RISK_COLOR.not_evaluated}"></span></div>
        <span><span class="lv">${RISK_LABEL[r.risk_level] || ""}</span> · ${f(r.mean_area_cm2)}</span></div>`)
      .join("");
    const unrated = items.every((r) => r.risk_level === "not_evaluated");
    const note = unrated
      ? '<p class="res-note">Tingkat risiko (warna) dinilai relatif antar lokasi, sehingga memerlukan minimal dua lokasi tubuh. Pilih lebih dari satu variabel dependen agar warnanya terisi.</p>'
      : known.length < items.length
      ? '<p class="res-note">Variabel yang namanya tidak memuat lokasi tubuh (pipi, pundak, badan, pinggul, perut) hanya tampil pada daftar peringkat.</p>'
      : '<p class="res-note">Warna dihitung relatif terhadap rata-rata seluruh variabel dependen pada data ini (bukan klasifikasi statistik formal).</p>';
    return known.length
      ? `<div class="risk-panel"><div class="risk-map">${cowMap(items)}</div><div class="risk-rank"><h5>Peringkat rata-rata defek</h5>${list}${note}</div></div>`
      : `<div class="risk-rank">${list}${note}</div>`;
  }

  return { boxGroups, scatter, histNormal, qq, groupSd, cowMap, riskPanel };
})();
