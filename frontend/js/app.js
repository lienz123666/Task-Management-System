import { ApiError, api, request } from "./api.js";
import { isAdmin, login, logout, restoreSession, user } from "./auth.js";

const STATUS_LABEL = { todo: "待办", doing: "进行中", done: "已完成" };
const PRIORITY_LABEL = { high: "高", medium: "中", low: "低" };

const state = {
  route: "workbench",
  users: [],
  userSearch: "",
  userRole: "",
  filters: { status: "", priority: "", assignee: "" },
  page: 1,
  pageSize: 20,
  list: { items: [], total: 0, page: 1, page_size: 20 },
  recyclePage: 1,
  recycle: { items: [], total: 0 },
  stats: { total: 0, todo: 0, doing: 0, done: 0 },
  deletedCount: 0,
  drawer: { open: false, mode: "create", task: null, error: "" },
};

function $(id) {
  return document.getElementById(id);
}

function toast(message) {
  const el = $("toast");
  $("toast-msg").textContent = message;
  el.classList.remove("translate-y-8", "opacity-0");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("translate-y-8", "opacity-0"), 2800);
}

function later(message) {
  toast(message || "后续接入");
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function canMutate(task) {
  if (!task || task.deleted_at) return false;
  return isAdmin() || task.assignee_id === user().id;
}

function setRoute(route) {
  if ((route === "users" || route === "recycle") && !isAdmin()) route = "workbench";
  if (!["workbench", "stats", "users", "recycle"].includes(route)) route = "workbench";
  state.route = route;
  if (location.hash !== `#${route}`) location.hash = route;
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("is-shown"));
  $(`page-${route}`).classList.add("is-shown");
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.nav === route);
  });
}

function fillAssigneeSelect(select, includeAll) {
  const current = select.value;
  select.replaceChildren();
  if (includeAll) select.append(new Option("负责人: 全部成员", ""));
  state.users.forEach((item) => {
    const label = item.id === user().id ? `${item.username}（我）` : item.username;
    select.append(new Option(label, String(item.id)));
  });
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function statusBadge(status) {
  if (status === "doing") {
    return `<span class="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-100/70 px-2 py-0.5 text-xs text-teal-900"><span class="h-1.5 w-1.5 rounded-full bg-teal-600"></span>进行中</span>`;
  }
  if (status === "done") {
    return `<span class="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs text-teal-800">已完成</span>`;
  }
  return `<span class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700"><span class="h-1.5 w-1.5 rounded-full bg-slate-400"></span>待办</span>`;
}

function priorityCell(priority) {
  const color = priority === "high" ? "bg-rose-500 text-rose-700" : priority === "medium" ? "bg-amber-500 text-slate-700" : "bg-slate-400 text-slate-700";
  return `<span class="inline-flex items-center gap-1 text-xs font-semibold ${color.split(" ").slice(1).join(" ")}"><span class="h-2 w-2 rounded-full ${color.split(" ")[0]}"></span>${PRIORITY_LABEL[priority]}</span>`;
}

function syncChips() {
  document.querySelectorAll("#page-workbench .chip").forEach((chip) => {
    const on = state.filters[chip.dataset.filter] === chip.dataset.value;
    chip.classList.toggle("is-on", on);
  });
  $("filter-assignee").value = state.filters.assignee;
}

function renderTaskRows() {
  const root = $("task-rows");
  if (!state.list.items.length) {
    root.innerHTML = `<div class="px-4 py-8 text-center text-slate-400">还没有任务。新建一条，并指定负责人。</div>`;
  } else {
    root.innerHTML = state.list.items
      .map((task) => {
        const mutate = canMutate(task);
        return `<div class="task-row grid grid-cols-12 gap-2 items-center px-4 py-3">
          <div class="col-span-5 min-w-0 flex items-center gap-2">
            <span class="shrink-0 rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[10px] text-teal-800">#${task.id}</span>
            <span class="truncate font-medium text-slate-800">${escapeHtml(task.title)}</span>
          </div>
          <div class="col-span-2">${statusBadge(task.status)}</div>
          <div class="col-span-1">${priorityCell(task.priority)}</div>
          <div class="col-span-2 truncate text-slate-800">${escapeHtml(task.assignee_username)}</div>
          <div class="col-span-1 truncate text-slate-500">${formatTime(task.updated_at)}</div>
          <div class="col-span-1 flex justify-end gap-1">
            <button type="button" class="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-teal-800" data-open="${task.id}" title="查看">
              <span class="material-symbols-outlined text-[18px]">open_in_new</span>
            </button>
            ${
              mutate
                ? `<button type="button" class="rounded-lg p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700" data-del="${task.id}" title="删除">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>`
                : ""
            }
          </div>
        </div>`;
      })
      .join("");
  }
  const pages = Math.max(1, Math.ceil(state.list.total / state.list.page_size) || 1);
  $("pager-info").textContent = `共 ${state.list.total} 条任务，当前第 ${state.list.page} / ${pages} 页`;
  $("page-num").textContent = String(state.list.page);
  $("page-prev").disabled = state.page <= 1;
  $("page-next").disabled = state.page >= pages;
  $("page-size").value = String(state.pageSize);
}

function renderRecycle() {
  const root = $("recycle-rows");
  const deleted = state.recycle.items.filter((task) => task.deleted_at);
  if (!deleted.length) {
    root.innerHTML = `<div class="px-4 py-8 text-center text-slate-400">没有已删除任务。</div>`;
  } else {
    root.innerHTML = deleted
      .map(
        (task) => `<div class="grid grid-cols-12 gap-2 items-center bg-slate-50 px-4 py-3 text-slate-500">
          <div class="col-span-5 min-w-0 flex items-center gap-2">
            <span class="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px]">#${task.id}</span>
            <span class="truncate">${escapeHtml(task.title)}</span>
          </div>
          <div class="col-span-2">${STATUS_LABEL[task.status] || task.status}</div>
          <div class="col-span-2 truncate">${escapeHtml(task.assignee_username)}</div>
          <div class="col-span-2">${formatTime(task.deleted_at)}</div>
          <div class="col-span-1 text-right">
            <button type="button" class="rounded-lg p-1 hover:bg-slate-200" data-open="${task.id}" title="查阅">
              <span class="material-symbols-outlined text-[18px]">visibility</span>
            </button>
          </div>
        </div>`
      )
      .join("");
  }
  $("recycle-info").textContent = `共 ${state.recycle.total} 条已删除任务`;
  $("recycle-prev").disabled = state.recyclePage <= 1;
  $("recycle-next").disabled = state.recyclePage >= (state.recycle.pages || 1);
}

function renderStats() {
  $("kpi-total").textContent = String(state.stats.total || 0);
  $("kpi-todo").textContent = String(state.stats.todo || 0);
  $("kpi-doing").textContent = String(state.stats.doing || 0);
  $("kpi-done").textContent = String(state.stats.done || 0);
  $("kpi-deleted").textContent = String(state.deletedCount || 0);
}

function renderUsers() {
  const rows = state.users.filter((item) => {
    const matchName = item.username.toLowerCase().includes(state.userSearch.toLowerCase());
    const matchRole = !state.userRole || item.role === state.userRole;
    return matchName && matchRole;
  });
  $("user-rows").innerHTML = rows
    .map(
      (item) => `<tr class="border-t border-slate-100">
        <td class="px-4 py-2 font-medium">${escapeHtml(item.username)}</td>
        <td class="px-4 py-2">${item.role === "admin" ? "管理员" : "普通成员"}</td>
        <td class="px-4 py-2 text-slate-500">${formatTime(item.created_at)}</td>
        <td class="px-4 py-2 text-right">
          <button type="button" class="later-btn rounded p-1 text-slate-400" data-later="重置密码后续接入" title="重置密码"><span class="material-symbols-outlined text-[18px]">key</span></button>
          <button type="button" class="later-btn rounded p-1 text-slate-400" data-later="切换角色后续接入" title="切换角色"><span class="material-symbols-outlined text-[18px]">swap_horiz</span></button>
          <button type="button" class="later-btn rounded p-1 text-slate-400" data-later="禁用账号后续接入" title="禁用"><span class="material-symbols-outlined text-[18px]">block</span></button>
        </td>
      </tr>`
    )
    .join("");
  document.querySelectorAll(".user-role-chip").forEach((chip) => {
    chip.classList.toggle("is-on", chip.dataset.role === state.userRole);
  });
}

function showDrawerError(message) {
  const el = $("drawer-error");
  if (!message) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.classList.remove("hidden");
  el.textContent = message;
}

function setDrawerFields(disabled) {
  ["form-title", "form-status", "form-assignee", "form-desc"].forEach((id) => {
    $(id).disabled = disabled;
  });
  document.querySelectorAll("input[name=form-priority]").forEach((input) => {
    input.disabled = disabled;
  });
}

function openDrawer(mode, task) {
  state.drawer = { open: true, mode, task: task || null, error: "" };
  fillAssigneeSelect($("form-assignee"), false);
  $("drawer-backdrop").classList.remove("hidden");
  showDrawerError("");
  $("delete-pop").classList.add("hidden");
  const deleted = Boolean(task?.deleted_at);
  $("drawer-deleted-banner").classList.toggle("hidden", !deleted);
  if (mode === "create") {
    $("drawer-badge").textContent = "新建";
    $("drawer-heading").textContent = "新建任务";
    $("form-title").value = "";
    $("form-desc").value = "";
    $("form-status").value = "todo";
    $("form-assignee").value = String(user().id);
    document.querySelector("input[name=form-priority][value=medium]").checked = true;
    $("drawer-meta").classList.add("hidden");
    $("drawer-delete").classList.add("hidden");
    $("drawer-save").classList.remove("hidden");
    setDrawerFields(false);
    return;
  }
  $("drawer-badge").textContent = `#${task.id}`;
  $("drawer-heading").textContent = deleted ? "已删除任务（只读）" : "任务详情与状态编辑";
  $("form-title").value = task.title || "";
  $("form-desc").value = task.description || "";
  $("form-status").value = task.status;
  $("form-assignee").value = String(task.assignee_id);
  const pri = document.querySelector(`input[name=form-priority][value="${task.priority}"]`);
  if (pri) pri.checked = true;
  $("drawer-meta").classList.remove("hidden");
  $("drawer-meta").textContent = `创建时间：${formatTime(task.created_at)}　最后修改：${formatTime(task.updated_at)}`;
  const mutable = canMutate(task);
  setDrawerFields(!mutable);
  $("drawer-save").classList.toggle("hidden", !mutable);
  $("drawer-delete").classList.toggle("hidden", !mutable);
}

function closeDrawer() {
  state.drawer.open = false;
  $("drawer-backdrop").classList.add("hidden");
  $("delete-pop").classList.add("hidden");
}

async function handleAuthError(error) {
  if (error instanceof ApiError && error.status === 401) {
    logout();
    location.reload();
    return true;
  }
  return false;
}

async function loadUsers() {
  state.users = await api.users();
  fillAssigneeSelect($("filter-assignee"), true);
  renderUsers();
}

async function refreshWorkbench() {
  syncChips();
  state.list = await api.tasks({
    status: state.filters.status,
    priority: state.filters.priority,
    assignee: state.filters.assignee,
    page: state.page,
    page_size: state.pageSize,
  });
  renderTaskRows();
}

async function refreshRecycle() {
  const batch = 100;
  const deleted = [];
  let page = 1;
  while (page <= 50) {
    const listed = await api.tasks({
      include_deleted: true,
      page,
      page_size: batch,
    });
    deleted.push(...listed.items.filter((task) => task.deleted_at));
    if (!listed.items.length || page * batch >= listed.total) break;
    page += 1;
  }
  const size = 20;
  const pages = Math.max(1, Math.ceil(deleted.length / size) || 1);
  if (state.recyclePage > pages) state.recyclePage = pages;
  const start = (state.recyclePage - 1) * size;
  state.recycle = {
    items: deleted.slice(start, start + size),
    total: deleted.length,
    pages,
  };
  renderRecycle();
}

async function refreshStats() {
  state.stats = await api.stats();
  if (isAdmin()) {
    const listed = await api.tasks({ include_deleted: true, page: 1, page_size: 1 });
    state.deletedCount = Math.max(0, listed.total - state.stats.total);
  } else {
    state.deletedCount = 0;
  }
  renderStats();
}

async function refreshCurrent() {
  $("list-error").classList.add("hidden");
  try {
    if (state.route === "workbench") await refreshWorkbench();
    if (state.route === "recycle") await refreshRecycle();
    if (state.route === "stats") await refreshStats();
    if (state.route === "users") {
      await loadUsers();
    }
  } catch (error) {
    if (await handleAuthError(error)) return;
    $("list-error").classList.remove("hidden");
    $("list-error").textContent = error.message;
    toast(error.message);
  }
}

async function pingHealth() {
  try {
    await request("GET", "/api/health");
    $("health-dot").className = "h-2 w-2 rounded-full bg-teal-600";
    $("health-text").textContent = "API: OK";
  } catch {
    $("health-dot").className = "h-2 w-2 rounded-full bg-rose-500";
    $("health-text").textContent = "API: 不可达";
  }
}

function showApp() {
  $("view-login").classList.add("hidden");
  $("view-app").classList.remove("hidden");
  const me = user();
  $("current-user").textContent = me.username;
  $("user-avatar").textContent = me.username.slice(0, 1).toUpperCase();
  $("role-label").textContent = isAdmin() ? "系统管理员 (Admin)" : "普通成员 (Member)";
  $("current-role-sub").textContent = isAdmin() ? "管理员" : "成员";
  $("workbench-perm").textContent = isAdmin()
    ? "当前权限视图：系统管理员（可改删全部任务）"
    : "当前权限视图：普通成员（仅能改删自己负责的任务）";
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.classList.toggle("hidden", !isAdmin());
    if (isAdmin() && node.matches("a")) node.classList.remove("hidden");
    if (isAdmin() && node.id === "kpi-deleted-card") node.classList.remove("hidden");
  });
}

async function bootApp() {
  showApp();
  await loadUsers();
  const hash = location.hash.replace("#", "") || "workbench";
  setRoute(hash);
  await pingHealth();
  await refreshCurrent();
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const box = $("login-error");
  box.classList.add("hidden");
  try {
    await login($("login-username").value, $("login-password").value);
    await bootApp();
  } catch (error) {
    box.classList.remove("hidden");
    box.textContent = error instanceof ApiError ? error.message : "无法登录";
  }
});

$("btn-logout").addEventListener("click", () => {
  logout();
  location.hash = "";
  location.reload();
});

window.addEventListener("hashchange", () => {
  if ($("view-app").classList.contains("hidden")) return;
  setRoute(location.hash.replace("#", ""));
  refreshCurrent();
});

document.querySelectorAll("#page-workbench .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    state.filters[chip.dataset.filter] = chip.dataset.value;
    state.page = 1;
    refreshWorkbench();
  });
});

$("filter-assignee").addEventListener("change", () => {
  state.filters.assignee = $("filter-assignee").value;
  state.page = 1;
  refreshWorkbench();
});

$("btn-reset-filters").addEventListener("click", () => {
  state.filters = { status: "", priority: "", assignee: "" };
  state.page = 1;
  refreshWorkbench();
});

$("page-size").addEventListener("change", () => {
  state.pageSize = Number($("page-size").value);
  state.page = 1;
  refreshWorkbench();
});

$("page-prev").addEventListener("click", () => {
  state.page -= 1;
  refreshWorkbench();
});
$("page-next").addEventListener("click", () => {
  state.page += 1;
  refreshWorkbench();
});
$("recycle-prev").addEventListener("click", () => {
  state.recyclePage -= 1;
  refreshRecycle();
});
$("recycle-next").addEventListener("click", () => {
  state.recyclePage += 1;
  refreshRecycle();
});

$("task-rows").addEventListener("click", async (event) => {
  const open = event.target.closest("[data-open]");
  const del = event.target.closest("[data-del]");
  try {
    if (open) {
      const task = await api.task(open.dataset.open);
      openDrawer("edit", task);
    }
    if (del) {
      const task = await api.task(del.dataset.del);
      openDrawer("edit", task);
      $("delete-pop").classList.remove("hidden");
    }
  } catch (error) {
    if (await handleAuthError(error)) return;
    toast(error.message);
  }
});

$("recycle-rows").addEventListener("click", async (event) => {
  const open = event.target.closest("[data-open]");
  if (!open) return;
  try {
    const task = await api.task(open.dataset.open);
    openDrawer("edit", task);
  } catch (error) {
    if (await handleAuthError(error)) return;
    toast(error.message);
  }
});

$("btn-new-task").addEventListener("click", () => openDrawer("create"));
$("drawer-close").addEventListener("click", closeDrawer);
$("drawer-cancel").addEventListener("click", closeDrawer);
$("drawer-backdrop").addEventListener("click", (event) => {
  if (event.target === $("drawer-backdrop")) closeDrawer();
});

$("drawer-save").addEventListener("click", async () => {
  const payload = {
    title: $("form-title").value,
    description: $("form-desc").value || null,
    assignee: Number($("form-assignee").value),
    status: $("form-status").value,
    priority: document.querySelector("input[name=form-priority]:checked").value,
  };
  try {
    showDrawerError("");
    if (state.drawer.mode === "create") {
      await api.createTask(payload);
    } else {
      await api.patchTask(state.drawer.task.id, payload);
    }
    closeDrawer();
    toast("已保存");
    await refreshCurrent();
  } catch (error) {
    if (await handleAuthError(error)) return;
    showDrawerError(error.message);
  }
});

$("drawer-delete").addEventListener("click", () => {
  $("delete-pop").classList.toggle("hidden");
});
$("delete-cancel").addEventListener("click", () => $("delete-pop").classList.add("hidden"));
$("delete-confirm").addEventListener("click", async () => {
  try {
    await api.deleteTask(state.drawer.task.id);
    closeDrawer();
    toast("已删除");
    await refreshCurrent();
  } catch (error) {
    if (await handleAuthError(error)) return;
    showDrawerError(error.message);
  }
});

$("btn-add-user").addEventListener("click", () => {
  $("user-form-error").classList.add("hidden");
  $("user-form").reset();
  $("user-modal").classList.remove("hidden");
  $("user-modal").classList.add("flex");
});
$("user-modal-cancel").addEventListener("click", () => {
  $("user-modal").classList.add("hidden");
  $("user-modal").classList.remove("flex");
});
$("user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("user-form-error");
  error.classList.add("hidden");
  try {
    await api.createUser({
      username: $("new-username").value,
      password: $("new-password").value,
      role: $("new-role").value,
    });
    $("user-modal").classList.add("hidden");
    $("user-modal").classList.remove("flex");
    toast("用户已创建");
    await loadUsers();
  } catch (err) {
    if (await handleAuthError(err)) return;
    error.classList.remove("hidden");
    error.textContent = err.message;
  }
});

$("user-search").addEventListener("input", () => {
  state.userSearch = $("user-search").value;
  renderUsers();
});
document.querySelectorAll(".user-role-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    state.userRole = chip.dataset.role;
    renderUsers();
  });
});

document.body.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-later]");
  if (btn) {
    event.preventDefault();
    later(btn.dataset.later);
  }
});

restoreSession()
  .then((session) => (session ? bootApp() : null))
  .catch(() => logout());
