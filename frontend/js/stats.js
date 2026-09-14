const STATUS_ITEMS = [
  { key: "todo", label: "待办", color: "#64748b" },
  { key: "doing", label: "进行中", color: "#0d9488" },
  { key: "done", label: "已完成", color: "#115e59" },
];

const PRIORITY_ITEMS = [
  { key: "high", label: "高", color: "#e11d48" },
  { key: "medium", label: "中", color: "#0f766e" },
  { key: "low", label: "低", color: "#94a3b8" },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pct(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function polar(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function donutSlicePath(cx, cy, outer, inner, start, end) {
  const sweep = end - start;
  if (sweep >= 359.999) {
    return [
      `M ${cx + outer} ${cy}`,
      `A ${outer} ${outer} 0 1 1 ${cx - outer} ${cy}`,
      `A ${outer} ${outer} 0 1 1 ${cx + outer} ${cy}`,
      `M ${cx + inner} ${cy}`,
      `A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy}`,
      `A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy}`,
    ].join(" ");
  }
  const large = sweep > 180 ? 1 : 0;
  const p0 = polar(cx, cy, outer, start);
  const p1 = polar(cx, cy, outer, end);
  const p2 = polar(cx, cy, inner, end);
  const p3 = polar(cx, cy, inner, start);
  return [
    `M ${p0.x.toFixed(3)} ${p0.y.toFixed(3)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
    `L ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${p3.x.toFixed(3)} ${p3.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function selectedClass(current, value) {
  if (!current) return "";
  return String(current) === String(value) ? " is-on" : " is-off";
}

function renderStatus(root, stats, filters) {
  const total = Number(stats.total) || 0;
  const slices = STATUS_ITEMS.map((item) => ({
    ...item,
    count: Number(stats[item.key]) || 0,
  }));

  if (!total) {
    root.innerHTML = `
      <div class="chart-status">
        <svg class="chart-donut" viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r="52" fill="none" stroke="#e2e8f0" stroke-width="16"></circle>
        </svg>
        <div class="chart-empty" style="min-height:auto">还没有任务</div>
      </div>`;
    return;
  }

  let angle = 0;
  const arcs = slices
    .filter((item) => item.count > 0)
    .map((item) => {
      const start = angle;
      const sweep = (item.count / total) * 360;
      angle += sweep;
      const on = selectedClass(filters.status, item.key);
      const title = `${item.label} ${item.count}件，占 ${pct(item.count, total)}`;
      return `<path class="donut-slice${on}" data-filter="status" data-value="${item.key}"
        d="${donutSlicePath(80, 80, 64, 40, start, start + sweep)}"
        fill="${item.color}" fill-rule="evenodd" tabindex="0" role="button" aria-label="${title}">
        <title>${title}</title>
      </path>`;
    })
    .join("");

  const legend = slices
    .map((item) => {
      const on = String(filters.status) === item.key ? " is-on" : "";
      const disabled = item.count === 0 ? " disabled" : "";
      return `<button type="button" class="chart-legend-item${on}" data-filter="status" data-value="${item.key}"${disabled}
        title="${item.label} ${item.count}件，占 ${pct(item.count, total)}">
        <span class="chart-legend-swatch" style="background:${item.color}"></span>
        <span>${item.label}</span>
        <span class="chart-legend-meta">${item.count} · ${pct(item.count, total)}</span>
      </button>`;
    })
    .join("");

  root.innerHTML = `
    <div class="chart-status">
      <svg class="chart-donut" viewBox="0 0 160 160" role="img" aria-label="状态分布">
        <circle cx="80" cy="80" r="52" fill="none" stroke="#e2e8f0" stroke-width="16"></circle>
        ${arcs}
        <text x="80" y="76" text-anchor="middle" font-size="18" font-weight="700" fill="#0f172a">${total}</text>
        <text x="80" y="94" text-anchor="middle" font-size="11" fill="#64748b">件</text>
      </svg>
      <div class="chart-legend">${legend}</div>
    </div>`;
}

function renderPriority(root, stats, filters) {
  const counts = stats.priority || {};
  const items = PRIORITY_ITEMS.map((item) => ({
    ...item,
    count: Number(counts[item.key]) || 0,
  }));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(...items.map((item) => item.count), 0);

  if (!total) {
    root.innerHTML = `<div class="chart-empty">还没有任务</div>`;
    return;
  }

  root.innerHTML = `<div class="pri-chart">${items
    .map((item) => {
      const height = max ? (item.count / max) * 100 : 0;
      const on = String(filters.priority) === item.key ? " is-on" : "";
      const disabled = item.count === 0 ? " disabled" : "";
      const title = `${item.label} ${item.count}件，占 ${pct(item.count, total)}`;
      return `<button type="button" class="pri-col${on}" data-filter="priority" data-value="${item.key}"${disabled} title="${title}">
        <span class="pri-count">${item.count}</span>
        <span class="pri-track"><span class="pri-fill" style="height:${height}%;background:${item.color}"></span></span>
        <span class="pri-label">${item.label}</span>
      </button>`;
    })
    .join("")}</div>`;
}

function renderAssignees(root, stats, filters) {
  const rows = Array.isArray(stats.assignees) ? stats.assignees : [];
  if (!rows.length) {
    root.innerHTML = `<div class="chart-empty">还没有任务</div>`;
    return;
  }

  const named = rows.slice(0, 7);
  const rest = rows.slice(7);
  const max = Math.max(...named.map((row) => row.count), rest.reduce((sum, row) => sum + row.count, 0), 1);

  const namedHtml = named
    .map((row) => {
      const width = (row.count / max) * 100;
      const rate = pct(row.done || 0, row.count);
      const on = String(filters.assignee) === String(row.user_id) ? " is-on" : "";
      const name = escapeHtml(row.username);
      return `<button type="button" class="rank-row${on}" data-filter="assignee" data-value="${row.user_id}"
        title="${name} ${row.count}件，完成率 ${rate}">
        <span class="rank-name">${name}</span>
        <span class="rank-track">
          <span class="rank-fill" style="width:${width}%"></span>
          <span class="rank-count">${row.count}</span>
        </span>
        <span class="rank-rate">${rate}</span>
      </button>`;
    })
    .join("");

  let restHtml = "";
  if (rest.length) {
    const count = rest.reduce((sum, row) => sum + row.count, 0);
    const done = rest.reduce((sum, row) => sum + (row.done || 0), 0);
    const width = (count / max) * 100;
    restHtml = `<div class="rank-row rank-row--rest" title="其余 ${count}件，完成率 ${pct(done, count)}">
      <span class="rank-name">其余</span>
      <span class="rank-track">
        <span class="rank-fill" style="width:${width}%;background:#94a3b8"></span>
        <span class="rank-count">${count}</span>
      </span>
      <span class="rank-rate">${pct(done, count)}</span>
    </div>`;
  }

  root.innerHTML = `<div class="rank-list">${namedHtml}${restHtml}</div>`;
}

export function initCharts(onSelect) {
  const page = document.getElementById("page-stats");
  if (!page || page.dataset.chartsBound) return;
  page.dataset.chartsBound = "1";

  const handle = (event) => {
    const hit = event.target.closest("[data-filter][data-value]");
    if (!hit || !page.contains(hit) || hit.disabled || hit.classList.contains("rank-row--rest")) return;
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    if (event.type === "keydown") event.preventDefault();
    onSelect(hit.dataset.filter, hit.dataset.value);
  };

  page.addEventListener("click", handle);
  page.addEventListener("keydown", handle);
}

export function renderCharts(stats, filters) {
  const data = stats || {};
  const current = filters || {};
  const status = document.getElementById("chart-status");
  const priority = document.getElementById("chart-priority");
  const assignees = document.getElementById("chart-assignees");
  if (status) renderStatus(status, data, current);
  if (priority) renderPriority(priority, data, current);
  if (assignees) renderAssignees(assignees, data, current);
}
