const TOKEN_KEY = "task.token";

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : "请求失败");
    this.status = status;
    this.detail = detail;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function formatDetail(detail) {
  if (!detail) return "请求失败";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || JSON.stringify(item)).join("；");
  }
  return "请求失败";
}

export async function request(method, path, body) {
  const headers = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (response.status === 401 && path !== "/api/auth/login") {
    clearToken();
    throw new ApiError(401, "未认证或登录已失效");
  }
  if (!response.ok) {
    throw new ApiError(response.status, formatDetail(payload && payload.detail));
  }
  return payload;
}

export const api = {
  login: (username, password) => request("POST", "/api/auth/login", { username, password }),
  me: () => request("GET", "/api/auth/me"),
  users: () => request("GET", "/api/users"),
  createUser: (data) => request("POST", "/api/users", data),
  stats: () => request("GET", "/api/stats"),
  tasks: (params) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== "" && value !== false && value != null) query.set(key, String(value));
    });
    const suffix = query.toString() ? `?${query}` : "";
    return request("GET", `/api/tasks${suffix}`);
  },
  task: (id) => request("GET", `/api/tasks/${id}`),
  createTask: (data) => request("POST", "/api/tasks", data),
  patchTask: (id, data) => request("PATCH", `/api/tasks/${id}`, data),
  deleteTask: (id) => request("DELETE", `/api/tasks/${id}`),
};
