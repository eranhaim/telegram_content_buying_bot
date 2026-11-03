import { isIP } from "node:net";
import geoip from "geoip-lite";
import type { Request } from "express";

// Traffic reaches the API through Caddy and nginx. nginx appends Caddy's
// address, so the address immediately before it is the visitor. Caddy does
// not trust client-supplied forwarded headers in this deployment.
export function customerCountry(req: Pick<Request, "headers" | "ip">): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  const chain = typeof forwarded === "string" ? forwarded.split(",").map((part) => part.trim()) : [];
  const address = chain.length >= 2 ? chain[chain.length - 2] : req.ip;
  if (!address || !isIP(address)) return undefined;
  return geoip.lookup(address)?.country;
}
