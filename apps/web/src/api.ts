const API = "/api";

export type Product = {
  _id: string; title: string; description: string; amountMinor: number; currency: string; creatorId: string;
  previewMode: "none" | "blurred" | "visible"; categories: string[];
  preview?: { mimeType: string; url: string } | null; purchasesCount?: number;
};
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

export function euroToMinor(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("invalid_eur_amount");
  const [whole, fraction = ""] = text.split(".");
  const minor = Number(`${whole}${fraction.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(minor) || minor < 1) throw new Error("invalid_eur_amount");
  return minor;
}
