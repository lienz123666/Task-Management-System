import { api, clearToken, getToken, setToken } from "./api.js";

let currentUser = null;

export function user() {
  return currentUser;
}

export function isAdmin() {
  return currentUser?.role === "admin";
}

export async function restoreSession() {
  if (!getToken()) return null;
  currentUser = await api.me();
  return currentUser;
}

export async function login(username, password) {
  const token = await api.login(username, password);
  setToken(token.access_token);
  currentUser = await api.me();
  return currentUser;
}

export function logout() {
  clearToken();
  currentUser = null;
}
