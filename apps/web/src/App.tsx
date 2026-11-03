import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Alert, Autocomplete, Box, Button, Dialog as MuiDialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, ThemeProvider, Typography, createTheme } from "@mui/material";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import { prefixer } from "stylis";
import { clearToken, Creator, euroToMinor, money, Product, request, setToken } from "./api";
import { adminCopy, adminDirection, adminLanguage, type AdminLanguage } from "./admin-i18n";
import { customerCopy, customerDirection, customerLocale, customerLocales, type CustomerLocale } from "./customer-i18n";

const localeLabel = (locale: CustomerLocale): string => {
  const labels: Record<CustomerLocale, string> = { en: "EN", he: "עב", ar: "عربي", ru: "RU", fr: "FR", es: "ES", de: "DE", "pt-BR": "PT-BR", "pt-PT": "PT" };
  return labels[locale];
};

function TabIcon({ name }: { name: "discover" | "guide" | "cart" | "library" }) {
  const props = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "discover") return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  if (name === "guide") return <svg {...props}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5A2.5 2.5 0 0 1 6.5 8H20" /></svg>;
  if (name === "cart") return <svg {...props}><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H7" /></svg>;
  return <svg {...props}><path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M8 7V5a4 4 0 0 1 8 0v2" /></svg>;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; ready(): void; expand(): void; openLink(url: string): void; close(): void; viewportStableHeight?: number } };
  }
}

type AdminCreator = { _id: string; displayName: string; slug: string; bio: string; status: string };
type AdminAsset = { _id: string; fileName: string; mimeType: string; status: string; purpose?: "delivery" | "preview"; url?: string; createdAt?: string };
type AdminCategory = { _id: string; name: string; slug: string; status: string };
type AdminProduct = {
  _id: string; creatorId: string; title: string; slug: string; description: string; status: string;
  grossMinor?: number;
  deliveryMessage?: string; amountMinor: number; currency: "EUR"; categoryIds: string[]; previewAssetId?: string; previewMode: "none" | "blurred" | "visible"; mediaAssetIds: string[];
};
const adminMuiTheme = createTheme({ palette: { mode: "dark", primary: { main: "#efad99" }, background: { paper: "#241c29" } }, typography: { fontFamily: "Inter, Heebo, sans-serif" } });
const adminMuiRtlTheme = createTheme(adminMuiTheme, { direction: "rtl" });
const adminRtlCache = createCache({ key: "vesperrtl", stylisPlugins: [prefixer, rtlPlugin] });
const adminLtrCache = createCache({ key: "vesper" });
type AdminOrder = {
  _id: string; publicId: string; totalMinor: number; currency: string;
  paymentStatus: string; fulfillmentStatus: string; createdAt: string; paidAt?: string;
  lines: { productTitle: string; creatorName: string; amountMinor: number }[];
  telegramUser: { username?: string; firstName?: string } | null;
};
type RevenueData = {
  total: { grossMinor: number; count: number };
  today: { grossMinor: number; count: number };
  month: { grossMinor: number; count: number };
  creators: { _id: string; name: string; purchases: number; grossMinor: number }[];
  statusCounts: Record<string, number>;
};

function CreatorGrid({ creators, empty, addCard }: { creators: { key: string; name: string; bio: string; to?: string; status?: string; meta?: string }[]; empty?: ReactNode; addCard?: ReactNode }) {
  return <section className="creator-grid">
    {creators.map((creator) => creator.to
      ? <Link className="creator-card" key={creator.key} to={creator.to}><CreatorCard creator={creator} /></Link>
      : <article className="creator-card" key={creator.key}><CreatorCard creator={creator} /></article>)}
    {addCard}
    {!creators.length && empty}
  </section>;
}

function CreatorCard({ creator }: { creator: { name: string; bio: string; status?: string; meta?: string } }) {
  const initial = creator.name.trim().slice(0, 1);
  return <><div className="creator-cover" aria-hidden="true">{initial && <span className="creator-monogram">{initial}</span>}{creator.status && <span className="creator-status">{creator.status}</span>}</div><h2>{creator.name}</h2><p>{creator.bio}</p>{creator.meta && <small>{creator.meta}</small>}</>;
}

function TelescopeCreatorList({ creators, viewLabel }: { creators: Creator[]; viewLabel: string }) {
  return <section className="telescope-creator-list" aria-label={viewLabel}>
    {creators.map((creator) => <Link className="telescope-creator-row" key={creator._id} to={`/creators/${creator.slug}`}>
      <div className="telescope-creator-avatar">
        {creator.avatarUrl
          ? <img src={creator.avatarUrl} alt="" width="72" height="72" loading="lazy" />
          : <span aria-hidden="true">{creator.displayName.trim().slice(0, 1)}</span>}
      </div>
      <div className="telescope-creator-details">
        <h2>{creator.displayName}</h2>
        <p>{creator.bio}</p>
        <small>{viewLabel}</small>
      </div>
      <span className="telescope-creator-arrow" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></span>
    </Link>)}
  </section>;
}

function PlusCard({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="plus-card" onClick={onClick}><span>+</span>{label}</button>;
}

function browserId() {
  const key = "marketplace_browser_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function useCustomerSession() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [telegramAttempt, setTelegramAttempt] = useState(false);
  const [browser, setBrowser] = useState(false);
  const [locale, setLocale] = useState<CustomerLocale>("en");
  useEffect(() => {
    clearToken();
    const webApp = window.Telegram?.WebApp;
    webApp?.ready(); webApp?.expand();
    document.documentElement.style.setProperty("--customer-viewport-height", `${webApp?.viewportStableHeight ?? window.innerHeight}px`);
    const initData = webApp?.initData;
    let active = true;
    const finish = (nextToken: string, nextLocale: CustomerLocale, isBrowser: boolean) => {
      if (!active) return;
      setToken(nextToken);
      setLocale(customerLocale(nextLocale));
      setBrowser(isBrowser);
      setReady(true);
    };
    if (initData) {
      setTelegramAttempt(true);
      request<{ token: string; locale: CustomerLocale }>("/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) })
        .then(({ token, locale: nextLocale }) => finish(token, nextLocale, false))
        .catch(() => { if (active) setError(true); });
    } else {
      request<{ token: string; locale: CustomerLocale }>("/auth/browser", { method: "POST", body: JSON.stringify({ browserId: browserId() }) })
        .then(({ token, locale: nextLocale }) => finish(token, nextLocale, true))
        .catch(() => { if (active) setError(true); });
    }
    return () => { active = false; };
  }, []);
  return { ready, error, telegramAttempt, browser, locale, setLocale };
}

type CustomerText = typeof customerCopy.en;

function CustomerShell({ locale, setLocale, cartCount, children }: { locale: CustomerLocale; setLocale: (locale: CustomerLocale) => void; cartCount: number; children: ReactNode }) {
  const t = customerCopy[locale];
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = customerDirection(locale);
  }, [locale]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const overrideLocale = async (value: string) => {
    const nextLocale = customerLocale(value);
    const result = await request<{ locale: CustomerLocale }>("/me/locale", { method: "PUT", body: JSON.stringify({ locale: nextLocale }) });
    setLocale(customerLocale(result.locale));
  };
  return <div className="customer-shell" lang={locale} dir={customerDirection(locale)}>
    <header className="customer-appbar">{!isHome ? <button type="button" className="appbar-back" onClick={() => navigate(-1)} aria-label="Back"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg></button> : <span className="appbar-spacer" />}<Link className="brand-lockup" to="/" aria-label="Vesper"><img src="/vesper.svg" alt="" /><span className="brand-name">Vesper</span></Link><div className="appbar-tools"><label className="appbar-locale" aria-label={t.language}><svg className="locale-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg><span className="locale-label">{localeLabel(locale)}</span><select value={locale} onChange={(event) => void overrideLocale(event.target.value)}>{customerLocales.map((value) => <option key={value} value={value}>{localeLabel(value)}</option>)}</select></label><Link className="appbar-cart" to="/cart" aria-label={t.cart}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>{cartCount > 0 && <span className="appbar-cart-badge">{cartCount}</span>}</Link></div></header>
    {children}
    <nav className="customer-nav" aria-label="Vesper"><NavLink to="/" end><TabIcon name="discover" /><span>{t.discover}</span></NavLink><NavLink to="/guide"><TabIcon name="guide" /><span>{t.guide}</span></NavLink><NavLink to="/cart"><TabIcon name="cart" /><span>{t.cart}</span></NavLink><NavLink to="/library"><TabIcon name="library" /><span>{t.purchases}</span></NavLink></nav>
  </div>;
}

function Catalog({ t }: { t: CustomerText }) {
  const [creators, setCreators] = useState<Creator[]>([]);
  useEffect(() => { void request<{ items: Creator[] }>("/catalog/creators").then((result) => setCreators(result.items)); }, []);
  return <main className="customer-main">
    <div className="catalog-hero">
      <p className="eyebrow">VESPER / TELESCOPE</p>
      <h1>{t.discoverTitle}</h1>
      <p className="catalog-lead">{t.catalogLead}</p>
    </div>
    {creators.length
      ? <TelescopeCreatorList creators={creators.map((creator) => ({ ...creator, bio: creator.bio || t.defaultBio }))} viewLabel={t.viewCreator} />
      : <article className="creator-card creator-empty-card"><div className="creator-cover" /><h2>{t.emptyCatalogTitle}</h2><p>{t.emptyCatalogText}</p></article>}
  </main>;
}

function Guide({ t }: { t: CustomerText }) {
  return <main className="customer-main">
    <p className="eyebrow">{t.guide}</p><h1>{t.guideTitle}</h1>
    <ol className="guide-steps">{t.guideSteps.map(([title, text]) => <li key={title}><h2>{title}</h2><p>{text}</p></li>)}</ol>
    <Link className="customer-primary-link" to="/">{t.startDiscovering}</Link>
  </main>;
}

type GridContentItem = { _id: string; title: string; preview?: Product["preview"]; previewMode?: Product["previewMode"]; description?: string; amountMinor?: number; currency?: string; status?: string };

function LazyPreviewVideo({ url, unavailable }: { url: string; unavailable: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const element = videoRef.current;
    if (!element || reducedMotion) return;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      if (entry.isIntersecting) void element.play().catch(() => {});
      else element.pause();
    }, { threshold: 0.35, rootMargin: "80px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [reducedMotion]);

  if (reducedMotion) return <div className="preview-unavailable">{unavailable}</div>;
  return <video ref={videoRef} src={inView ? url : undefined} muted loop playsInline preload="none" aria-hidden="true" />;
}

function ContentGrid({ items, add, empty, renderCopy, addCard, className = "", t, locale, added }: { items: GridContentItem[]; add?: (id: string) => void; empty: ReactNode; renderCopy?: (item: GridContentItem) => ReactNode; addCard?: ReactNode; className?: string; t?: CustomerText; locale?: CustomerLocale; added?: { id: string; sequence: number } }) {
  return <section className={`reel-grid ${className}`}>{items.map((item) => <article className="reel-card" key={item._id}>
    {added?.id === item._id && <span key={added.sequence} className="cart-added-glow" aria-hidden="true" />}
    <div className={`reel-preview preview-${item.previewMode ?? "blurred"}`}>{item.preview?.mimeType.startsWith("video/") ? <LazyPreviewVideo url={item.preview.url} unavailable={t?.previewUnavailable ?? "Preview unavailable"} /> : item.preview ? <img src={item.preview.url} alt="" /> : <div className="preview-unavailable">{t?.previewUnavailable ?? "Preview unavailable"}</div>}</div>
    <div className="reel-copy">{renderCopy ? renderCopy(item) : <><h2>{item.title}</h2><p>{item.description}</p><strong className="ltr-value" dir="ltr">{money(item.amountMinor!, item.currency!, locale)}</strong><button onClick={() => add?.(item._id)}>{t?.addToCart ?? "Add to cart"}</button></>}</div>
  </article>)}{addCard}{!items.length && empty}</section>;
}

function CreatorPage({ t, locale, onCartChange }: { t: CustomerText; locale: CustomerLocale; onCartChange: () => void }) {
  const { slug } = useParams();
  const [items, setItems] = useState<Product[]>([]);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [notice, setNotice] = useState("");
  const [added, setAdded] = useState<{ id: string; sequence: number }>();
  useEffect(() => { void request<{ creator: Creator; items: Product[] }>(`/catalog/creators/${slug}/products`).then((result) => { setCreator(result.creator); setItems(result.items); }).catch(() => setNotice(t.creatorUnavailable)); }, [slug, t.creatorUnavailable]);
  const add = async (productId: string) => {
    try { await request("/cart/items", { method: "POST", body: JSON.stringify({ productId }) }); setAdded((previous) => ({ id: productId, sequence: (previous?.sequence ?? 0) + 1 })); setNotice(t.addedToCart); onCartChange(); }
    catch { setNotice(t.cartUpdateFailed); }
  };
  return <main className="customer-main">
    <Link className="back-link" to="/">← {t.backDiscover}</Link>
    <section className="creator-profile-hero">
      <div className="creator-profile-avatar">
        {creator?.avatarUrl
          ? <img src={creator.avatarUrl} alt="" width="112" height="112" />
          : <span aria-hidden="true">{creator?.displayName.trim().slice(0, 1)}</span>}
      </div>
      <div>
        <p className="eyebrow">{t.creatorStorefront}</p>
        <h1>{creator?.displayName ?? t.discover}</h1>
        <p>{creator?.bio}</p>
      </div>
    </section>
    {notice && <p role="status" className="notice">{notice}</p>}
    <ContentGrid items={items} add={add} added={added} t={t} locale={locale} empty={<p className="empty">{t.noContent}</p>} />
  </main>;
}

type Cart = { _id?: string; currency: string; items: { productId: string; titleSnapshot: string; creatorNameSnapshot: string; priceMinorSnapshot: number }[] };
function CartPage({ t, locale, browser, onCartChange }: { t: CustomerText; locale: CustomerLocale; browser: boolean; onCartChange: () => void }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const navigate = useNavigate();
  const load = () => void request<Cart>("/cart").then(setCart);
  useEffect(load, []);
  const remove = async (productId: string) => { await request(`/cart/items/${productId}`, { method: "DELETE" }); load(); onCartChange(); };
  const checkout = async () => {
    try {
      await request("/me/age-confirmation", { method: "POST", body: JSON.stringify({ accepted: true, version: "2026-09" }) });
      const result = await request<{ checkoutUrl: string }>("/checkout", { method: "POST" });
      if (!browser && window.Telegram?.WebApp?.initData) window.Telegram.WebApp.openLink(result.checkoutUrl); else window.location.assign(result.checkoutUrl);
    } catch (error) { alert(error instanceof Error && error.message === "telegram_delivery_required" ? t.telegramCheckoutRequired : t.checkoutUnavailable); }
  };
  const total = cart?.items.reduce((sum, item) => sum + item.priceMinorSnapshot, 0) ?? 0;
  return <main className="customer-main"><h1>{t.cartTitle}</h1>{browser && <p className="notice">{t.telegramCheckoutRequired}</p>}{cart?.items.map((item) => <article className="cart-item" key={item.productId}><h2>{item.titleSnapshot}</h2><p>{item.creatorNameSnapshot} <span aria-hidden="true">·</span> <span className="ltr-value" dir="ltr">{money(item.priceMinorSnapshot, cart.currency, locale)}</span></p><button onClick={() => void remove(item.productId)}>{t.remove}</button></article>)}{cart && !cart.items.length && <p className="empty">{t.emptyCart}</p>}<section className="cart-summary"><h2>{t.total}: <span className="ltr-value" dir="ltr">{money(total, cart?.currency ?? "EUR", locale)}</span></h2><button disabled={!total || browser} onClick={() => void checkout()}>{t.secureCheckout}</button><button className="plain-button" onClick={() => navigate("/")}>{t.continueBrowsing}</button></section></main>;
}

function Library({ t }: { t: CustomerText }) {
  const [orders, setOrders] = useState<{ publicId: string; fulfillmentStatus: string; lines: { productTitle: string }[] }[]>([]);
  useEffect(() => { void request<{ items: typeof orders }>("/purchases").then((result) => setOrders(result.items)); }, []);
  const [notice, setNotice] = useState("");
  const retry = async (publicId: string) => { await request(`/purchases/${publicId}/retry-delivery`, { method: "POST" }); setNotice(t.retryQueued); };
  return <main className="customer-main"><h1>{t.purchasesTitle}</h1>{notice && <p className="notice" role="status">{notice}</p>}{!orders.length && <p className="empty">{t.noPurchases}</p>}{orders.map((order) => <article className="purchase-item" key={order.publicId}><h2>{order.lines.map((line) => line.productTitle).join(", ")}</h2><p>{t.delivery}: {t.status[order.fulfillmentStatus] ?? order.fulfillmentStatus}</p><p className="order-id" dir="ltr">{order.publicId}</p><button onClick={() => void retry(order.publicId)}>{t.retryDelivery}</button></article>)}</main>;
}

function PaymentComplete({ t }: { t: CustomerText }) {
  const params = new URLSearchParams(location.search);
  const [status, setStatus] = useState(t.paymentChecking);
  useEffect(() => {
    const order = params.get("order"); const state = params.get("state");
    if (!order || !state) return;
    const check = () => void request<{ paymentStatus: string }>(`/payment-return/${order}?state=${encodeURIComponent(state)}`).then((result) => setStatus(result.paymentStatus === "paid" ? t.paymentConfirmed : t.paymentProcessing)).catch(() => setStatus(t.paymentReturn));
    check(); const timer = setInterval(check, 5000); return () => clearInterval(timer);
  }, []);
  return <main className="customer-main"><h1>{status}</h1><Link className="customer-primary-link" to="/library">{t.purchases}</Link></main>;
}

function Dialog({ title, close, closeLabel, children }: { title: string; close: () => void; closeLabel: string; children: ReactNode }) {
  return <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) close(); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button type="button" className="dialog-close" onClick={close} aria-label={closeLabel}>×</button></div>{children}</section></div>;
}

// --- Admin: Orders tab ---

function AdminOrders({ t, customerId }: { t: typeof adminCopy.en; customerId?: string }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams({ page: String(page) });
    if (filter) qs.set("status", filter);
    if (search.trim()) qs.set("customer", search.trim());
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (customerId) qs.set("customerId", customerId);
    setError(false);
    void request<{ items: AdminOrder[]; pages: number }>(`/admin/orders?${qs}`).then((r) => { if (active) { setOrders(r.items); setPages(r.pages); } }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [filter, search, from, to, page, customerId]);
  const statuses = ["pending", "paid", "expired", "failed", "refunded", "charged_back"];
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  return <>
    {!customerId && <section className="admin-intro"><h2>{t.ordersTitle}</h2></section>}
    <div className="order-filters">
      <button className={`filter-btn${filter === "" ? " active" : ""}`} onClick={() => { setFilter(""); setPage(1); }}>{t.filterAll}</button>
      {statuses.map((s) => <button key={s} className={`filter-btn${filter === s ? " active" : ""}`} onClick={() => { setFilter(s); setPage(1); }}>{s}</button>)}
    </div>
    <div className="admin-filter-fields">{!customerId && <label>{t.customerSearch}<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>}<label>{t.fromDate}<input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label><label>{t.toDate}<input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label></div>
    {error ? <p role="alert">{t.requestFailed}</p> : orders.length ? <div className="admin-table-wrap"><table className="admin-table">
      <thead><tr><th>{t.date}</th><th>{t.customer}</th><th>{t.items}</th><th>{t.total}</th><th>{t.payment}</th><th>{t.fulfillment}</th><th>{t.orderId}</th></tr></thead>
      <tbody>{orders.map((o) => {
        const user = o.telegramUser?.username ? `@${o.telegramUser.username}` : (o.telegramUser?.firstName ?? "—");
        const items = o.lines.map((l) => l.productTitle).join(", ");
        return <tr key={o._id}>
          <td>{formatDate(o.createdAt)}</td>
          <td>{user}</td>
          <td title={items}>{items.length > 40 ? items.slice(0, 37) + "?" : items}</td>
          <td className="ltr-value" dir="ltr">{money(o.totalMinor, o.currency)}</td>
          <td><span className={`status-badge status-${o.paymentStatus}`}>{o.paymentStatus}</span></td>
          <td>{o.fulfillmentStatus}</td>
          <td className="order-id" dir="ltr">{o.publicId}</td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="empty">{t.noOrders}</p>}
    <div className="asset-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t.previousPage}</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t.nextPage}</button></div>
  </>;
}

// --- Admin: Revenue tab ---

function AdminRevenue({ t }: { t: typeof adminCopy.en }) {
  const [data, setData] = useState<RevenueData | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => { let active = true; const qs = new URLSearchParams(); if (from) qs.set("from", from); if (to) qs.set("to", to); setError(false); void request<RevenueData>(`/admin/revenue?${qs}`).then((result) => { if (active) setData(result); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [from, to]);
  if (!data) return <p className="empty">{t.loading}</p>;
  return <>
    <section className="admin-intro"><h2>{t.revenueTitle}</h2></section>
    <div className="revenue-cards">
      <div className="revenue-card"><div className="revenue-value ltr-value" dir="ltr">{money(data.total.grossMinor, "EUR")}</div><div className="revenue-label">{t.totalRevenue}</div></div>
      <div className="revenue-card"><div className="revenue-value ltr-value" dir="ltr">{money(data.month.grossMinor, "EUR")}</div><div className="revenue-label">{t.monthRevenue}</div></div>
      <div className="revenue-card"><div className="revenue-value">{data.total.count}</div><div className="revenue-label">{t.paidOrders}</div></div>
    </div>
    <h2 className="section-title">{t.creatorRevenue}</h2>
    <div className="admin-filter-fields"><label>{t.fromDate}<input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label><label>{t.toDate}<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label></div>
    {error && <p role="alert">{t.requestFailed}</p>}
    {data.creators.length ? <div className="admin-table-wrap"><table className="admin-table">
      <thead><tr><th>Creator</th><th>{t.revenue}</th><th>{t.purchases}</th></tr></thead>
      <tbody>{data.creators.map((c) => <tr key={c._id}>
        <td>{c.name}</td>
        <td className="ltr-value" dir="ltr">{money(c.grossMinor, "EUR")}</td>
        <td>{c.purchases}</td>
      </tr>)}</tbody>
    </table></div> : <p className="empty">{t.noSalesYet}</p>}
  </>;
}

// --- Admin shell ---

function Admin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { creatorId } = useParams();
  const isOrders = location.pathname === "/admin/orders";
  const isRevenue = location.pathname === "/admin/revenue";
  const isCategories = location.pathname === "/admin/categories";
  const isCustomers = location.pathname === "/admin/customers";
  const isCatalogue = !isOrders && !isRevenue && !isCategories && !isCustomers && !creatorId;
  const [language, setLanguage] = useState<AdminLanguage>(() => adminLanguage(localStorage.getItem("marketplace_admin_language")));
  const [token, setAdminToken] = useState(sessionStorage.getItem("marketplace_admin_token") ?? "");
  const [creators, setCreators] = useState<AdminCreator[]>([]);
  const [assets, setAssets] = useState<AdminAsset[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [notice, setNotice] = useState("");
  const [showCreatorDialog, setShowCreatorDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [creatingFor, setCreatingFor] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "creators" | "products" | "categories"; id: string; name: string } | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const t = adminCopy[language];
  const selectedCreator = creators.find((creator) => creator._id === creatorId);
  const direction = adminDirection(language);

  useEffect(() => {
    localStorage.setItem("marketplace_admin_language", language);
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [language, direction]);
  useEffect(() => { setNotice(""); }, [location.pathname]);
  const message = (error: unknown, fallback = t.requestFailed) => {
    const code = error instanceof Error ? error.message : "";
    if (code === "invalid_credentials") return t.invalidCredentials;
    return fallback;
  };
  const load = () => void Promise.all([
    request<{ items: AdminCreator[] }>("/admin/creators"),
    request<{ items: AdminAsset[] }>("/admin/assets"),
    request<{ items: AdminProduct[] }>("/admin/products"),
    request<{ items: AdminCategory[] }>("/admin/categories"),
  ]).then(([creatorResult, assetResult, productResult, categoryResult]) => {
    setCreators(creatorResult.items); setAssets(assetResult.items); setProducts(productResult.items); setCategories(categoryResult.items);
  }).catch((error) => setNotice(message(error)));
  useEffect(() => { if (token) { setToken(token); load(); } }, [token]);
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await request<{ token: string }>("/auth/admin", { method: "POST", body: JSON.stringify({ password: new FormData(event.currentTarget).get("password") }) });
      sessionStorage.setItem("marketplace_admin_token", result.token); setToken(result.token); setAdminToken(result.token);
    } catch (error) { setNotice(message(error, t.signInFailed)); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>, path: string, build: (data: FormData) => unknown, success = t.saved, method: "POST" | "PATCH" = "POST") => {
    event.preventDefault();
    const form = event.currentTarget;
    try { await request(path, { method, body: JSON.stringify(build(new FormData(form))) }); form.reset(); setNotice(success); load(); return true; }
    catch (error) { setNotice(message(error, t.saveFailed)); return false; }
  };
  const publishCreator = async (id: string) => { try { await request(`/admin/creators/${id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) }); setNotice(t.saved); load(); } catch (error) { setNotice(message(error, t.saveFailed)); } };
  const publishProduct = async (id: string) => { try { await request(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) }); setNotice(t.saved); load(); } catch (error) { setNotice(message(error, t.saveFailed)); } };
  const confirmDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!deleteTarget || deleteText !== "confirm" || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      await request(`/admin/${deleteTarget.kind}/${deleteTarget.id}`, { method: "DELETE", body: JSON.stringify({ confirmation: deleteText }) });
      if (deleteTarget.kind === "creators") navigate("/admin");
      setDeleteTarget(null); setDeleteText(""); load();
    } catch (error) { setDeleteError(error instanceof Error && error.message === "creator_has_products" ? t.creatorHasProducts : t.deleteFailed); }
    finally { setDeleting(false); }
  };
  const startDelete = (kind: "creators" | "products" | "categories", id: string, name: string) => { setDeleteText(""); setDeleteError(""); setDeleteTarget({ kind, id, name }); };
  const signOut = () => { sessionStorage.removeItem("marketplace_admin_token"); clearToken(); setAdminToken(""); navigate("/admin"); };

  if (!token) return <main className="admin admin-gate" lang={language} dir={direction}><LanguageSwitch language={language} setLanguage={setLanguage} title={t.language} /><p className="brand-lockup"><img src="/vesper.svg" alt="" /><span className="brand-name">Vesper</span></p><h1>{t.signIn}</h1>{notice && <p role="alert" className="notice">{notice}</p>}<form onSubmit={(event) => void login(event)}><label>{t.password}<input name="password" type="password" placeholder={t.password} autoComplete="current-password" required /></label><button>{t.signIn}</button></form></main>;

  const currentProducts = selectedCreator ? products.filter((product) => product.creatorId === selectedCreator._id) : [];
  return <main className="admin" lang={language} dir={direction}>
    <header className="admin-header"><div><p className="brand-lockup"><img src="/vesper.svg" alt="" /><span className="brand-name">Vesper</span></p><h1>{t.adminTitle}</h1></div><LanguageSwitch language={language} setLanguage={setLanguage} title={t.language} /></header>
    <nav className="admin-nav" aria-label={t.adminTitle}>
      <Link to="/admin" aria-current={isCatalogue || creatorId ? "page" : undefined}>{t.catalogue}</Link>
      <NavLink to="/admin/orders">{t.orders}</NavLink>
      <NavLink to="/admin/revenue">{t.revenue}</NavLink>
      <NavLink to="/admin/categories">{t.categories}</NavLink>
      <NavLink to="/admin/customers">{t.customers}</NavLink>
      <button type="button" className="plain-button" onClick={signOut}>{t.signOut}</button>
    </nav>
    {notice && <p role="status" className="notice">{notice}</p>}
    {isOrders && <AdminOrders t={t} />}
    {isRevenue && <AdminRevenue t={t} />}
    {creatorId ? selectedCreator ? <AdminCreatorContent creator={selectedCreator} products={currentProducts} t={t} createProduct={() => setCreatingFor(selectedCreator._id)} publish={publishProduct} editProduct={setEditingProduct} startDelete={startDelete} /> : <p className="empty">{t.loading}</p> : null}
    {isCatalogue && <AdminCatalogue creators={creators} t={t} showDialog={showCreatorDialog} openDialog={() => setShowCreatorDialog(true)} closeDialog={() => setShowCreatorDialog(false)} submit={submit} publish={publishCreator} />}
    {isCategories && <AdminCategories categories={categories} products={products} t={t} submit={submit} editProduct={setEditingProduct} startDelete={startDelete} />}
    {isCustomers && <AdminCustomers t={t} />}
    {editingProduct && <ProductEditor key={editingProduct._id} product={editingProduct} assets={assets} categories={categories} t={t} close={() => setEditingProduct(null)} load={load} />}
    {creatingFor && <ProductEditor key={`new-${creatingFor}`} creatorId={creatingFor} assets={assets.filter((asset) => asset.status === "ready")} categories={categories} t={t} close={() => setCreatingFor(undefined)} load={load} />}
    {deleteTarget && <Dialog title={t.deleteTitle} close={() => setDeleteTarget(null)} closeLabel={t.close}><form onSubmit={(event) => void confirmDelete(event)}><p>{t.deleteWarning} <strong>{deleteTarget.name}</strong></p><p>{deleteTarget.kind === "categories" ? t.deleteCategoryImpact : deleteTarget.kind === "products" ? t.deleteProductImpact : t.deleteCreatorImpact}</p><label>{t.typeConfirm}<input autoFocus value={deleteText} onChange={(event) => setDeleteText(event.target.value)} autoComplete="off" /></label>{deleteError && <p role="alert">{deleteError}</p>}<button type="submit" disabled={deleteText !== "confirm" || deleting}>{t.deleteAction}</button><button type="button" className="plain-button" onClick={() => setDeleteTarget(null)}>{t.cancel}</button></form></Dialog>}
  </main>;
}

function LanguageSwitch({ language, setLanguage, title }: { language: AdminLanguage; setLanguage: (language: AdminLanguage) => void; title: string }) {
  return <label className="language-switch">{title}<select value={language} onChange={(event) => setLanguage(adminLanguage(event.target.value))}><option value="en">English</option><option value="he">עברית</option></select></label>;
}

function AdminCatalogue({ creators, t, showDialog, openDialog, closeDialog, submit, publish }: { creators: AdminCreator[]; t: typeof adminCopy.en; showDialog: boolean; openDialog: () => void; closeDialog: () => void; submit: AdminSubmit; publish: (id: string) => void }) {
  return <><section className="admin-intro"><h2>{t.creatorCatalogue}</h2><p>{t.catalogueHelp}</p></section><CreatorGrid creators={creators.map((creator) => ({ key: creator._id, name: creator.displayName, bio: creator.bio || "?", status: creator.status === "published" ? undefined : t.draft, to: `/admin/creators/${creator._id}` }))} addCard={<PlusCard label={t.addCreator} onClick={openDialog} />} empty={<article className="creator-card creator-empty-card"><h2>{t.creatorEmpty}</h2></article>} />
    {showDialog && <Dialog title={t.newCreator} close={closeDialog} closeLabel={t.close}><NewCreatorForm t={t} submit={submit} closeDialog={closeDialog} /></Dialog>}
    {creators.some((creator) => creator.status !== "published") && <section><h2>{t.draft}</h2>{creators.filter((creator) => creator.status !== "published").map((creator) => <p key={creator._id}>{creator.displayName} <button type="button" onClick={() => void publish(creator._id)}>{t.publish}</button></p>)}</section>}</>;
}

function NewCreatorForm({ t, submit, closeDialog }: { t: typeof adminCopy.en; submit: AdminSubmit; closeDialog: () => void }) {
  return <form onSubmit={(event) => void submit(event, "/admin/creators", (data) => ({
    displayName: data.get("displayName"),
    slug: data.get("slug"),
    bio: data.get("bio"),
    rightsAttestation: { affirmedBy: data.get("affirmedBy") },
  }), t.creatorCreated).then((saved) => { if (saved) closeDialog(); })}>
    <label>{t.creatorName}<input name="displayName" required /></label>
    <label>{t.creatorSlug}<input name="slug" pattern="[a-z0-9-]+" placeholder="creator-slug" required /></label>
    <label>{t.creatorBio}<textarea name="bio" /></label>
    <label>{t.approvingAdmin}<input name="affirmedBy" required /></label>
    <button>{t.createCreator}</button>
  </form>;
}

type AdminSubmit = (event: FormEvent<HTMLFormElement>, path: string, build: (data: FormData) => unknown, success?: string, method?: "POST" | "PATCH") => Promise<boolean>;
type StartDelete = (kind: "creators" | "products" | "categories", id: string, name: string) => void;

function AdminAssetVisual({ asset, unavailable }: { asset: AdminAsset; unavailable: string }) {
  if (!asset.url) return <div className="asset-visual-fallback">{unavailable}</div>;
  if (asset.mimeType.startsWith("image/")) return <img src={asset.url} alt="" width="240" height="160" loading="lazy" />;
  if (asset.mimeType.startsWith("video/")) return <video src={asset.url} controls muted playsInline preload="metadata" aria-label={asset.fileName} />;
  return <div className="asset-visual-fallback">{unavailable}</div>;
}

function AdminAssetPicker({ assets, selectedId, onChange, t }: { assets: AdminAsset[]; selectedId: string; onChange: (id: string) => void; t: typeof adminCopy.en }) {
  return <fieldset className="asset-picker">
    <legend>{t.storefrontPreview}</legend>
    <div className="asset-picker-grid">
      <button type="button" className={`asset-picker-card${!selectedId ? " selected" : ""}`} aria-pressed={!selectedId} onClick={() => onChange("")}>
        <div className="asset-picker-visual"><span aria-hidden="true">—</span></div>
        <strong>{t.noPreviewOption}</strong>
      </button>
      {assets.filter((asset) => asset.purpose === "preview").map((asset) => <button type="button" key={asset._id} className={`asset-picker-card${selectedId === asset._id ? " selected" : ""}`} aria-pressed={selectedId === asset._id} onClick={() => onChange(asset._id)}>
        <div className="asset-picker-visual"><AdminAssetVisual asset={asset} unavailable={t.noPreviewMedia} />{selectedId === asset._id && <span className="asset-check" aria-label={t.selected}>✓</span>}</div>
        <strong>{asset.fileName || t.noPreviewMedia}</strong>
        <small>{asset.mimeType.startsWith("video/") ? t.mediaTypeVideo : t.mediaTypeImage}</small>
      </button>)}
    </div>
  </fieldset>;
}

function DeliveryAssetCard({ asset, selected, onToggle, t }: { asset: AdminAsset; selected: boolean; onToggle: () => void; t: typeof adminCopy.en }) {
  return <label className={`delivery-asset-card${selected ? " selected" : ""}`}>
    <input type="checkbox" checked={selected} onChange={onToggle} />
    <div className="delivery-asset-visual"><AdminAssetVisual asset={asset} unavailable={t.noPreviewMedia} />{selected && <span className="asset-check" aria-label={t.selected}>✓</span>}</div>
    <div className="delivery-asset-copy"><strong>{asset.fileName || (asset.mimeType.startsWith("video/") ? t.mediaTypeVideo : t.mediaTypeImage)}</strong><small>{asset.mimeType.startsWith("video/") ? t.mediaTypeVideo : t.mediaTypeImage}</small></div>
  </label>;
}

function AdminCreatorContent({ creator, products, t, createProduct, publish, editProduct, startDelete }: { creator: AdminCreator; products: AdminProduct[]; t: typeof adminCopy.en; createProduct: () => void; publish: (id: string) => void; editProduct: (product: AdminProduct) => void; startDelete: StartDelete }) {
  const navigate = useNavigate();
  return <><nav className="admin-content-nav"><button type="button" className="admin-back-button" onClick={() => navigate("/admin")}>← {t.backToCatalogue}</button></nav><section className="admin-intro"><p className="eyebrow">{t.content}</p><h2>{creator.displayName}</h2><p>{t.contentHelp}</p><button type="button" className="plain-button" onClick={() => startDelete("creators", creator._id, creator.displayName)}>{t.deleteAction}</button></section>
    <ContentGrid className="admin-content-grid" items={products} addCard={<PlusCard label={t.addContent} onClick={createProduct} />} empty={<p className="empty">{t.contentEmpty}</p>} renderCopy={(product) => <><h2>{product.title}</h2>{product.status !== "published" && <p>{t.draft}</p>}<button type="button" onClick={() => editProduct(product as AdminProduct)}>{t.edit}</button>{product.status !== "published" && <button type="button" onClick={() => void publish(product._id)}>{t.publish}</button>}<button type="button" className="plain-button" onClick={() => startDelete("products", product._id, product.title)}>{t.deleteAction}</button></>} />
  </>;
}
function ProductEditor({ product, creatorId, assets, categories, t, close, load }: { product?: AdminProduct; creatorId?: string; assets: AdminAsset[]; categories: AdminCategory[]; t: typeof adminCopy.en; close: () => void; load: () => void }) {
  const [previewId, setPreviewId] = useState(product?.previewAssetId ?? "");
  const [previewMode, setPreviewMode] = useState<"none" | "blurred" | "visible">(product?.previewMode ?? "none");
  const [preview, setPreview] = useState(assets.find((asset) => asset._id === product?.previewAssetId));
  const [categoryIds, setCategoryIds] = useState(product?.categoryIds ?? []);
  const [mediaIds, setMediaIds] = useState(product?.mediaAssetIds ?? []);
  const [uploadedAssets, setUploadedAssets] = useState<AdminAsset[]>([]);
  const [freshAssets, setFreshAssets] = useState(assets);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [assetPage, setAssetPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const direction = document.documentElement.dir === "rtl" ? "rtl" : "ltr";
  useEffect(() => {
    let active = true;
    const refresh = () => void request<{ items: AdminAsset[] }>("/admin/assets").then((result) => { if (active) setFreshAssets(result.items); }).catch(() => { if (active) setError(t.requestFailed); });
    refresh(); const timer = window.setInterval(refresh, 3 * 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [t.requestFailed]);
  const allAssets = [...uploadedAssets, ...freshAssets.filter((asset) => !uploadedAssets.some((uploaded) => uploaded._id === asset._id))];
  const deliveryAssets = allAssets.filter((asset) => (asset.purpose ?? "delivery") === "delivery" && asset.status === "ready");
  const assetPageCount = Math.max(1, Math.ceil(deliveryAssets.length / 8));
  const currentMedia = allAssets.find((asset) => asset._id === mediaIds[mediaIndex]);
  const currentPreview = allAssets.find((asset) => asset._id === previewId) ?? preview;
  const uploadFile = async (file: File | undefined, purpose: "preview" | "delivery") => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      if ((purpose === "preview" && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) || file.size > 50_000_000) throw new Error("invalid_file");
      const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((value) => value.toString(16).padStart(2, "0")).join("");
      const mimeType = file.type || "application/octet-stream";
      const result = await request<{ asset: AdminAsset; uploadUrl: string }>("/admin/assets/upload-url", { method: "POST", body: JSON.stringify({ fileName: file.name, mimeType, bytes: file.size, sha256, purpose }) });
      const response = await fetch(result.uploadUrl, { method: "PUT", headers: { "content-type": mimeType }, body: file });
      if (!response.ok) throw new Error("upload_failed");
      await request(`/admin/assets/${result.asset._id}/complete`, { method: "POST" });
      const uploaded = { ...result.asset, status: "ready", url: URL.createObjectURL(file) };
      setUploadedAssets((current) => [uploaded, ...current]);
      if (purpose === "preview") { setPreviewId(uploaded._id); setPreview(uploaded); setPreviewMode((mode) => mode === "none" ? "blurred" : mode); }
      else { setMediaIds((current) => [...current, uploaded._id]); setAssetPage(1); }
      load();
    } catch { setError(t.uploadFailed); } finally { setBusy(false); }
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      await request(product ? `/admin/products/${product._id}` : "/admin/products", { method: product ? "PATCH" : "POST", body: JSON.stringify({ ...(product ? {} : { creatorId, currency: "EUR" }), title: data.get("title"), description: data.get("description"), deliveryMessage: data.get("deliveryMessage"), amountMinor: euroToMinor(data.get("price")), categoryIds, ...(!product || JSON.stringify(mediaIds) !== JSON.stringify(product.mediaAssetIds) ? { mediaAssetIds: mediaIds } : {}), previewMode, previewAssetId: previewMode === "none" ? null : previewId || undefined }) });
      load(); close();
    } catch { setError(t.saveFailed); } finally { setBusy(false); }
  };
  return <CacheProvider value={direction === "rtl" ? adminRtlCache : adminLtrCache}><ThemeProvider theme={direction === "rtl" ? adminMuiRtlTheme : adminMuiTheme}>
    <MuiDialog open onClose={busy ? undefined : close} dir={direction} fullWidth maxWidth="md" scroll="paper" aria-labelledby="product-editor-title" className="product-editor-modal" slotProps={{ paper: { sx: { borderRadius: 3, bgcolor: "#19131d", backgroundImage: "none", maxHeight: "calc(100dvh - 32px)" } } }}>
      <Box component="form" onSubmit={(event) => void save(event)} className="mui-product-form">
        <DialogTitle id="product-editor-title" className="mui-product-title"><span>{product ? t.editContent : t.newContent}</span><IconButton aria-label={t.close} onClick={close} disabled={busy}>×</IconButton></DialogTitle>
        <DialogContent dividers className="mui-product-content">
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box className="mui-product-fields">
            <TextField name="title" label={t.productTitle} defaultValue={product?.title} required fullWidth />
            <TextField name="price" label={t.price} defaultValue={product ? (product.amountMinor / 100).toFixed(2) : ""} required fullWidth slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
            <TextField name="description" label={t.description} defaultValue={product?.description} multiline minRows={2} fullWidth />
            <TextField name="deliveryMessage" label={t.deliveryMessage} defaultValue={product?.deliveryMessage} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 1000 } }} />
            <Autocomplete multiple disableCloseOnSelect options={categories.filter((category) => category.status === "active" || categoryIds.includes(category._id))} value={categories.filter((category) => categoryIds.includes(category._id))} isOptionEqualToValue={(a, b) => a._id === b._id} getOptionLabel={(category) => category.name} onChange={(_event, values) => setCategoryIds(values.map((category) => category._id))} renderInput={(params) => <TextField {...params} label={t.categories} placeholder={t.categorySearch} />} />
          </Box>
          <Box className="mui-media-panel"><Typography variant="h6">{t.storefrontPreview}</Typography><div className="editor-preview">{currentPreview ? <AdminAssetVisual asset={currentPreview} unavailable={t.noPreviewMedia} /> : <div className="asset-visual-fallback">{t.noPreviewMedia}</div>}</div><Button component="label" variant="outlined" disabled={busy}>{t.changePreview}<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadFile(event.target.files?.[0], "preview"); event.target.value = ""; }} /></Button><TextField select fullWidth name="previewMode" label={t.preview} value={previewMode} onChange={(event) => setPreviewMode(event.target.value as "none" | "blurred" | "visible")}><MenuItem value="none">{t.noPreviewOption}</MenuItem><MenuItem value="blurred">{t.blurredPreviewOption}</MenuItem><MenuItem value="visible">{t.visiblePreviewOption}</MenuItem></TextField></Box>
          <Box className="mui-media-panel"><Typography variant="h6">{t.privateFiles}</Typography><div className="editor-player">{currentMedia ? <AdminAssetVisual key={`${currentMedia._id}-${currentMedia.url}`} asset={currentMedia} unavailable={t.noPreviewMedia} /> : <div className="asset-visual-fallback">{t.noMedia}</div>}</div><div className="editor-media-nav"><IconButton disabled={mediaIndex === 0} onClick={() => setMediaIndex(mediaIndex - 1)} aria-label={t.previousPage}>‹</IconButton><span dir="ltr">{mediaIds.length ? mediaIndex + 1 : 0} / {mediaIds.length}</span><IconButton disabled={mediaIndex >= mediaIds.length - 1} onClick={() => setMediaIndex(mediaIndex + 1)} aria-label={t.nextPage}>›</IconButton></div>{currentMedia && <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{currentMedia.fileName}</Typography>}<div className="delivery-asset-grid"><label className="delivery-upload-tile"><span aria-hidden="true">+</span>{t.uploadMedia}<input type="file" accept="image/*,video/*,audio/*,application/*" disabled={busy} onChange={(event) => { void uploadFile(event.target.files?.[0], "delivery"); event.target.value = ""; }} /></label>{deliveryAssets.slice((assetPage - 1) * 8, assetPage * 8).map((asset) => <DeliveryAssetCard key={asset._id} asset={asset} selected={mediaIds.includes(asset._id)} onToggle={() => { setMediaIds(mediaIds.includes(asset._id) ? mediaIds.filter((id) => id !== asset._id) : [...mediaIds, asset._id]); setMediaIndex(0); }} t={t} />)}</div><div className="editor-media-nav"><Button type="button" disabled={assetPage <= 1} onClick={() => setAssetPage(assetPage - 1)}>{t.previousPage}</Button><span dir="ltr">{assetPage} / {assetPageCount}</span><Button type="button" disabled={assetPage >= assetPageCount} onClick={() => setAssetPage(assetPage + 1)}>{t.nextPage}</Button></div></Box>
        </DialogContent>
        <DialogActions className="mui-product-actions"><Button onClick={close} disabled={busy}>{t.cancel}</Button><Button type="submit" variant="contained" disabled={busy || !mediaIds.length}>{product ? t.save : t.createProduct}</Button></DialogActions>
      </Box>
    </MuiDialog>
  </ThemeProvider></CacheProvider>;
}

function AdminCategories({ categories, products, t, submit, editProduct, startDelete }: { categories: AdminCategory[]; products: AdminProduct[]; t: typeof adminCopy.en; submit: AdminSubmit; editProduct: (product: AdminProduct) => void; startDelete: StartDelete }) {
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [selected, setSelected] = useState<string>();
  const category = categories.find((item) => item._id === selected);
  return <section className="category-manager"><section className="admin-intro"><h2>{category?.name ?? t.categories}</h2><p>{t.categoryHelp}</p></section>{category ? <><button type="button" className="admin-back-button" onClick={() => setSelected(undefined)}>← {t.categories}</button><button type="button" onClick={() => setEditing(category)}>{t.edit}</button><button type="button" className="plain-button" onClick={() => startDelete("categories", category._id, category.name)}>{t.deleteAction}</button><div className="category-card-grid">{products.filter((product) => product.categoryIds?.includes(category._id)).map((product) => <button type="button" className="category-tile" key={product._id} onClick={() => editProduct(product)}><strong>{product.title}</strong><span>{t.price}: {money(product.amountMinor, product.currency)}</span><span>{t.totalRevenue}: {money(product.grossMinor ?? 0, product.currency)}</span></button>)}</div></> : <><div className="category-card-grid">{categories.map((item) => <button type="button" key={item._id} className="category-tile" onClick={() => setSelected(item._id)}><strong>{item.name}</strong><span>{products.filter((product) => product.categoryIds?.includes(item._id)).length} {t.productsLabel}</span></button>)}<button type="button" className="category-tile category-add-tile" onClick={() => setEditing({ _id: "", name: "", slug: "", status: "active" })}><span className="category-add-icon" aria-hidden="true">+</span><strong>{t.createCategory}</strong></button></div></>}{editing && <Dialog title={editing._id ? t.edit : t.createCategory} close={() => setEditing(null)} closeLabel={t.close}><form key={editing._id} onSubmit={(event) => void submit(event, editing._id ? `/admin/categories/${editing._id}` : "/admin/categories", (data) => ({ name: data.get("name"), slug: data.get("slug") }), t.saved, editing._id ? "PATCH" : "POST").then((saved) => { if (saved) setEditing(null); })}><label>{t.categoryName}<input name="name" defaultValue={editing.name} required /></label><label>{t.categorySlug}<input name="slug" defaultValue={editing.slug} pattern="[a-z0-9-]+" aria-describedby="category-slug-help" required /><small id="category-slug-help" className="help">{t.categorySlugHelp}</small></label><button>{t.save}</button></form></Dialog>}</section>;
}

function AdminCustomers({ t }: { t: typeof adminCopy.en }) {
  const [customers, setCustomers] = useState<{ _id: string; telegramId: string; username?: string; firstName?: string; lastName?: string; totalMinor: number; purchases: number }[]>([]);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    setError(false);
    void request<{ items: typeof customers }>(`/admin/customers?${query}`).then((result) => { if (active) setCustomers(result.items); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [search, from, to]);
  return <><section className="admin-intro"><h2>{t.customers}</h2></section><div className="admin-filter-fields"><label>{t.customerSearch}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>{t.fromDate}<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label><label>{t.toDate}<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label></div><p className="help">{t.customerTotalsHelp}</p>{error ? <p role="alert">{t.requestFailed}</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Telegram ID</th><th>{t.customer}</th><th>{t.telegramUsername}</th><th>{t.customerPaidTotal}</th><th>{t.paidOrders}</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer._id} onClick={() => setSelected(selected === customer._id ? undefined : customer._id)}><td><button type="button" className="plain-button">{customer.telegramId}</button></td><td>{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "—"}</td><td dir="ltr">{customer.username ? `@${customer.username}` : "—"}</td><td className="ltr-value" dir="ltr">{money(customer.totalMinor, "EUR")}</td><td>{customer.purchases}</td></tr>)}</tbody></table></div>}{selected && <section><h2>{t.customerOrders}</h2><AdminOrders key={selected} t={t} customerId={selected} /></section>}</>;
}

function Marketplace() {
  const { ready, error, telegramAttempt, browser, locale, setLocale } = useCustomerSession();
  const [cartCount, setCartCount] = useState(0);
  const t = customerCopy[locale];
  const refreshCartCount = useCallback(() => {
    void request<Cart>("/cart").then((cart) => setCartCount(cart?.items?.length ?? 0)).catch(() => {});
  }, []);
  useEffect(() => { if (ready) refreshCartCount(); }, [ready, refreshCartCount]);
  if (error) return <main className="customer-main session-gate"><p className="brand-lockup"><img src="/vesper.svg" alt="" /><span className="brand-name">Vesper</span></p><p>{telegramAttempt ? t.sessionError : t.browserSessionError}</p></main>;
  if (!ready) return <main className="customer-main session-gate"><p className="brand-lockup"><img src="/vesper.svg" alt="" /><span className="brand-name">Vesper</span></p><p>{t.openingCatalog}</p></main>;
  return <CustomerShell locale={locale} setLocale={setLocale} cartCount={cartCount}><Routes><Route path="/" element={<Catalog t={t} />} /><Route path="/guide" element={<Guide t={t} />} /><Route path="/creators/:slug" element={<CreatorPage t={t} locale={locale} onCartChange={refreshCartCount} />} /><Route path="/cart" element={<CartPage t={t} locale={locale} browser={browser} onCartChange={refreshCartCount} />} /><Route path="/library" element={<Library t={t} />} /><Route path="/payment-complete" element={<PaymentComplete t={t} />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></CustomerShell>;
}

export function App() {
  return <Routes>
    <Route path="/admin" element={<Admin />} />
    <Route path="/admin/creators/:creatorId" element={<Admin />} />
    <Route path="/admin/categories" element={<Admin />} />
    <Route path="/admin/customers" element={<Admin />} />
    <Route path="/admin/orders" element={<Admin />} />
    <Route path="/admin/revenue" element={<Admin />} />
    <Route path="*" element={<Marketplace />} />
  </Routes>;
}
