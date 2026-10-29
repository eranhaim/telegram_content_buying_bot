import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { clearToken, Creator, euroToMinor, money, Product, request, setToken } from "./api";
import { adminCopy, adminDirection, adminLanguage, type AdminLanguage } from "./admin-i18n";
import { customerCopy, customerDirection, customerLocale, customerLocales, type CustomerLocale } from "./customer-i18n";

const localeLabel = (locale: CustomerLocale): string => {
  const labels: Record<CustomerLocale, string> = { en: "EN", he: "??", fr: "FR", es: "ES", de: "DE", "pt-BR": "PT-BR", "pt-PT": "PT" };
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

type AdminAgency = { _id: string; name: string };
type AdminCreator = { _id: string; agencyId: string; displayName: string; slug: string; bio: string; status: string };
type AdminAsset = { _id: string; agencyId: string; fileName: string; mimeType: string; status: string; purpose?: "delivery" | "preview"; url?: string; createdAt?: string };
type AdminCategory = { _id: string; agencyId: string; name: string; slug: string; status: string };
type AdminProduct = {
  _id: string; agencyId: string; creatorId: string; title: string; slug: string; description: string; status: string;
  deliveryMessage?: string; amountMinor: number; currency: "EUR"; categoryIds: string[]; previewAssetId?: string; previewMode: "none" | "blurred" | "visible"; mediaAssetIds: string[];
};
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
      <span className="telescope-creator-arrow" aria-hidden="true">?</span>
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

function Guide({ t, browser }: { t: CustomerText; browser: boolean }) {
  const steps = browser ? t.guideSteps.map((step, index) => index === 3 ? [t.browserAccessTitle, t.browserAccessText] as const : step) : t.guideSteps;
  return <main className="customer-main">
    <p className="eyebrow">{t.guide}</p><h1>{t.guideTitle}</h1>
    <ol className="guide-steps">{steps.map(([title, text]) => <li key={title}><h2>{title}</h2><p>{text}</p></li>)}</ol>
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

function ContentGrid({ items, add, empty, renderCopy, addCard, className = "", t, locale }: { items: GridContentItem[]; add?: (id: string) => void; empty: ReactNode; renderCopy?: (item: GridContentItem) => ReactNode; addCard?: ReactNode; className?: string; t?: CustomerText; locale?: CustomerLocale }) {
  return <section className={`reel-grid ${className}`}>{items.map((item) => <article className="reel-card" key={item._id}>
    <div className={`reel-preview preview-${item.previewMode ?? "blurred"}`}>{item.preview?.mimeType.startsWith("video/") ? <LazyPreviewVideo url={item.preview.url} unavailable={t?.previewUnavailable ?? "Preview unavailable"} /> : item.preview ? <img src={item.preview.url} alt="" /> : <div className="preview-unavailable">{t?.previewUnavailable ?? "Preview unavailable"}</div>}{item.previewMode === "blurred" && <span className="blur-label">{t?.blurredPreview ?? "BLURRED PREVIEW"}</span>}</div>
    <div className="reel-copy">{renderCopy ? renderCopy(item) : <><h2>{item.title}</h2><p>{item.description}</p><strong className="ltr-value" dir="ltr">{money(item.amountMinor!, item.currency!, locale)}</strong><button onClick={() => add?.(item._id)}>{t?.addToCart ?? "Add to cart"}</button></>}</div>
  </article>)}{addCard}{!items.length && empty}</section>;
}

type FeaturedVideo = { url?: string; posterUrl?: string };
const FEATURED_VIDEO_CLIP_SECONDS = 12;

function FeaturedCreatorVideo({ video, posterUrl, label, unavailable }: { video?: FeaturedVideo; posterUrl?: string; label: string; unavailable: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !video?.url || reducedMotion) return;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
      if (entry.isIntersecting) void element.play().catch(() => {});
      else element.pause();
    }, { threshold: 0.55, rootMargin: "120px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [reducedMotion, video?.url]);

  return <section className="featured-video-card" aria-label={label}>
    <div className="featured-video-frame">
      {video?.url && !reducedMotion
        ? <video
          ref={videoRef}
          src={inView ? video.url : undefined}
          poster={video.posterUrl || posterUrl}
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          onTimeUpdate={(event) => {
            if (event.currentTarget.currentTime >= FEATURED_VIDEO_CLIP_SECONDS) {
              event.currentTarget.currentTime = 0;
              void event.currentTarget.play().catch(() => {});
            }
          }}
          onEnded={(event) => {
            event.currentTarget.currentTime = 0;
            void event.currentTarget.play().catch(() => {});
          }}
        />
        : posterUrl
          ? <img src={video?.posterUrl || posterUrl} alt="" width="720" height="420" />
          : <div className="featured-video-empty">{unavailable}</div>}
      <div className="featured-video-overlay"><span>{label}</span><i aria-hidden="true">?</i></div>
    </div>
  </section>;
}

function CreatorPage({ t, locale, onCartChange }: { t: CustomerText; locale: CustomerLocale; onCartChange: () => void }) {
  const { slug } = useParams();
  const [items, setItems] = useState<Product[]>([]);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [featuredVideo, setFeaturedVideo] = useState<FeaturedVideo>();
  const [notice, setNotice] = useState("");
  useEffect(() => { void request<{ creator: Creator; items: Product[]; featuredVideo?: FeaturedVideo }>(`/catalog/creators/${slug}/products`).then((result) => { setCreator(result.creator); setItems(result.items); setFeaturedVideo(result.featuredVideo); }).catch(() => setNotice(t.creatorUnavailable)); }, [slug, t.creatorUnavailable]);
  const add = async (productId: string) => {
    try { await request("/cart/items", { method: "POST", body: JSON.stringify({ productId }) }); setNotice(t.addedToCart); onCartChange(); }
    catch { setNotice(t.cartUpdateFailed); }
  };
  return <main className="customer-main">
    <Link className="back-link" to="/">? {t.backDiscover}</Link>
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
    <FeaturedCreatorVideo video={featuredVideo} posterUrl={creator?.avatarUrl} label={t.featuredVideo} unavailable={t.featuredVideoUnavailable} />
    {notice && <p role="status" className="notice">{notice}</p>}
    <ContentGrid items={items} add={add} t={t} locale={locale} empty={<p className="empty">{t.noContent}</p>} />
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
    } catch { alert(t.checkoutUnavailable); }
  };
  const total = cart?.items.reduce((sum, item) => sum + item.priceMinorSnapshot, 0) ?? 0;
  return <main className="customer-main"><h1>{t.cartTitle}</h1>{cart?.items.map((item) => <article className="cart-item" key={item.productId}><h2>{item.titleSnapshot}</h2><p>{item.creatorNameSnapshot} ? <span className="ltr-value" dir="ltr">{money(item.priceMinorSnapshot, cart.currency, locale)}</span></p><button onClick={() => void remove(item.productId)}>{t.remove}</button></article>)}{cart && !cart.items.length && <p className="empty">{t.emptyCart}</p>}<section className="cart-summary"><h2>{t.total}: <span className="ltr-value" dir="ltr">{money(total, cart?.currency ?? "EUR", locale)}</span></h2><button disabled={!total} onClick={() => void checkout()}>{t.secureCheckout}</button><button className="plain-button" onClick={() => navigate("/")}>{t.continueBrowsing}</button></section></main>;
}

function Library({ t, browser }: { t: CustomerText; browser: boolean }) {
  const [orders, setOrders] = useState<{ publicId: string; fulfillmentStatus: string; lines: { productTitle: string }[]; files?: { assetId: string; fileName: string; productTitle: string }[] }[]>([]);
  useEffect(() => { void request<{ items: typeof orders }>("/purchases").then((result) => setOrders(result.items)); }, []);
  const [notice, setNotice] = useState("");
  const retry = async (publicId: string) => { await request(`/purchases/${publicId}/retry-delivery`, { method: "POST" }); setNotice(t.retryQueued); };
  const download = async (publicId: string, assetId: string) => {
    try {
      const file = await request<{ url: string }>(`/purchases/${publicId}/files/${assetId}`);
      window.open(file.url, "_blank", "noopener,noreferrer");
    } catch { setNotice(t.downloadFailed); }
  };
  return <main className="customer-main"><h1>{t.purchasesTitle}</h1>{notice && <p className="notice" role="status">{notice}</p>}{!orders.length && <p className="empty">{t.noPurchases}</p>}{orders.map((order) => <article className="purchase-item" key={order.publicId}><h2>{order.lines.map((line) => line.productTitle).join(", ")}</h2><p>{t.delivery}: {t.status[order.fulfillmentStatus] ?? order.fulfillmentStatus}</p><p className="order-id" dir="ltr">{order.publicId}</p>{browser ? (order.files ?? []).map((file) => <div className="download-row" key={file.assetId}><span>{file.fileName}</span><button type="button" onClick={() => void download(order.publicId, file.assetId)}>{t.download}</button></div>) : <button onClick={() => void retry(order.publicId)}>{t.retryDelivery}</button>}</article>)}</main>;
}

function PaymentComplete({ t, browser }: { t: CustomerText; browser: boolean }) {
  const params = new URLSearchParams(location.search);
  const [status, setStatus] = useState(t.paymentChecking);
  useEffect(() => {
    const order = params.get("order"); const state = params.get("state");
    if (!order || !state) return;
    const check = () => void request<{ paymentStatus: string }>(`/payment-return/${order}?state=${encodeURIComponent(state)}`).then((result) => setStatus(result.paymentStatus === "paid" ? (browser ? t.browserPaymentConfirmed : t.paymentConfirmed) : t.paymentProcessing)).catch(() => setStatus(browser ? t.browserPaymentReturn : t.paymentReturn));
    check(); const timer = setInterval(check, 5000); return () => clearInterval(timer);
  }, []);
  return <main className="customer-main"><h1>{status}</h1><Link className="customer-primary-link" to="/library">{t.purchases}</Link></main>;
}

function Dialog({ title, close, closeLabel, children }: { title: string; close: () => void; closeLabel: string; children: ReactNode }) {
  return <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) close(); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button type="button" className="dialog-close" onClick={close} aria-label={closeLabel}>?</button></div>{children}</section></div>;
}

// --- Admin: Orders tab ---

function AdminOrders({ t }: { t: typeof adminCopy.en }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    const qs = filter ? `?status=${filter}` : "";
    void request<{ items: AdminOrder[] }>(`/admin/orders${qs}`).then((r) => setOrders(r.items)).catch(() => {});
  }, [filter]);
  const statuses = ["pending", "paid", "expired", "failed", "refunded", "charged_back"];
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  return <>
    <section className="admin-intro"><h2>{t.ordersTitle}</h2></section>
    <div className="order-filters">
      <button className={`filter-btn${filter === "" ? " active" : ""}`} onClick={() => setFilter("")}>{t.filterAll}</button>
      {statuses.map((s) => <button key={s} className={`filter-btn${filter === s ? " active" : ""}`} onClick={() => setFilter(s)}>{s}</button>)}
    </div>
    {orders.length ? <div className="admin-table-wrap"><table className="admin-table">
      <thead><tr><th>{t.date}</th><th>{t.customer}</th><th>{t.items}</th><th>{t.total}</th><th>{t.payment}</th><th>{t.fulfillment}</th><th>{t.orderId}</th></tr></thead>
      <tbody>{orders.map((o) => {
        const user = o.telegramUser?.username ? `@${o.telegramUser.username}` : (o.telegramUser?.firstName ?? "?");
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
  </>;
}

// --- Admin: Revenue tab ---

function AdminRevenue({ t }: { t: typeof adminCopy.en }) {
  const [data, setData] = useState<RevenueData | null>(null);
  useEffect(() => { void request<RevenueData>("/admin/revenue").then(setData).catch(() => {}); }, []);
  if (!data) return <p className="empty">{t.loading}</p>;
  return <>
    <section className="admin-intro"><h2>{t.revenueTitle}</h2></section>
    <div className="revenue-cards">
      <div className="revenue-card"><div className="revenue-value ltr-value" dir="ltr">{money(data.total.grossMinor, "EUR")}</div><div className="revenue-label">{t.totalRevenue}</div></div>
      <div className="revenue-card"><div className="revenue-value ltr-value" dir="ltr">{money(data.today.grossMinor, "EUR")}</div><div className="revenue-label">{t.todayRevenue} ({data.today.count})</div></div>
      <div className="revenue-card"><div className="revenue-value ltr-value" dir="ltr">{money(data.month.grossMinor, "EUR")}</div><div className="revenue-label">{t.monthRevenue} ({data.month.count})</div></div>
      <div className="revenue-card"><div className="revenue-value">{data.total.count}</div><div className="revenue-label">{t.paidOrders}</div></div>
      <div className="revenue-card"><div className="revenue-value">{data.statusCounts.pending ?? 0}</div><div className="revenue-label">{t.pendingOrders}</div></div>
      <div className="revenue-card"><div className="revenue-value">{data.statusCounts.expired ?? 0}</div><div className="revenue-label">{t.expiredOrders}</div></div>
    </div>
    <h2 className="section-title">{t.creatorRevenue}</h2>
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
  const isCatalogue = !isOrders && !isRevenue && !creatorId;
  const [language, setLanguage] = useState<AdminLanguage>(() => adminLanguage(localStorage.getItem("marketplace_admin_language")));
  const [token, setAdminToken] = useState(sessionStorage.getItem("marketplace_admin_token") ?? "");
  const [agencies, setAgencies] = useState<AdminAgency[]>([]);
  const [creators, setCreators] = useState<AdminCreator[]>([]);
  const [assets, setAssets] = useState<AdminAsset[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [notice, setNotice] = useState("");
  const [showCreatorDialog, setShowCreatorDialog] = useState(false);
  const [showContentDialog, setShowContentDialog] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const t = adminCopy[language];
  const selectedCreator = creators.find((creator) => creator._id === creatorId);
  const direction = adminDirection(language);

  useEffect(() => {
    localStorage.setItem("marketplace_admin_language", language);
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [language, direction]);
  const message = (error: unknown, fallback = t.requestFailed) => {
    const code = error instanceof Error ? error.message : "";
    if (code === "invalid_credentials") return t.invalidCredentials;
    return fallback;
  };
  const load = () => void Promise.all([
    request<{ items: AdminAgency[] }>("/admin/agencies"),
    request<{ items: AdminCreator[] }>("/admin/creators"),
    request<{ items: AdminAsset[] }>("/admin/assets"),
    request<{ items: AdminProduct[] }>("/admin/products"),
    request<{ items: AdminCategory[] }>("/admin/categories"),
  ]).then(([agencyResult, creatorResult, assetResult, productResult, categoryResult]) => {
    setAgencies(agencyResult.items); setCreators(creatorResult.items); setAssets(assetResult.items); setProducts(productResult.items); setCategories(categoryResult.items);
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
    try { await request(path, { method, body: JSON.stringify(build(new FormData(event.currentTarget))) }); event.currentTarget.reset(); setNotice(success); load(); }
    catch (error) { setNotice(message(error, t.saveFailed)); }
  };
  const upload = async (event: FormEvent<HTMLFormElement>, agencyId?: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget); const file = data.get("file");
    if (!(file instanceof File)) return;
    if (file.size > 50_000_000) { setNotice(t.mediaLimit); return; }
    const checksum = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((value) => value.toString(16).padStart(2, "0")).join("");
    try {
      const result = await request<{ asset: { _id: string }; uploadUrl: string }>("/admin/assets/upload-url", { method: "POST", body: JSON.stringify({ agencyId: agencyId ?? data.get("agencyId"), purpose: data.get("purpose"), fileName: file.name, mimeType: file.type || "application/octet-stream", bytes: file.size, sha256: checksum }) });
      await fetch(result.uploadUrl, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
      await request(`/admin/assets/${result.asset._id}/complete`, { method: "POST" });
      event.currentTarget.reset(); setNotice(t.mediaUploaded); load();
    } catch (error) { setNotice(message(error, t.uploadFailed)); }
  };
  const publishCreator = async (id: string) => { try { await request(`/admin/creators/${id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) }); setNotice(t.published); load(); } catch (error) { setNotice(message(error, t.saveFailed)); } };
  const publishProduct = async (id: string) => { try { await request(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) }); setNotice(t.published); load(); } catch (error) { setNotice(message(error, t.saveFailed)); } };
  const signOut = () => { sessionStorage.removeItem("marketplace_admin_token"); clearToken(); setAdminToken(""); navigate("/admin"); };

  if (!token) return <main className="admin admin-gate" lang={language} dir={direction}><LanguageSwitch language={language} setLanguage={setLanguage} title={t.language} /><p className="brand-lockup"><img src="/vesper.svg" alt="" /><span className="brand-name">Vesper</span></p><h1>{t.signIn}</h1>{notice && <p role="alert" className="notice">{notice}</p>}<form onSubmit={(event) => void login(event)}><label>{t.password}<input name="password" type="password" placeholder={t.password} autoComplete="current-password" required /></label><button>{t.signIn}</button></form></main>;

  const currentAssets = selectedCreator ? assets.filter((asset) => asset.agencyId === selectedCreator.agencyId && asset.status === "ready") : [];
  const currentProducts = selectedCreator ? products.filter((product) => product.creatorId === selectedCreator._id) : [];
  return <main className="admin" lang={language} dir={direction}>
    <header className="admin-header"><div><p className="brand-lockup"><img src="/vesper.svg" alt="" /><span className="brand-name">Vesper</span></p><h1>{t.adminTitle}</h1></div><LanguageSwitch language={language} setLanguage={setLanguage} title={t.language} /></header>
    <nav className="admin-nav" aria-label={t.adminTitle}>
      <Link to="/admin" aria-current={isCatalogue || creatorId ? "page" : undefined}>{t.catalogue}</Link>
      <NavLink to="/admin/orders">{t.orders}</NavLink>
      <NavLink to="/admin/revenue">{t.revenue}</NavLink>
      <a href="#setup">{t.setup}</a>
      <button type="button" className="plain-button" onClick={signOut}>{t.signOut}</button>
    </nav>
    {notice && <p role="status" className="notice">{notice}</p>}
    {isOrders && <AdminOrders t={t} />}
    {isRevenue && <AdminRevenue t={t} />}
    {creatorId ? selectedCreator ? <AdminCreatorContent creator={selectedCreator} products={currentProducts} assets={currentAssets} categories={categories.filter((category) => category.agencyId === selectedCreator.agencyId)} t={t} selectedAssetIds={selectedAssetIds} setSelectedAssetIds={setSelectedAssetIds} showDialog={showContentDialog} openDialog={() => setShowContentDialog(true)} closeDialog={() => setShowContentDialog(false)} upload={upload} submit={submit} publish={publishProduct} load={load} /> : <p className="empty">{t.loading}</p> : null}
    {isCatalogue && <AdminCatalogue creators={creators} agencies={agencies} t={t} showDialog={showCreatorDialog} openDialog={() => setShowCreatorDialog(true)} closeDialog={() => setShowCreatorDialog(false)} submit={submit} publish={publishCreator} />}
    {isCatalogue && <AdminSetup agencies={agencies} categories={categories} t={t} submit={submit} load={load} />}
  </main>;
}

function LanguageSwitch({ language, setLanguage, title }: { language: AdminLanguage; setLanguage: (language: AdminLanguage) => void; title: string }) {
  return <label className="language-switch">{title}<select value={language} onChange={(event) => setLanguage(adminLanguage(event.target.value))}><option value="en">English</option><option value="he">?????</option></select></label>;
}

function AdminCatalogue({ creators, agencies, t, showDialog, openDialog, closeDialog, submit, publish }: { creators: AdminCreator[]; agencies: AdminAgency[]; t: typeof adminCopy.en; showDialog: boolean; openDialog: () => void; closeDialog: () => void; submit: AdminSubmit; publish: (id: string) => void }) {
  return <><section className="admin-intro"><h2>{t.creatorCatalogue}</h2><p>{t.catalogueHelp}</p></section><CreatorGrid creators={creators.map((creator) => ({ key: creator._id, name: creator.displayName, bio: creator.bio || "?", status: creator.status === "published" ? t.published : t.draft, to: `/admin/creators/${creator._id}` }))} addCard={<PlusCard label={t.addCreator} onClick={openDialog} />} empty={<article className="creator-card creator-empty-card"><h2>{t.creatorEmpty}</h2></article>} />
    {showDialog && <Dialog title={t.newCreator} close={closeDialog} closeLabel={t.close}><NewCreatorForm agencies={agencies} t={t} submit={submit} closeDialog={closeDialog} /></Dialog>}
    {creators.some((creator) => creator.status !== "published") && <section><h2>{t.draft}</h2>{creators.filter((creator) => creator.status !== "published").map((creator) => <p key={creator._id}>{creator.displayName} <button type="button" onClick={() => void publish(creator._id)}>{t.publish}</button></p>)}</section>}</>;
}

function NewCreatorForm({ agencies, t, submit, closeDialog }: { agencies: AdminAgency[]; t: typeof adminCopy.en; submit: AdminSubmit; closeDialog: () => void }) {
  return <form onSubmit={(event) => void submit(event, "/admin/creators", (data) => ({
    agencyId: data.get("agencyId"),
    displayName: data.get("displayName"),
    slug: data.get("slug"),
    bio: data.get("bio"),
    rightsAttestation: { affirmedBy: data.get("affirmedBy") },
  }), t.creatorCreated).then(closeDialog)}>
    <label>{t.agency}<select name="agencyId" required><option value="">{t.chooseAgency}</option>{agencies.map((a) => <option value={a._id} key={a._id}>{a.name}</option>)}</select></label>
    <label>{t.creatorName}<input name="displayName" required /></label>
    <label>{t.creatorSlug}<input name="slug" pattern="[a-z0-9-]+" placeholder="creator-slug" required /></label>
    <label>{t.creatorBio}<textarea name="bio" /></label>
    <label>{t.approvingAdmin}<input name="affirmedBy" required /></label>
    <button>{t.createCreator}</button>
  </form>;
}

type AdminSubmit = (event: FormEvent<HTMLFormElement>, path: string, build: (data: FormData) => unknown, success?: string, method?: "POST" | "PATCH") => Promise<void>;

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
        <div className="asset-picker-visual"><span aria-hidden="true">?</span></div>
        <strong>{t.noPreviewOption}</strong>
      </button>
      {assets.filter((asset) => asset.purpose === "preview").map((asset) => <button type="button" key={asset._id} className={`asset-picker-card${selectedId === asset._id ? " selected" : ""}`} aria-pressed={selectedId === asset._id} onClick={() => onChange(asset._id)}>
        <div className="asset-picker-visual"><AdminAssetVisual asset={asset} unavailable={t.noPreviewMedia} />{selectedId === asset._id && <span className="asset-check" aria-label={t.selected}>?</span>}</div>
        <strong>{asset.fileName || t.noPreviewMedia}</strong>
        <small>{asset.mimeType.startsWith("video/") ? t.mediaTypeVideo : t.mediaTypeImage}</small>
      </button>)}
    </div>
  </fieldset>;
}

function DeliveryAssetCard({ asset, selected, onToggle, t }: { asset: AdminAsset; selected: boolean; onToggle: () => void; t: typeof adminCopy.en }) {
  return <label className={`delivery-asset-card${selected ? " selected" : ""}`}>
    <input type="checkbox" checked={selected} onChange={onToggle} />
    <div className="delivery-asset-visual"><AdminAssetVisual asset={asset} unavailable={t.noPreviewMedia} />{selected && <span className="asset-check" aria-label={t.selected}>?</span>}</div>
    <div className="delivery-asset-copy"><strong>{asset.fileName || (asset.mimeType.startsWith("video/") ? t.mediaTypeVideo : t.mediaTypeImage)}</strong><small>{asset.mimeType.startsWith("video/") ? t.mediaTypeVideo : t.mediaTypeImage}</small></div>
  </label>;
}

function AdminCreatorContent({ creator, products, assets, categories, t, selectedAssetIds, setSelectedAssetIds, showDialog, openDialog, closeDialog, upload, submit, publish, load }: { creator: AdminCreator; products: AdminProduct[]; assets: AdminAsset[]; categories: AdminCategory[]; t: typeof adminCopy.en; selectedAssetIds: string[]; setSelectedAssetIds: (ids: string[]) => void; showDialog: boolean; openDialog: () => void; closeDialog: () => void; upload: (event: FormEvent<HTMLFormElement>, agencyId?: string) => Promise<void>; submit: AdminSubmit; publish: (id: string) => void; load: () => void }) {
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [previewAssetId, setPreviewAssetId] = useState("");
  const [deliveryPage, setDeliveryPage] = useState(1);
  const openNew = () => { setEditing(null); setSelectedAssetIds([]); setSelectedCategoryIds([]); setPreviewAssetId(""); setDeliveryPage(1); openDialog(); };
  const openEdit = (product: AdminProduct) => { setEditing(product); setSelectedAssetIds(product.mediaAssetIds); setSelectedCategoryIds(product.categoryIds); setPreviewAssetId(product.previewAssetId ?? ""); setDeliveryPage(1); openDialog(); };
  const deliveryAssets = assets.filter((asset) => (asset.purpose ?? "delivery") === "delivery");
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(deliveryAssets.length / pageSize));
  const visibleDeliveryAssets = deliveryAssets.slice((deliveryPage - 1) * pageSize, deliveryPage * pageSize);
  const archive = async (id: string) => { await request(`/admin/products/${id}`, { method: "DELETE" }); load(); };
  const moveAsset = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= selectedAssetIds.length) return;
    const next = [...selectedAssetIds]; [next[index], next[target]] = [next[target], next[index]]; setSelectedAssetIds(next);
  };
  return <><nav><Link to="/admin">? {t.backToCatalogue}</Link></nav><section className="admin-intro"><p className="eyebrow">{t.content}</p><h2>{creator.displayName}</h2><p>{t.contentHelp}</p></section>
    <ContentGrid className="admin-content-grid" items={products} addCard={<PlusCard label={t.addContent} onClick={openNew} />} empty={<p className="empty">{t.contentEmpty}</p>} renderCopy={(product) => <><h2>{product.title}</h2><p>{product.status === "published" ? t.published : t.draft}</p><button type="button" onClick={() => openEdit(product as AdminProduct)}>{t.edit}</button>{product.status !== "published" && <button type="button" onClick={() => void publish(product._id)}>{t.publish}</button>}<button type="button" className="plain-button" onClick={() => void archive(product._id)}>{t.archive}</button></>} />
    {showDialog && <Dialog title={editing ? t.editContent : t.newContent} close={closeDialog} closeLabel={t.close}><form onSubmit={(event) => void submit(event, editing ? `/admin/products/${editing._id}` : "/admin/products", (data) => ({ ...(editing ? {} : { agencyId: creator.agencyId, creatorId: creator._id }), title: data.get("title"), description: data.get("description"), deliveryMessage: data.get("deliveryMessage"), categoryIds: selectedCategoryIds, previewMode: data.get("previewMode"), previewAssetId: data.get("previewMode") === "none" ? null : previewAssetId || undefined, mediaAssetIds: selectedAssetIds, amountMinor: euroToMinor(data.get("price")), currency: "EUR" }), editing ? t.saved : t.productCreated, editing ? "PATCH" : "POST").then(closeDialog)}><label>{t.productTitle}<input name="title" defaultValue={editing?.title} required /></label><label>{t.deliveryMessage}<textarea name="deliveryMessage" defaultValue={editing?.deliveryMessage} maxLength={1000} /></label><label>{t.description}<textarea name="description" defaultValue={editing?.description} /></label><label>{t.price}<input name="price" type="text" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={editing ? (editing.amountMinor / 100).toFixed(2) : ""} required /></label><label>{t.preview}<select name="previewMode" defaultValue={editing?.previewMode ?? "blurred"}><option value="none">{t.noPreviewOption}</option><option value="blurred">{t.blurredPreviewOption}</option><option value="visible">{t.visiblePreviewOption}</option></select></label><AdminAssetPicker assets={assets} selectedId={previewAssetId} onChange={setPreviewAssetId} t={t} /><fieldset><legend>{t.categories}</legend>{categories.filter((category) => category.status === "active").map((category) => <label key={category._id}><input type="checkbox" checked={selectedCategoryIds.includes(category._id)} onChange={(event) => setSelectedCategoryIds(event.target.checked ? [...selectedCategoryIds, category._id] : selectedCategoryIds.filter((id) => id !== category._id))} /> {category.name}</label>)}</fieldset><fieldset><legend>{t.privateFiles}</legend><div className="delivery-asset-grid">{visibleDeliveryAssets.map((asset) => <DeliveryAssetCard key={asset._id} asset={asset} selected={selectedAssetIds.includes(asset._id)} onToggle={() => setSelectedAssetIds(selectedAssetIds.includes(asset._id) ? selectedAssetIds.filter((id) => id !== asset._id) : [...selectedAssetIds, asset._id])} t={t} />)}</div>{!deliveryAssets.length && <p className="help">{t.noMedia}</p>}<div className="asset-pagination"><span>{selectedAssetIds.length} {t.selected}</span><button type="button" className="plain-button" disabled={deliveryPage <= 1} onClick={() => setDeliveryPage((page) => page - 1)}>{t.previousPage}</button><span>{deliveryPage} / {pageCount}</span><button type="button" className="plain-button" disabled={deliveryPage >= pageCount} onClick={() => setDeliveryPage((page) => page + 1)}>{t.nextPage}</button></div></fieldset><button className="dialog-submit" disabled={!selectedAssetIds.length}>{editing ? t.save : t.createProduct}</button></form><section className="upload-panel"><h3>{t.uploadMedia}</h3><form onSubmit={(event) => void upload(event, creator.agencyId)}><label>{t.uploadPurpose}<select name="purpose" defaultValue="delivery"><option value="delivery">{t.deliveryFile}</option><option value="preview">{t.previewFile}</option></select></label><label>{t.chooseFile}<input name="file" type="file" accept="image/*,video/*,audio/*,application/*" required /></label><button>{t.upload}</button></form><p className="help">{t.uploadHelp}</p></section></Dialog>}</>;
}

function AdminSetup({ agencies, categories, t, submit, load }: { agencies: AdminAgency[]; categories: AdminCategory[]; t: typeof adminCopy.en; submit: AdminSubmit; load: () => void }) {
  const archiveCategory = async (id: string) => { await request(`/admin/categories/${id}`, { method: "DELETE" }); load(); };
  return <section id="setup" className="setup-panel"><h2>{t.setup}</h2><p className="help">{t.setupEmpty}</p><article className="warning"><h3>{t.attributionTitle}</h3><p>{t.attributionHelp}</p><p>{t.secretWarning}</p></article><div className="setup-grid"><section><h3>{t.agency}</h3><form onSubmit={(event) => void submit(event, "/admin/agencies", (data) => ({ name: data.get("name") }))}><label>{t.agencyName}<input name="name" required /></label><button>{t.createAgency}</button></form>{agencies.length ? agencies.map((agency) => <p key={agency._id}>{agency.name}</p>) : <p className="empty">{t.agencyEmpty}</p>}</section><section><h3>{t.categories}</h3><form onSubmit={(event) => void submit(event, "/admin/categories", (data) => ({ agencyId: data.get("agencyId"), name: data.get("name"), slug: data.get("slug") }))}><label>{t.agency}<select name="agencyId" required><option value="">{t.chooseAgency}</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select></label><label>{t.categoryName}<input name="name" required /></label><label>{t.categorySlug}<input name="slug" pattern="[a-z0-9-]+" required /></label><button>{t.createCategory}</button></form>{categories.map((category) => <p key={category._id}>{category.name} ({category.status}) {category.status === "active" && <button type="button" className="plain-button" onClick={() => void archiveCategory(category._id)}>{t.archive}</button>}</p>)}</section></div></section>;
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
  return <CustomerShell locale={locale} setLocale={setLocale} cartCount={cartCount}><Routes><Route path="/" element={<Catalog t={t} />} /><Route path="/guide" element={<Guide t={t} browser={browser} />} /><Route path="/creators/:slug" element={<CreatorPage t={t} locale={locale} onCartChange={refreshCartCount} />} /><Route path="/cart" element={<CartPage t={t} locale={locale} browser={browser} onCartChange={refreshCartCount} />} /><Route path="/library" element={<Library t={t} browser={browser} />} /><Route path="/payment-complete" element={<PaymentComplete t={t} browser={browser} />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></CustomerShell>;
}

export function App() {
  return <Routes>
    <Route path="/admin" element={<Admin />} />
    <Route path="/admin/creators/:creatorId" element={<Admin />} />
    <Route path="/admin/orders" element={<Admin />} />
    <Route path="/admin/revenue" element={<Admin />} />
    <Route path="*" element={<Marketplace />} />
  </Routes>;
}
