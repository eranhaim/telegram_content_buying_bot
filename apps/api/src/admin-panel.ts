import { Router, type Request, type Response } from "express";
import { config } from "./config.js";
import { Order, WebhookEvent } from "./models.js";

const router = Router();

// HTTP Basic auth using ADMIN_SHARED_PASSWORD.
function requireBasicAuth(req: Request, res: Response, next: () => void) {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin Panel"');
    return res.status(401).send("Authentication required");
  }
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const [, password] = decoded.split(":");
  if (!config.ADMIN_SHARED_PASSWORD || password !== config.ADMIN_SHARED_PASSWORD) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin Panel"');
    return res.status(401).send("Invalid credentials");
  }
  next();
}

router.use(requireBasicAuth);

function esc(text: unknown): string {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function money(minor: number, currency: string): string {
  return `€${(minor / 100).toFixed(2)}`;
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e0e0e6;padding:24px;max-width:1200px;margin:0 auto;line-height:1.5}
h1{font-size:1.5rem;margin-bottom:8px;color:#fff}
h2{font-size:1.15rem;margin:24px 0 12px;color:#a0a0b0}
nav{margin-bottom:24px;display:flex;gap:16px;border-bottom:1px solid #2a2a3a;padding-bottom:12px}
nav a{color:#6cb4ee;text-decoration:none;font-weight:500}
nav a:hover{text-decoration:underline}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.card{background:#1a1a2e;border-radius:10px;padding:20px;text-align:center}
.card .value{font-size:1.8rem;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}
.card .label{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#8888a0;margin-top:4px}
table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:.9rem}
th{text-align:left;padding:10px 12px;border-bottom:2px solid #2a2a3a;color:#8888a0;font-weight:600;text-transform:uppercase;font-size:.75rem;letter-spacing:.05em}
td{padding:10px 12px;border-bottom:1px solid #1e1e2e}
tr:hover td{background:#1a1a2e}
.status{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.78rem;font-weight:600}
.status-paid{background:#15392c;color:#34d399}
.status-pending{background:#3a2f14;color:#fbbf24}
.status-expired,.status-failed{background:#3a1414;color:#f87171}
.status-refunded,.status-charged_back{background:#2a1a3a;color:#c084fc}
.money{font-variant-numeric:tabular-nums;font-weight:600;color:#fff}
.empty{color:#6a6a80;padding:32px;text-align:center}
</style>
</head>
<body>
<h1>📊 Marketplace Admin</h1>
<nav>
  <a href="/admin-panel">Dashboard</a>
  <a href="/admin-panel/orders">Orders</a>
  <a href="/admin-panel/creators">Revenue by Creator</a>
  <a href="/admin-panel/webhooks">Webhook Log</a>
</nav>
${body}
</body>
</html>`;
}

function statusBadge(status: string): string {
  return `<span class="status status-${esc(status)}">${esc(status)}</span>`;
}

// --- Dashboard ---

router.get("/", async (_req: Request, res: Response) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalRevenue, todayRevenue, monthRevenue, orderCounts] = await Promise.all([
    Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$totalMinor" }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { paymentStatus: "paid", paidAt: { $gte: startOfDay } } }, { $group: { _id: null, total: { $sum: "$totalMinor" }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { paymentStatus: "paid", paidAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: "$totalMinor" }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $group: { _id: "$paymentStatus", count: { $sum: 1 } } }]),
  ]);

  const total = totalRevenue[0] ?? { total: 0, count: 0 };
  const today = todayRevenue[0] ?? { total: 0, count: 0 };
  const month = monthRevenue[0] ?? { total: 0, count: 0 };
  const counts = Object.fromEntries(orderCounts.map((r: any) => [r._id, r.count]));

  const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(10).populate("telegramUserId");

  res.send(page("Dashboard", `
<div class="cards">
  <div class="card"><div class="value">${money(total.total, "EUR")}</div><div class="label">Total Revenue</div></div>
  <div class="card"><div class="value">${money(today.total, "EUR")}</div><div class="label">Today (${today.count} orders)</div></div>
  <div class="card"><div class="value">${money(month.total, "EUR")}</div><div class="label">This Month (${month.count} orders)</div></div>
  <div class="card"><div class="value">${total.count}</div><div class="label">Total Paid Orders</div></div>
  <div class="card"><div class="value">${counts.pending ?? 0}</div><div class="label">Pending</div></div>
  <div class="card"><div class="value">${counts.expired ?? 0}</div><div class="label">Expired</div></div>
</div>
<h2>Recent Orders</h2>
${ordersTable(recentOrders)}
`));
});

// --- Orders ---

router.get("/orders", async (req: Request, res: Response) => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const filter: any = {};
  if (statusFilter) filter.paymentStatus = statusFilter;
  const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(200).populate("telegramUserId");
  const statusOptions = ["pending", "paid", "expired", "failed", "refunded", "charged_back"];

  res.send(page("Orders", `
<h2>Orders</h2>
<p style="margin-bottom:12px">
  <a href="/admin-panel/orders">All</a>
  ${statusOptions.map((s) => `| <a href="/admin-panel/orders?status=${s}">${s}</a>`).join(" ")}
</p>
${orders.length ? ordersTable(orders) : '<p class="empty">No orders found</p>'}
`));
});

// --- Revenue by Creator ---

router.get("/creators", async (_req: Request, res: Response) => {
  const creatorRevenue = await Order.aggregate([
    { $match: { paymentStatus: "paid" } },
    { $unwind: "$lines" },
    { $group: { _id: "$lines.creatorId", name: { $first: "$lines.creatorName" }, purchases: { $sum: 1 }, grossMinor: { $sum: "$lines.amountMinor" } } },
    { $sort: { grossMinor: -1 } },
  ]);

  let rows = "";
  for (const c of creatorRevenue) {
    rows += `<tr><td>${esc(c.name)}</td><td class="money">${money(c.grossMinor, "EUR")}</td><td>${c.purchases}</td></tr>`;
  }

  res.send(page("Revenue by Creator", `
<h2>Revenue by Creator</h2>
${creatorRevenue.length ? `<table>
<thead><tr><th>Creator</th><th>Revenue</th><th>Purchases</th></tr></thead>
<tbody>${rows}</tbody>
</table>` : '<p class="empty">No sales yet</p>'}
`));
});

// --- Webhook Log ---

router.get("/webhooks", async (_req: Request, res: Response) => {
  const events = await WebhookEvent.find().sort({ createdAt: -1 }).limit(100);

  let rows = "";
  for (const e of events) {
    rows += `<tr>
      <td>${esc(new Date(e.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem" }))}</td>
      <td>${esc(e.provider)}</td>
      <td>${esc(e.type)}</td>
      <td>${e.signatureValid ? "✓" : "✗"}</td>
      <td>${e.processedAt ? "✓" : (e.processingError ? esc(e.processingError) : "—")}</td>
    </tr>`;
  }

  res.send(page("Webhook Log", `
<h2>Webhook Events</h2>
${events.length ? `<table>
<thead><tr><th>Date</th><th>Provider</th><th>Type</th><th>Sig</th><th>Processed</th></tr></thead>
<tbody>${rows}</tbody>
</table>` : '<p class="empty">No webhook events</p>'}
`));
});

function ordersTable(orders: any[]): string {
  if (!orders.length) return '<p class="empty">No orders</p>';
  let rows = "";
  for (const o of orders) {
    const user = o.telegramUserId;
    const username = user?.username ? `@${user.username}` : (user?.firstName ?? "—");
    const items = (o.lines ?? []).map((l: any) => l.productTitle).join(", ");
    const date = new Date(o.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
    rows += `<tr>
      <td>${esc(date)}</td>
      <td>${esc(username)}</td>
      <td title="${esc(items)}">${esc(items.length > 50 ? items.slice(0, 47) + "…" : items)}</td>
      <td class="money">${money(o.totalMinor, o.currency)}</td>
      <td>${statusBadge(o.paymentStatus)}</td>
      <td>${esc(o.fulfillmentStatus)}</td>
      <td style="font-size:.75rem;color:#6a6a80" dir="ltr">${esc(o.publicId)}</td>
    </tr>`;
  }
  return `<table>
<thead><tr><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Fulfillment</th><th>ID</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
}

export { router as adminPanelRouter };
