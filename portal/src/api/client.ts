const BASE = (import.meta.env.VITE_GATEWAY_URL as string) || "";

let token: string = localStorage.getItem("gw_token") || "";
let adminToken: string = localStorage.getItem("gw_admin_token") || "";

export function setToken(value: string): void {
  token = value;
  if (value) localStorage.setItem("gw_token", value);
  else localStorage.removeItem("gw_token");
}
export function getToken(): string {
  return token;
}
export function setAdminToken(value: string): void {
  adminToken = value;
  if (value) localStorage.setItem("gw_admin_token", value);
  else localStorage.removeItem("gw_admin_token");
}
export function getAdminToken(): string {
  return adminToken;
}

interface ApiError {
  code: string;
  message: string;
}
interface CallOpts {
  admin?: boolean;
}

export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: CallOpts = {}
): Promise<T> {
  const auth = opts.admin ? adminToken : token;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = data as ApiError | null;
    throw new Error(err?.message || `HTTP ${res.status}`);
  }
  return data as T;
}

export const apiGet = <T>(path: string, opts?: CallOpts) => api<T>("GET", path, undefined, opts);
export const apiPost = <T>(path: string, body?: unknown, opts?: CallOpts) =>
  api<T>("POST", path, body, opts);
export const apiPut = <T>(path: string, body?: unknown, opts?: CallOpts) =>
  api<T>("PUT", path, body, opts);
export const apiDel = <T>(path: string, opts?: CallOpts) => api<T>("DELETE", path, undefined, opts);
