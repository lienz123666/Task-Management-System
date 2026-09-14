const STATUS = [
  { key: "todo", label: "待办", color: "#7A8B96" },
  { key: "doing", label: "进行中", color: "#243542" },
  { key: "done", label: "已完成", color: "#C5D0D8" },
];

const PRIORITY = [
  { key: "high", label: "高", color: "#C9A227" },
  { key: "medium", label: "中", color: "#243542" },
  { key: "low", label: "低", color: "#C5D0D8" },
];

const ns = "http://www.w3.org/2000/svg";

function svgEl(name, attrs) {
  const node = document.createElementNS(ns, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function polar(cx, cy, r, angle) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, r, start, end) {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function showTip(event, text) {
  const tip = document.getElementById("chart-tip");
  tip.textContent = text;
  tip.hidden = false;
  const band = tip.parentElement.getBoundingClientRect();
  tip.style.left = `${event.clientX - band.left}px`;
  tip.style.top = `${event.clientY - band.top}px`;
}

function hideTip() {
  document.getElementById("chart-tip").hidden = true;
}

function bindHit(node, { title, disabled, selected, onToggle }) {
  node.classList.add("chart-hit");
  if (selected) node.classList.add("is-on");
  if (disabled) {
    node.setAttribute("aria-disabled", "true");
    return;
  }
  node.setAttribute("tabindex", "0");
  node.setAttribute("role", "button");
  node.setAttribute("aria-pressed", selected ? "true" : "false");
  const activate = (event) => {
    event.preventDefault();
    onToggle();
  };
  node.addEventListener("click", activate);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") activate(event);
  });
  node.addEventListener("pointermove", (event) => showTip(event, title));
  node.addEventListener("pointerleave", hideTip);
}

function renderLegend(root, items, selected, onToggle) {
  root.replaceChildren();
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${item.label} ${item.count}`;
    btn.disabled = item.count === 0;
    btn.setAttribute("aria-pressed", selected === item.key ? "true" : "false");
    btn.addEventListener("click", () => onToggle(item.key));
    root.append(btn);
  });
}

function renderRing(root, counts, total, selected, onToggle) {
  const svg = svgEl("svg", { viewBox: "0 0 120 120", role: "img" });
  const cx = 60;
  const cy = 60;
  const r = 38;
  if (total === 0) {
    svg.append(svgEl("circle", { cx, cy, r, fill: "none", stroke: "#C5D0D8", "stroke-width": 14 }));
  } else {
    let angle = 0;
    STATUS.forEach((item) => {
      const count = counts[item.key] || 0;
      if (!count) return;
      const sweep = (count / total) * 360;
      const path = svgEl("path", {
        d: arcPath(cx, cy, r, angle, angle + sweep - 0.4),
        fill: "none",
        stroke: item.color,
        "stroke-width": selected === item.key ? 18 : 14,
      });
      bindHit(path, {
        title: `${item.label} ${count}件，占 ${Math.round((count / total) * 100)}%`,
        disabled: false,
        selected: selected === item.key,
        onToggle: () => onToggle(item.key),
      });
      svg.append(path);
      angle += sweep;
    });
  }
  const label = svgEl("text", { x: cx, y: cy + 5, "text-anchor": "middle", fill: "#243542", "font-size": "16" });
  label.textContent = `${total}`;
  svg.append(label);
  root.replaceChildren(svg);
}

function renderColumns(root, counts, total, selected, onToggle) {
  const svg = svgEl("svg", { viewBox: "0 0 180 110", role: "img" });
  const max = Math.max(total, 1);
  PRIORITY.forEach((item, index) => {
    const count = counts[item.key] || 0;
    const x = 18 + index * 58;
    const h = total === 0 ? 0 : Math.max((count / max) * 72, count ? 4 : 0);
    const y = 80 - h;
    svg.append(svgEl("rect", { x, y: 8, width: 36, height: 72, fill: "#EEF2F4" }));
    const bar = svgEl("rect", { x, y, width: 36, height: h, fill: item.color });
    bindHit(bar, {
      title: `${item.label} ${count}件`,
      disabled: count === 0,
      selected: selected === item.key,
      onToggle: () => onToggle(item.key),
    });
    svg.append(bar);
    const caption = svgEl("text", {
      x: x + 18,
      y: 98,
      "text-anchor": "middle",
      fill: "#5C6B75",
      "font-size": "11",
    });
    caption.textContent = `${item.label} ${count}`;
    svg.append(caption);
  });
  root.replaceChildren(svg);
}

function visibleAssignees(assignees) {
  if (assignees.length <= 8) return assignees;
  const head = assignees.slice(0, 7);
  const rest = assignees.slice(7).reduce((sum, row) => sum + row.count, 0);
  return [...head, { user_id: null, username: "其余", count: rest }];
}

function renderBars(root, assignees, selected, onToggle) {
  const rows = visibleAssignees(assignees);
  const height = Math.max(rows.length, 1) * 22 + 8;
  const svg = svgEl("svg", { viewBox: `0 0 280 ${height}`, role: "img" });
  const max = Math.max(...rows.map((row) => row.count), 1);
  if (rows.length === 0) {
    const empty = svgEl("text", { x: 0, y: 16, fill: "#5C6B75", "font-size": "12" });
    empty.textContent = "还没有任务";
    svg.append(empty);
  }
  rows.forEach((row, index) => {
    const y = 4 + index * 22;
    const name = svgEl("text", { x: 0, y: y + 13, fill: "#243542", "font-size": "12" });
    name.textContent = row.username;
    svg.append(name);
    const width = (row.count / max) * 150;
    const bar = svgEl("rect", { x: 88, y: y + 2, width: Math.max(width, 0), height: 14, fill: "#243542" });
    if (row.user_id != null) {
      bindHit(bar, {
        title: `${row.username} ${row.count}件`,
        disabled: row.count === 0,
        selected: String(selected) === String(row.user_id),
        onToggle: () => onToggle(String(row.user_id)),
      });
    }
    svg.append(bar);
    const count = svgEl("text", { x: 246, y: y + 13, fill: "#5C6B75", "font-size": "12" });
    count.textContent = String(row.count);
    svg.append(count);
  });
  root.replaceChildren(svg);
}

export function renderStats(stats, filters, onFilter) {
  document.getElementById("stats-total").textContent = `${stats.total}件`;
  const statusItems = STATUS.map((item) => ({ ...item, count: stats[item.key] || 0 }));
  const priorityItems = PRIORITY.map((item) => ({ ...item, count: stats.priority?.[item.key] || 0 }));

  renderRing(document.getElementById("chart-status"), stats, stats.total, filters.status, (key) =>
    onFilter("status", key)
  );
  renderLegend(document.getElementById("legend-status"), statusItems, filters.status, (key) =>
    onFilter("status", key)
  );

  renderColumns(
    document.getElementById("chart-priority"),
    stats.priority || {},
    stats.total,
    filters.priority,
    (key) => onFilter("priority", key)
  );
  renderLegend(document.getElementById("legend-priority"), priorityItems, filters.priority, (key) =>
    onFilter("priority", key)
  );

  renderBars(document.getElementById("chart-assignee"), stats.assignees || [], filters.assignee, (key) =>
    onFilter("assignee", key)
  );
  renderLegend(
    document.getElementById("legend-assignee"),
    visibleAssignees(stats.assignees || [])
      .filter((row) => row.user_id != null)
      .map((row) => ({ key: String(row.user_id), label: row.username, count: row.count })),
    filters.assignee,
    (key) => onFilter("assignee", key)
  );
}
