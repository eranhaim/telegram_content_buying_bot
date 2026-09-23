const API = "/api";

export type Product = { _id: string; title: string; description: string; amountMinor: number; currency: string; creatorId: string; purchasesCount?: number };
export type Creator = { _id: string; displayName: string; slug: string; bio: string };

let token = "";
export function setToken(next: string) { token = next; }
export function clearToken() { token = ""; sessionStorage.removeItem("marketplace_token"); }
export async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? "request_failed");
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export const money = (minor: number, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
