import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { clearToken, Creator, euroToMinor, money, Product, request, setToken } from "./api";
import { adminCopy, adminDirection, adminLanguage, type AdminLanguage } from "./admin-i18n";
import { customerCopy, customerDirection, customerLocale, customerLocales, type CustomerLocale } from "./customer-i18n";

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; ready(): void; expand(): void; openLink(url: string): void; close(): void; viewportStableHeight?: number } };
  }
}

type AdminAgency = { _id: string; name: string };
type AdminAgent = { _id: string; agencyId: string; name: string };
type AdminCreator = { _id: string; agencyId: string; displayName: string; slug: string; bio: string; status: string };
type AdminAsset = { _id: string; agencyId: string; fileName: string; status: string; purpose?: "delivery" | "preview" };
type AdminCategory = { _id: string; agencyId: string; name: string; slug: string; status: string };
type AdminProduct = {
  _id: string; agencyId: string; creatorId: string; title: string; slug: string; description: string; status: string;
  amountMinor: number; currency: "EUR"; categoryIds: string[]; previewAssetId?: string; previewMode: "none" | "blurred" | "visible"; mediaAssetIds: string[];
};

function CreatorGrid({ creators, empty, addCard }: { creators: { key: string; name: string; bio: string; to?: string; status?: string }[]; empty?: ReactNode; addCard?: ReactNode }) {
  return <section className="creator-grid">
    {creators.map((creator) => creator.to
      ? <Link className="creator-card" key={creator.key} to={creator.to}><CreatorCard creator={creator} /></Link>
      : <article className="creator-card" key={creator.key}><CreatorCard creator={creator} /></article>)}
    {addCard}
    {!creators.length && empty}
  </section>;
}

function CreatorCard({ creator }: { creator: { name: string; bio: string; status?: string } }) {
  return <><div className="creator-cover"><span>{creator.status ?? "18+"}</span></div><h2>{creator.name}</h2><p>{creator.bio}</p>{creator.status && <strong>{creator.status}</strong>}</>;
}

function PlusCard({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="plus-card" onClick={onClick}><span>+</span>{label}</button>;
}

function useTelegramSession() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [locale, setLocale] = useState<CustomerLocale>("en");
  useEffect(() => {
    clearToken();
    const webApp = window.Telegram?.WebApp;
    webApp?.ready(); webApp?.expand();
    document.documentElement.style.setProperty("--customer-viewport-height", `${webApp?.viewportStableHeight ?? window.innerHeight}px`);
    const initData = webApp?.initData;
    if (!initData) {
      setError(true);
      return;
    }
    let active = true;
    request<{ token: string; locale: CustomerLocale }>("/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) })
      .then(({ token, locale: nextLocale }) => { if (active) { setToken(token); setLocale(customerLocale(nextLocale)); setReady(true); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return { ready, error, locale, setLocale };
}

type CustomerText = typeof customerCopy.en;

function CustomerShell({ locale, setLocale, children }: { locale: CustomerLocale; setLocale: (locale: CustomerLocale) => void; children: ReactNode }) {
  const t = customerCopy[locale];
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
    <header className="customer-header"><span className="customer-brand">{t.privateMarketplace}</span><label className="customer-language"><span className="sr-only">{t.language}</span><select aria-label={t.language} value={locale} onChange={(event) => void overrideLocale(event.target.value)}>{customerLocales.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></header>
    {children}
    <nav className="customer-nav" aria-label={t.privateMarketplace}><Link to="/">{t.discover}</Link><Link to="/guide">{t.guide}</Link><Link to="/cart">{t.cart}</Link><Link to="/library">{t.purchases}</Link></nav>
  </div>;
}

function Catalog({ t }: { t: CustomerText }) {
  const [creators, setCreators] = useState<Creator[]>([]);
  useEffect(() => { void request<{ items: Creator[] }>("/catalog/creators").then((result) => setCreators(result.items)); }, []);
  return <main className="customer-main">
    <p className="eyebrow">{t.privateMarketplace}</p><h1>{t.discoverTitle}</h1>
    <p className="notice">{t.adultNotice}</p>
    <Link className="customer-guide-link" to="/guide">{t.guideLink}</Link>
    <CreatorGrid creators={creators.map((creator) => ({ key: creator._id, name: creator.displayName, bio: creator.bio || t.defaultBio, to: `/creators/${creator.slug}` }))} empty={<article className="creator-card creator-empty-card"><div className="creator-cover"><span>18+</span></div><h2>{t.emptyCatalogTitle}</h2><p>{t.emptyCatalogText}</p></article>} />
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
function ContentGrid({ items, add, empty, renderCopy, addCard, className = "", t, locale }: { items: GridContentItem[]; add?: (id: string) => void; empty: ReactNode; renderCopy?: (item: GridContentItem) => ReactNode; addCard?: ReactNode; className?: string; t?: CustomerText; locale?: CustomerLocale }) {
  return <section className={`reel-grid ${className}`}>{items.map((item) => <article className="reel-card" key={item._id}>
    <div className={`reel-preview preview-${item.previewMode ?? "blurred"}`}>{item.preview?.mimeType.startsWith("video/") ? <video src={item.preview.url} muted loop autoPlay playsInline preload="metadata" /> : item.preview ? <img src={item.preview.url} alt="" /> : <div className="preview-unavailable">{t?.previewUnavailable ?? "Preview unavailable"}</div>}{item.previewMode === "blurred" && <span className="blur-label">{t?.blurredPreview ?? "BLURRED PREVIEW"}</span>}</div>
    <div className="reel-copy">{renderCopy ? renderCopy(item) : <><h2>{item.title}</h2><p>{item.description}</p><strong className="ltr-value" dir="ltr">{money(item.amountMinor!, item.currency!, locale)}</strong><button onClick={() => add?.(item._id)}>{t?.addToCart ?? "Add to cart"}</button></>}</div>
  </article>)}{addCard}{!items.length && empty}</section>;
}

function CreatorPage({ t, locale }: { t: CustomerText; locale: CustomerLocale }) {
  const { slug } = useParams();
  const [items, setItems] = useState<Product[]>([]);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { void request<{ creator: Creator; items: Product[] }>(`/catalog/creators/${slug}/products`).then((result) => { setCreator(result.creator); setItems(result.items); }).catch(() => setNotice(t.creatorUnavailable)); }, [slug, t.creatorUnavailable]);
  const add = async (productId: string) => {
    try { await request("/cart/items", { method: "POST", body: JSON.stringify({ productId }) }); setNotice(t.addedToCart); }
    catch { setNotice(t.cartUpdateFailed); }
  };
  return <main className="customer-main">
    <Link className="back-link" to="/">{t.backDiscover}</Link>
    <p className="eyebrow">{t.creatorStorefront}</p><h1>{creator?.displayName ?? t.discover}</h1><p>{creator?.bio}</p>
    {notice && <p role="status" className="notice">{notice}</p>}
    <ContentGrid items={items} add={add} t={t} locale={locale} empty={<p className="empty">{t.noContent}</p>} />
  </main>;
}

type Cart = { _id?: string; currency: string; items: { productId: string; titleSnapshot: string; creatorNameSnapshot: string; priceMinorSnapshot: number }[] };
function CartPage({ t, locale }: { t: CustomerText; locale: CustomerLocale }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const navigate = useNavigate();
  const load = () => void request<Cart>("/cart").then(setCart);
  useEffect(load, []);
  const remove = async (productId: string) => { await request(`/cart/items/${productId}`, { method: "DELETE" }); load(); };
  const checkout = async () => {
    try {
      await request("/me/age-confirmation", { method: "POST", body: JSON.stringify({ accepted: true, version: "2026-09" }) });
      const result = await request<{ checkoutUrl: string }>("/checkout", { method: "POST" });
      if (window.Telegram?.WebApp) window.Telegram.WebApp.openLink(result.checkoutUrl); else window.location.assign(result.checkoutUrl);
    } catch { alert(t.checkoutUnavailable); }
  };
  const total = cart?.items.reduce((sum, item) => sum + item.priceMinorSnapshot, 0) ?? 0;
  return <main className="customer-main"><h1>{t.cartTitle}</h1>{cart?.items.map((item) => <article className="cart-item" key={item.productId}><h2>{item.titleSnapshot}</h2><p>{item.creatorNameSnapshot} · <span className="ltr-value" dir="ltr">{money(item.priceMinorSnapshot, cart.currency, locale)}</span></p><button onClick={() => void remove(item.productId)}>{t.remove}</button></article>)}{cart && !cart.items.length && <p className="empty">{t.emptyCart}</p>}<section className="cart-summary"><h2>{t.total}: <span className="ltr-value" dir="ltr">{money(total, cart?.currency ?? "EUR", locale)}</span></h2><p>{t.adultCheckout}</p><button disabled={!total} onClick={() => void checkout()}>{t.secureCheckout}</button><button className="plain-button" onClick={() => navigate("/")}>{t.continueBrowsing}</button></section></main>;
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

function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button type="button" className="plain-button" onClick={close} aria-label="Close">×</button></div>{children}</section></div>;
}

function Admin() {
  const navigate = useNavigate();
  const { creatorId } = useParams();
  const [language, setLanguage] = useState<AdminLanguage>(() => adminLanguage(localStorage.getItem("marketplace_admin_language")));
  const [token, setAdminToken] = useState(sessionStorage.getItem("marketplace_admin_token") ?? "");
  const [agencies, setAgencies] = useState<AdminAgency[]>([]);
  const [agents, setAgents] = useState<AdminAgent[]>([]);
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
    request<{ items: AdminAgency[] }>("/admin/agencies"), request<{ items: AdminAgent[] }>("/admin/agents"),
    request<{ items: AdminCreator[] }>("/admin/creators"), request<{ items: AdminAsset[] }>("/admin/assets"),
    request<{ items: AdminProduct[] }>("/admin/products"), request<{ items: AdminCategory[] }>("/admin/categories"),
  ]).then(([agencyResult, agentResult, creatorResult, assetResult, productResult, categoryResult]) => {
    setAgencies(agencyResult.items); setAgents(agentResult.items); setCreators(creatorResult.items); setAssets(assetResult.items); setProducts(productResult.items); setCategories(categoryResult.items);
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
  const setDefaultAgent = async (agent: AdminAgent) => { try { await request(`/admin/agencies/${agent.agencyId}`, { method: "PATCH", body: JSON.stringify({ defaultAgentId: agent._id }) }); setNotice(t.checkoutAgentSet.replace("{name}", agent.name)); } catch (error) { setNotice(message(error, t.saveFailed)); } };
  const signOut = () => { sessionStorage.removeItem("marketplace_admin_token"); clearToken(); setAdminToken(""); navigate("/admin"); };

  if (!token) return <main className="admin" lang={language} dir={direction}><LanguageSwitch language={language} setLanguage={setLanguage} title={t.language} /><h1>{t.signIn}</h1>{notice && <p role="alert" className="notice">{notice}</p>}<form onSubmit={(event) => void login(event)}><label>{t.password}<input name="password" type="password" placeholder={t.password} autoComplete="current-password" required /></label><button>{t.signIn}</button></form></main>;

  const currentAssets = selectedCreator ? assets.filter((asset) => asset.agencyId === selectedCreator.agencyId && asset.status === "ready") : [];
  const currentProducts = selectedCreator ? products.filter((product) => product.creatorId === selectedCreator._id) : [];
  return <main className="admin" lang={language} dir={direction}>
    <header className="admin-header"><div><p className="eyebrow">PRIVATE CREATOR MARKETPLACE</p><h1>{t.adminTitle}</h1></div><LanguageSwitch language={language} setLanguage={setLanguage} title={t.language} /></header>
    <nav className="admin-nav"><Link to="/admin">{t.catalogue}</Link><a href="#setup">{t.setup}</a><button type="button" className="plain-button" onClick={signOut}>{t.signOut}</button></nav>
    {notice && <p role="status" className="notice">{notice}</p>}
    {creatorId ? selectedCreator ? <AdminCreatorContent creator={selectedCreator} products={currentProducts} assets={currentAssets} categories={categories.filter((category) => category.agencyId === selectedCreator.agencyId)} t={t} selectedAssetIds={selectedAssetIds} setSelectedAssetIds={setSelectedAssetIds} showDialog={showContentDialog} openDialog={() => setShowContentDialog(true)} closeDialog={() => setShowContentDialog(false)} upload={upload} submit={submit} publish={publishProduct} load={load} /> : <p className="empty">{t.loading}</p> : <AdminCatalogue creators={creators} t={t} showDialog={showCreatorDialog} openDialog={() => setShowCreatorDialog(true)} closeDialog={() => setShowCreatorDialog(false)} agencies={agencies} submit={submit} publish={publishCreator} />}
    {!creatorId && <AdminSetup agencies={agencies} agents={agents} categories={categories} t={t} submit={submit} setDefaultAgent={setDefaultAgent} load={load} />}
  </main>;
}

function LanguageSwitch({ language, setLanguage, title }: { language: AdminLanguage; setLanguage: (language: AdminLanguage) => void; title: string }) {
  return <label className="language-switch">{title}<select value={language} onChange={(event) => setLanguage(adminLanguage(event.target.value))}><option value="en">English</option><option value="he">עברית</option></select></label>;
}

function AdminCatalogue({ creators, agencies, t, showDialog, openDialog, closeDialog, submit, publish }: { creators: AdminCreator[]; agencies: AdminAgency[]; t: typeof adminCopy.en; showDialog: boolean; openDialog: () => void; closeDialog: () => void; submit: AdminSubmit; publish: (id: string) => void }) {
  return <><section className="admin-intro"><h2>{t.creatorCatalogue}</h2><p>{t.catalogueHelp}</p></section><CreatorGrid creators={creators.map((creator) => ({ key: creator._id, name: creator.displayName, bio: creator.bio || "—", status: creator.status === "published" ? t.published : t.draft, to: `/admin/creators/${creator._id}` }))} addCard={<PlusCard label={t.addCreator} onClick={openDialog} />} empty={<article className="creator-card creator-empty-card"><h2>{t.creatorEmpty}</h2></article>} />
    {showDialog && <Dialog title={t.newCreator} close={closeDialog}><form onSubmit={(event) => void submit(event, "/admin/creators", (data) => ({ agencyId: data.get("agencyId"), displayName: data.get("displayName"), slug: data.get("slug"), bio: data.get("bio"), rightsAttestation: { affirmedBy: data.get("affirmedBy"), statementVersion: "2026-09", creatorIsAdult: true, distributionAuthorized: true } }), t.creatorCreated).then(closeDialog)}><label>{t.agency}<select name="agencyId" required><option value="">{t.chooseAgency}</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select></label><label>{t.creatorName}<input name="displayName" required /></label><label>{t.creatorSlug}<input name="slug" pattern="[a-z0-9-]+" placeholder="creator-slug" required /></label><label>{t.creatorBio}<textarea name="bio" /></label><label>{t.approvingAdmin}<input name="affirmedBy" required /></label><p className="help">{t.rightsHelp}</p><button>{t.createCreator}</button></form></Dialog>}
    {creators.some((creator) => creator.status !== "published") && <section><h2>{t.draft}</h2>{creators.filter((creator) => creator.status !== "published").map((creator) => <p key={creator._id}>{creator.displayName} <button type="button" onClick={() => void publish(creator._id)}>{t.publish}</button></p>)}</section>}</>;
}

type AdminSubmit = (event: FormEvent<HTMLFormElement>, path: string, build: (data: FormData) => unknown, success?: string, method?: "POST" | "PATCH") => Promise<void>;
function AdminCreatorContent({ creator, products, assets, categories, t, selectedAssetIds, setSelectedAssetIds, showDialog, openDialog, closeDialog, upload, submit, publish, load }: { creator: AdminCreator; products: AdminProduct[]; assets: AdminAsset[]; categories: AdminCategory[]; t: typeof adminCopy.en; selectedAssetIds: string[]; setSelectedAssetIds: (ids: string[]) => void; showDialog: boolean; openDialog: () => void; closeDialog: () => void; upload: (event: FormEvent<HTMLFormElement>, agencyId?: string) => Promise<void>; submit: AdminSubmit; publish: (id: string) => void; load: () => void }) {
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const openNew = () => { setEditing(null); setSelectedAssetIds([]); setSelectedCategoryIds([]); openDialog(); };
  const openEdit = (product: AdminProduct) => { setEditing(product); setSelectedAssetIds(product.mediaAssetIds); setSelectedCategoryIds(product.categoryIds); openDialog(); };
  const archive = async (id: string) => { await request(`/admin/products/${id}`, { method: "DELETE" }); load(); };
  const moveAsset = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= selectedAssetIds.length) return;
    const next = [...selectedAssetIds]; [next[index], next[target]] = [next[target], next[index]]; setSelectedAssetIds(next);
  };
  return <><nav><Link to="/admin">← {t.backToCatalogue}</Link></nav><section className="admin-intro"><p className="eyebrow">{t.content}</p><h2>{creator.displayName}</h2><p>{t.contentHelp}</p></section>
    <ContentGrid className="admin-content-grid" items={products} addCard={<PlusCard label={t.addContent} onClick={openNew} />} empty={<p className="empty">{t.contentEmpty}</p>} renderCopy={(product) => <><h2>{product.title}</h2><p>{product.status === "published" ? t.published : t.draft}</p><button type="button" onClick={() => openEdit(product as AdminProduct)}>Edit</button>{product.status !== "published" && <button type="button" onClick={() => void publish(product._id)}>{t.publish}</button>}<button type="button" className="plain-button" onClick={() => void archive(product._id)}>Archive</button></>} />
    {showDialog && <Dialog title={editing ? "Edit content" : t.newContent} close={closeDialog}><form onSubmit={(event) => void submit(event, editing ? `/admin/products/${editing._id}` : "/admin/products", (data) => ({ ...(editing ? {} : { agencyId: creator.agencyId, creatorId: creator._id }), title: data.get("title"), slug: data.get("slug"), description: data.get("description"), categoryIds: selectedCategoryIds, previewMode: data.get("previewMode"), previewAssetId: data.get("previewMode") === "none" ? null : data.get("previewAssetId") || undefined, mediaAssetIds: selectedAssetIds, amountMinor: euroToMinor(data.get("price")), currency: "EUR" }), editing ? t.saved : t.productCreated, editing ? "PATCH" : "POST").then(closeDialog)}><label>{t.productTitle}<input name="title" defaultValue={editing?.title} required /></label><label>{t.productSlug}<input name="slug" pattern="[a-z0-9-]+" placeholder="product-slug" defaultValue={editing?.slug} required /></label><label>{t.description}<textarea name="description" defaultValue={editing?.description} /></label><label>{t.price}<input name="price" type="text" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={editing ? (editing.amountMinor / 100).toFixed(2) : ""} required /></label><label>{t.preview}<select name="previewMode" defaultValue={editing?.previewMode ?? "blurred"}><option value="none">No preview</option><option value="blurred">Blurred preview</option><option value="visible">Visible preview</option></select></label><label>{t.preview}<select name="previewAssetId" defaultValue={editing?.previewAssetId ?? ""}><option value="">{t.noPreview}</option>{assets.filter((asset) => asset.purpose === "preview").map((asset) => <option key={asset._id} value={asset._id}>{asset.fileName}</option>)}</select></label><fieldset><legend>Categories</legend>{categories.filter((category) => category.status === "active").map((category) => <label key={category._id}><input type="checkbox" checked={selectedCategoryIds.includes(category._id)} onChange={(event) => setSelectedCategoryIds(event.target.checked ? [...selectedCategoryIds, category._id] : selectedCategoryIds.filter((id) => id !== category._id))} /> {category.name}</label>)}</fieldset><fieldset><legend>{t.privateFiles} (delivery order)</legend>{assets.filter((asset) => (asset.purpose ?? "delivery") === "delivery").map((asset) => <label key={asset._id}><input type="checkbox" checked={selectedAssetIds.includes(asset._id)} onChange={(event) => setSelectedAssetIds(event.target.checked ? [...selectedAssetIds, asset._id] : selectedAssetIds.filter((id) => id !== asset._id))} /> {asset.fileName}{selectedAssetIds.includes(asset._id) && <span><button type="button" className="plain-button" onClick={() => moveAsset(selectedAssetIds.indexOf(asset._id), -1)}>↑</button><button type="button" className="plain-button" onClick={() => moveAsset(selectedAssetIds.indexOf(asset._id), 1)}>↓</button></span>}</label>)}{!assets.length && <p className="help">{t.noMedia}</p>}</fieldset><button disabled={!selectedAssetIds.length}>{editing ? t.save : t.createProduct}</button></form><section className="upload-panel"><h3>{t.uploadMedia}</h3><form onSubmit={(event) => void upload(event, creator.agencyId)}><label>{t.uploadPurpose}<select name="purpose" defaultValue="delivery"><option value="delivery">{t.deliveryFile}</option><option value="preview">{t.previewFile}</option></select></label><label>{t.chooseFile}<input name="file" type="file" accept="image/*,video/*,audio/*,application/*" required /></label><button>{t.upload}</button></form><p className="help">{t.uploadHelp}</p></section></Dialog>}</>;
}

function AdminSetup({ agencies, agents, categories, t, submit, setDefaultAgent, load }: { agencies: AdminAgency[]; agents: AdminAgent[]; categories: AdminCategory[]; t: typeof adminCopy.en; submit: AdminSubmit; setDefaultAgent: (agent: AdminAgent) => void; load: () => void }) {
  const archiveCategory = async (id: string) => { await request(`/admin/categories/${id}`, { method: "DELETE" }); load(); };
  return <section id="setup" className="setup-panel"><h2>{t.setup}</h2><p className="help">{t.setupEmpty}</p><article className="warning"><h3>{t.attributionTitle}</h3><p>{t.attributionHelp}</p><p>{t.secretWarning}</p></article><div className="setup-grid"><section><h3>{t.agency}</h3><form onSubmit={(event) => void submit(event, "/admin/agencies", (data) => ({ name: data.get("name"), higherPaysWorkspaceId: data.get("workspace") }))}><label>{t.agencyName}<input name="name" required /></label><label>{t.workspaceId}<input name="workspace" required /></label><p className="help">{t.workspaceHelp}</p><button>{t.createAgency}</button></form>{agencies.length ? agencies.map((agency) => <p key={agency._id}>{agency.name}</p>) : <p className="empty">{t.agencyEmpty}</p>}</section><section><h3>{t.agent}</h3><form onSubmit={(event) => void submit(event, "/admin/agents", (data) => ({ agencyId: data.get("agencyId"), name: data.get("name"), higherPaysAgentId: data.get("higherPaysAgentId") }))}><label>{t.agency}<select name="agencyId" required><option value="">{t.chooseAgency}</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select></label><label>{t.agentName}<input name="name" required /></label><label>{t.agentId}<input name="higherPaysAgentId" required /></label><p className="help">{t.agentHelp}</p><button>{t.createAgent}</button></form>{agents.length ? agents.map((agent) => <p key={agent._id}>{agent.name} <button type="button" onClick={() => void setDefaultAgent(agent)}>{t.setCheckoutAgent}</button></p>) : <p className="empty">{t.agentEmpty}</p>}</section><section><h3>Categories</h3><form onSubmit={(event) => void submit(event, "/admin/categories", (data) => ({ agencyId: data.get("agencyId"), name: data.get("name"), slug: data.get("slug") }))}><label>{t.agency}<select name="agencyId" required><option value="">{t.chooseAgency}</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select></label><label>Name<input name="name" required /></label><label>Slug<input name="slug" pattern="[a-z0-9-]+" required /></label><button>Create category</button></form>{categories.map((category) => <p key={category._id}>{category.name} ({category.status}) {category.status === "active" && <button type="button" className="plain-button" onClick={() => void archiveCategory(category._id)}>Archive</button>}</p>)}</section></div></section>;
}

function AgeGate({ children, t }: { children: ReactNode; t: CustomerText }) {
  const [accepted, setAccepted] = useState(sessionStorage.getItem("marketplace_age_confirmed") === "yes");
  const [error, setError] = useState("");
  const confirm = async () => {
    try { await request("/me/age-confirmation", { method: "POST", body: JSON.stringify({ accepted: true, version: "2026-09" }) }); sessionStorage.setItem("marketplace_age_confirmed", "yes"); setAccepted(true); }
    catch { setError(t.ageError); }
  };
  if (accepted) return <>{children}</>;
  return <main className="age-gate customer-main"><p className="eyebrow">{t.privateMarketplace}</p><h1>{t.adultsOnly}</h1><p>{t.ageText}</p>{error && <p role="alert" className="notice">{error}</p>}<button onClick={() => void confirm()}>{t.ageConfirm}</button><p className="fine-print">{t.privacy}</p></main>;
}

function Marketplace() {
  const { ready, error, locale, setLocale } = useTelegramSession();
  const t = customerCopy[locale];
  if (error) return <main className="customer-main"><h1>{t.privateMarketplace}</h1><p>{t.sessionError}</p></main>;
  if (!ready) return <main className="customer-main"><h1>{t.privateMarketplace}</h1><p>{t.sessionVerifying}</p></main>;
  return <CustomerShell locale={locale} setLocale={setLocale}><AgeGate t={t}><Routes><Route path="/" element={<Catalog t={t} />} /><Route path="/guide" element={<Guide t={t} />} /><Route path="/creators/:slug" element={<CreatorPage t={t} locale={locale} />} /><Route path="/cart" element={<CartPage t={t} locale={locale} />} /><Route path="/library" element={<Library t={t} />} /><Route path="/payment-complete" element={<PaymentComplete t={t} />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></AgeGate></CustomerShell>;
}

export function App() {
  return <Routes><Route path="/admin" element={<Admin />} /><Route path="/admin/creators/:creatorId" element={<Admin />} /><Route path="*" element={<Marketplace />} /></Routes>;
}
