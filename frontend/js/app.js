import { ApiError, api } from "./api.js";
import { isAdmin, login, logout, restoreSession, user } from "./auth.js";
import { renderStats } from "./stats.js";

const STATUS_LABEL = { todo: "待办", doing: "进行中", done: "已完成" };
const PRIORITY_LABEL = { high: "高", medium: "中", low: "低" };

const state = {
  users: [],
  stats: { total: 0, todo: 0, doing: 0, done: 0, priority: { high: 0, medium: 0, low: 0 }, assignees: [] },
  list: { items: [], total: 0, page: 1, page_size: 20 },
  filters: { status: "", priority: "", assignee: "", include_deleted: false },
  page: 1,
  selectedId: null,
  pane: "empty",
  draft: null,
  error: "",
};

const els = {
  loginView: document.getElementById("view-login"),
  appView: document.getElementById("view-app"),
  loginForm: document.getElementById("login-form"),
  loginError: document.getElementById("login-error"),
  currentUser: document.getElementById("current-user"),
  addUser: document.getElementById("btn-add-user"),
  logout: document.getElementById("btn-logout"),
  filterStatus: document.getElementById("filter-status"),
  filterPriority: document.getElementById("filter-priority"),
  filterAssignee: document.getElementById("filter-assignee"),
  filterDeletedWrap: document.getElementById("filter-deleted-wrap"),
  filterDeleted: document.getElementById("filter-deleted"),
  newTask: document.getElementById("btn-new-task"),
  list: document.getElementById("task-list"),
  listError: document.getElementById("list-error"),
  pager: document.getElementById("pager"),
  sheet: document.getElementById("sheet-body"),
  workbench: document.getElementById("workbench"),
  back: document.getElementById("btn-back"),
};

function showError(node, message) {
  if (!message) {
    node.hidden = true;
    node.textContent = "";
    return;
  }
  node.hidden = false;
  node.textContent = message;
}

function toggleFilter(field, value) {
  state.filters[field] = state.filters[field] === value ? "" : value;
  state.page = 1;
  refresh();
}

function syncFilterControls() {
  els.filterStatus.value = state.filters.status;
  els.filterPriority.value = state.filters.priority;
  els.filterAssignee.value = state.filters.assignee;
  els.filterDeleted.checked = state.filters.include_deleted;
}

function fillAssigneeOptions(select, includeAll) {
  const current = select.value;
  select.replaceChildren();
  if (includeAll) {
    select.append(new Option("全部", ""));
  }
  state.users.forEach((item) => select.append(new Option(item.username, String(item.id))));
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function canMutate(task) {
  if (!task || task.deleted_at) return false;
  return isAdmin() || task.assignee_id === user().id;
}

function renderList() {
  els.list.replaceChildren();
  if (!state.list.items.length) {
    const empty = document.createElement("li");
    empty.className = "empty-hint";
    empty.style.padding = "16px";
    empty.textContent = "还没有任务。新建一条，并指定负责人。";
    els.list.append(empty);
  }
  state.list.items.forEach((task) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `task-row is-${task.status}`;
    if (task.id === state.selectedId) row.classList.add("is-active");
    row.innerHTML = `
      <span class="pri pri-${task.priority}"></span>
      <span class="task-title">${escapeHtml(task.title)}</span>
      <span class="task-meta">${STATUS_LABEL[task.status]}</span>
      <span class="task-meta">${escapeHtml(task.assignee_username)}</span>
    `;
    row.addEventListener("click", () => openTask(task.id));
    const item = document.createElement("li");
    item.append(row);
    els.list.append(item);
  });

  const pages = Math.max(1, Math.ceil(state.list.total / state.list.page_size) || 1);
  els.pager.replaceChildren();
  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "上一页";
  prev.disabled = state.page <= 1;
  prev.addEventListener("click", () => {
    state.page -= 1;
    refresh();
  });
  const info = document.createElement("span");
  info.textContent = `${state.list.page} / ${pages}，共 ${state.list.total} 条`;
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "下一页";
  next.disabled = state.page >= pages;
  next.addEventListener("click", () => {
    state.page += 1;
    refresh();
  });
  els.pager.append(prev, info, next);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function field(label, control) {
  const wrap = document.createElement("label");
  wrap.append(label, control);
  return wrap;
}

function openSheet(pane) {
  state.pane = pane;
  els.workbench.classList.add("show-sheet");
  renderSheet();
}

function closeSheetOnMobile() {
  els.workbench.classList.remove("show-sheet");
}

async function openTask(id) {
  try {
    const task = await api.task(id);
    state.selectedId = id;
    state.draft = { ...task, assignee: task.assignee_id };
    state.error = "";
    openSheet("view");
    renderList();
  } catch (error) {
    showError(els.listError, error.message);
  }
}

function renderSheet() {
  const root = els.sheet;
  root.replaceChildren();
  showError(els.listError, "");

  if (state.pane === "empty") {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = "选左侧一条，或点「新建任务」。";
    root.append(hint);
    return;
  }

  if (state.pane === "create-user") {
    root.append(userForm());
    return;
  }

  if (state.pane === "confirm-delete") {
    const title = document.createElement("h2");
    title.textContent = state.draft.title;
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = "将删除这条任务，列表里不再显示。";
    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "btn-danger";
    confirm.textContent = "确认删除";
    confirm.addEventListener("click", deleteCurrent);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "返回";
    cancel.addEventListener("click", () => openSheet("view"));
    actions.append(confirm, cancel);
    root.append(title, hint, actions);
    return;
  }

  const creating = state.pane === "create";
  const task = state.draft || {};
  const mutable = creating || canMutate(task);
  const heading = document.createElement("h2");
  heading.textContent = creating ? "新建任务" : task.title || "任务";
  root.append(heading);

  const title = document.createElement("input");
  title.value = task.title || "";
  title.disabled = !mutable;
  const description = document.createElement("textarea");
  description.value = task.description || "";
  description.disabled = !mutable;
  const assignee = document.createElement("select");
  fillAssigneeOptions(assignee, false);
  assignee.value = String(task.assignee || task.assignee_id || user().id);
  assignee.disabled = !mutable;
  const status = document.createElement("select");
  ["todo", "doing", "done"].forEach((value) => status.append(new Option(STATUS_LABEL[value], value)));
  status.value = task.status || "todo";
  status.disabled = !mutable;
  const priority = document.createElement("select");
  ["high", "medium", "low"].forEach((value) => priority.append(new Option(PRIORITY_LABEL[value], value)));
  priority.value = task.priority || "medium";
  priority.disabled = !mutable;

  root.append(
    field("标题", title),
    field("描述", description),
    field("负责人", assignee),
    field("状态", status),
    field("优先级", priority)
  );

  if (state.error) {
    const err = document.createElement("p");
    err.className = "form-error";
    err.textContent = state.error;
    root.append(err);
  }

  if (!mutable) return;

  const actions = document.createElement("div");
  actions.className = "sheet-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn-primary";
  save.textContent = "保存";
  save.addEventListener("click", () =>
    saveTask({
      title: title.value,
      description: description.value,
      assignee: Number(assignee.value),
      status: status.value,
      priority: priority.value,
    })
  );
  actions.append(save);
  if (!creating) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-danger";
    remove.textContent = "删除";
    remove.addEventListener("click", () => openSheet("confirm-delete"));
    actions.append(remove);
  }
  root.append(actions);
}

function userForm() {
  const wrap = document.createDocumentFragment();
  const heading = document.createElement("h2");
  heading.textContent = "添加成员";
  const username = document.createElement("input");
  const password = document.createElement("input");
  password.type = "password";
  const role = document.createElement("select");
  role.append(new Option("成员", "member"), new Option("管理员", "admin"));
  const error = document.createElement("p");
  error.className = "form-error";
  error.hidden = true;
  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn-primary";
  save.textContent = "保存";
  save.addEventListener("click", async () => {
    try {
      await api.createUser({ username: username.value, password: password.value, role: role.value });
      await loadUsers();
      state.pane = "empty";
      state.selectedId = null;
      renderSheet();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
    }
  });
  wrap.append(
    heading,
    field("用户名", username),
    field("密码", password),
    field("角色", role),
    error,
    save
  );
  return wrap;
}

async function saveTask(payload) {
  try {
    state.error = "";
    const body = {
      title: payload.title,
      description: payload.description || null,
      assignee: payload.assignee,
      status: payload.status,
      priority: payload.priority,
    };
    if (state.pane === "create") {
      const created = await api.createTask(body);
      state.selectedId = created.id;
    } else {
      await api.patchTask(state.selectedId, body);
    }
    await refresh();
    if (state.selectedId) await openTask(state.selectedId);
  } catch (error) {
    state.error = error.message;
    renderSheet();
  }
}

async function deleteCurrent() {
  try {
    await api.deleteTask(state.selectedId);
    state.selectedId = null;
    state.pane = "empty";
    await refresh();
    closeSheetOnMobile();
  } catch (error) {
    state.error = error.message;
    openSheet("view");
  }
}

async function loadUsers() {
  state.users = await api.users();
  fillAssigneeOptions(els.filterAssignee, true);
}

async function refresh() {
  syncFilterControls();
  state.stats = await api.stats();
  state.list = await api.tasks({
    status: state.filters.status,
    priority: state.filters.priority,
    assignee: state.filters.assignee,
    include_deleted: isAdmin() && state.filters.include_deleted,
    page: state.page,
    page_size: 20,
  });
  renderStats(state.stats, state.filters, toggleFilter);
  renderList();
  if (state.pane === "view" && state.selectedId) renderSheet();
  else if (state.pane === "empty") renderSheet();
}

function showApp() {
  els.loginView.hidden = true;
  els.appView.hidden = false;
  els.currentUser.textContent = user().username;
  els.addUser.hidden = !isAdmin();
  els.filterDeletedWrap.hidden = !isAdmin();
}

async function bootApp() {
  showApp();
  await loadUsers();
  state.pane = "empty";
  await refresh();
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(els.loginError, "");
  try {
    await login(
      document.getElementById("login-username").value,
      document.getElementById("login-password").value
    );
    await bootApp();
  } catch (error) {
    showError(els.loginError, error instanceof ApiError ? error.message : "无法登录");
  }
});

els.logout.addEventListener("click", () => {
  logout();
  location.reload();
});

els.addUser.addEventListener("click", () => {
  state.selectedId = null;
  openSheet("create-user");
  renderList();
});

els.newTask.addEventListener("click", () => {
  state.selectedId = null;
  state.draft = {
    title: "",
    description: "",
    assignee: user().id,
    status: "todo",
    priority: "medium",
  };
  state.error = "";
  openSheet("create");
  renderList();
});

els.filterStatus.addEventListener("change", () => {
  state.filters.status = els.filterStatus.value;
  state.page = 1;
  refresh();
});
els.filterPriority.addEventListener("change", () => {
  state.filters.priority = els.filterPriority.value;
  state.page = 1;
  refresh();
});
els.filterAssignee.addEventListener("change", () => {
  state.filters.assignee = els.filterAssignee.value;
  state.page = 1;
  refresh();
});
els.filterDeleted.addEventListener("change", () => {
  state.filters.include_deleted = els.filterDeleted.checked;
  state.page = 1;
  refresh();
});
els.back.addEventListener("click", () => {
  closeSheetOnMobile();
});

restoreSession()
  .then((session) => (session ? bootApp() : null))
  .catch(() => logout());
