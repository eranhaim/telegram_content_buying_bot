import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { clearToken, Creator, money, Product, request, setToken } from "./api";
import { adminCopy, adminDirection, adminLanguage, type AdminLanguage } from "./admin-i18n";

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; ready(): void; expand(): void; openLink(url: string): void; close(): void } };
  }
}

type AdminAgency = { _id: string; name: string };
type AdminAgent = { _id: string; agencyId: string; name: string };
type AdminCreator = { _id: string; agencyId: string; displayName: string; slug: string; bio: string; status: string };
type AdminAsset = { _id: string; agencyId: string; fileName: string; status: string; purpose?: "delivery" | "preview" };
type AdminProduct = { _id: string; agencyId: string; creatorId: string; title: string; status: string };

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
  const [error, setError] = useState("");
  useEffect(() => {
    clearToken();
    const webApp = window.Telegram?.WebApp;
    webApp?.ready(); webApp?.expand();
    const initData = webApp?.initData;
    if (!initData) {
      setError("Open the catalog using the Open catalog button in @OnlyContentMenuBot. Direct links do not include your Telegram identity.");
      return;
    }
    let active = true;
    request<{ token: string }>("/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) })
      .then(({ token }) => { if (active) { setToken(token); setReady(true); } })
      .catch(() => { if (active) setError("Telegram could not verify this Mini App session. Close this page and reopen the catalog from @OnlyContentMenuBot."); });
    return () => { active = false; };
  }, []);
  return { ready, error };
}

function Catalog() {
  const [creators, setCreators] = useState<Creator[]>([]);
  useEffect(() => { void request<{ items: Creator[] }>("/catalog/creators").then((result) => setCreators(result.items)); }, []);
  return <main>
    <nav><Link to="/">Discover</Link><Link to="/cart">Cart</Link><Link to="/library">Purchases</Link></nav>
    <p className="eyebrow">PRIVATE CREATOR MARKETPLACE</p><h1>Discover creators</h1>
    <p className="notice">18+ only. Preview clips are deliberately blurred. Purchased content is delivered privately in this Telegram chat after payment.</p>
    <CreatorGrid creators={creators.map((creator) => ({ key: creator._id, name: creator.displayName, bio: creator.bio || "Explore this creator’s private collection.", to: `/creators/${creator.slug}` }))} empty={<article className="creator-card creator-empty-card"><div className="creator-cover"><span>CATALOG</span></div><h2>New creators coming soon</h2><p>The private catalog is ready. Check back for new verified creator storefronts.</p></article>} />
  </main>;
}

type GridContentItem = { _id: string; title: string; preview?: Product["preview"]; description?: string; amountMinor?: number; currency?: string; status?: string };
function ContentGrid({ items, add, empty, renderCopy, addCard, className = "" }: { items: GridContentItem[]; add?: (id: string) => void; empty: ReactNode; renderCopy?: (item: GridContentItem) => ReactNode; addCard?: ReactNode; className?: string }) {
  return <section className={`reel-grid ${className}`}>{items.map((item) => <article className="reel-card" key={item._id}>
    <div className="reel-preview">{item.preview?.mimeType.startsWith("video/") ? <video src={item.preview.url} muted loop autoPlay playsInline preload="metadata" /> : item.preview ? <img src={item.preview.url} alt="" /> : <div className="preview-unavailable">Preview unavailable</div>}<span className="blur-label">BLURRED PREVIEW</span></div>
    <div className="reel-copy">{renderCopy ? renderCopy(item) : <><h2>{item.title}</h2><p>{item.description}</p><strong>{money(item.amountMinor!, item.currency!)}</strong><button onClick={() => add?.(item._id)}>Add to cart</button></>}</div>
  </article>)}{addCard}{!items.length && empty}</section>;
}

function CreatorPage() {
  const { slug } = useParams();
  const [items, setItems] = useState<Product[]>([]);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { void request<{ creator: Creator; items: Product[] }>(`/catalog/creators/${slug}/products`).then((result) => { setCreator(result.creator); setItems(result.items); }).catch(() => setNotice("This creator is unavailable right now.")); }, [slug]);
  const add = async (productId: string) => {
    try { await request("/cart/items", { method: "POST", body: JSON.stringify({ productId }) }); setNotice("Added to cart."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not update your cart."); }
  };
  return <main>
    <nav><Link to="/">← Discover</Link><Link to="/cart">Cart</Link></nav>
    <p className="eyebrow">CREATOR STOREFRONT</p><h1>{creator?.displayName ?? "Creator"}</h1><p>{creator?.bio}</p>
    {notice && <p role="status" className="notice">{notice}</p>}
    <ContentGrid items={items} add={add} empty={<p className="empty">No content is available from this creator yet.</p>} />
  </main>;
}

type Cart = { _id?: string; currency: string; items: { productId: string; titleSnapshot: string; creatorNameSnapshot: string; priceMinorSnapshot: number }[] };
function CartPage() {
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
    } catch (error) { alert(error instanceof Error ? error.message : "Checkout unavailable"); }
  };
  const total = cart?.items.reduce((sum, item) => sum + item.priceMinorSnapshot, 0) ?? 0;
  return <main><nav><Link to="/">Catalog</Link><Link to="/library">Purchases</Link></nav><h1>Your cart</h1>{cart?.items.map((item) => <article key={item.productId}><h2>{item.titleSnapshot}</h2><p>{item.creatorNameSnapshot} · {money(item.priceMinorSnapshot, cart.currency)}</p><button onClick={() => void remove(item.productId)}>Remove</button></article>)}<h2>Total: {money(total, cart?.currency ?? "EUR")}</h2><p>By checking out you confirm that you are legally an adult in your jurisdiction.</p><button disabled={!total} onClick={() => void checkout()}>Continue to secure checkout</button><button onClick={() => navigate("/")}>Continue browsing</button></main>;
}

function Library() {
  const [orders, setOrders] = useState<{ publicId: string; fulfillmentStatus: string; lines: { productTitle: string }[] }[]>([]);
  useEffect(() => { void request<{ items: typeof orders }>("/purchases").then((result) => setOrders(result.items)); }, []);
  return <main><nav><Link to="/">Catalog</Link><Link to="/cart">Cart</Link></nav><h1>Your purchases</h1>{orders.map((order) => <article key={order.publicId}><h2>{order.lines.map((line) => line.productTitle).join(", ")}</h2><p>Delivery: {order.fulfillmentStatus}</p><button onClick={() => void request(`/purchases/${order.publicId}/retry-delivery`, { method: "POST" })}>Retry delivery</button></article>)}</main>;
}

function PaymentComplete() {
  const params = new URLSearchParams(location.search);
  const [status, setStatus] = useState("Checking your payment…");
  useEffect(() => {
    const order = params.get("order"); const state = params.get("state");
    if (!order || !state) return;
    const check = () => void request<{ paymentStatus: string }>(`/payment-return/${order}?state=${encodeURIComponent(state)}`).then((result) => setStatus(result.paymentStatus === "paid" ? "Payment confirmed. Your content is being delivered in Telegram." : "Payment is still processing.")).catch(() => setStatus("Return to Telegram and check Purchases shortly."));
    check(); const timer = setInterval(check, 5000); return () => clearInterval(timer);
  }, []);
  return <main><h1>{status}</h1><Link to="/library">Open purchases</Link></main>;
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
    request<{ items: AdminProduct[] }>("/admin/products"),
  ]).then(([agencyResult, agentResult, creatorResult, assetResult, productResult]) => {
    setAgencies(agencyResult.items); setAgents(agentResult.items); setCreators(creatorResult.items); setAssets(assetResult.items); setProducts(productResult.items);
  }).catch((error) => setNotice(message(error)));
  useEffect(() => { if (token) { setToken(token); load(); } }, [token]);
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await request<{ token: string }>("/auth/admin", { method: "POST", body: JSON.stringify({ password: new FormData(event.currentTarget).get("password") }) });
      sessionStorage.setItem("marketplace_admin_token", result.token); setToken(result.token); setAdminToken(result.token);
    } catch (error) { setNotice(message(error, t.signInFailed)); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>, path: string, build: (data: FormData) => unknown, success = t.saved) => {
    event.preventDefault();
    try { await request(path, { method: "POST", body: JSON.stringify(build(new FormData(event.currentTarget))) }); event.currentTarget.reset(); setNotice(success); load(); }
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
    {creatorId ? selectedCreator ? <AdminCreatorContent creator={selectedCreator} products={currentProducts} assets={currentAssets} t={t} selectedAssetIds={selectedAssetIds} setSelectedAssetIds={setSelectedAssetIds} showDialog={showContentDialog} openDialog={() => setShowContentDialog(true)} closeDialog={() => setShowContentDialog(false)} upload={upload} submit={submit} publish={publishProduct} /> : <p className="empty">{t.loading}</p> : <AdminCatalogue creators={creators} t={t} showDialog={showCreatorDialog} openDialog={() => setShowCreatorDialog(true)} closeDialog={() => setShowCreatorDialog(false)} agencies={agencies} submit={submit} publish={publishCreator} />}
    {!creatorId && <AdminSetup agencies={agencies} agents={agents} t={t} submit={submit} setDefaultAgent={setDefaultAgent} />}
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

type AdminSubmit = (event: FormEvent<HTMLFormElement>, path: string, build: (data: FormData) => unknown, success?: string) => Promise<void>;
function AdminCreatorContent({ creator, products, assets, t, selectedAssetIds, setSelectedAssetIds, showDialog, openDialog, closeDialog, upload, submit, publish }: { creator: AdminCreator; products: AdminProduct[]; assets: AdminAsset[]; t: typeof adminCopy.en; selectedAssetIds: string[]; setSelectedAssetIds: (ids: string[]) => void; showDialog: boolean; openDialog: () => void; closeDialog: () => void; upload: (event: FormEvent<HTMLFormElement>, agencyId?: string) => Promise<void>; submit: AdminSubmit; publish: (id: string) => void }) {
  return <><nav><Link to="/admin">← {t.backToCatalogue}</Link></nav><section className="admin-intro"><p className="eyebrow">{t.content}</p><h2>{creator.displayName}</h2><p>{t.contentHelp}</p></section>
    <ContentGrid className="admin-content-grid" items={products} addCard={<PlusCard label={t.addContent} onClick={openDialog} />} empty={<p className="empty">{t.contentEmpty}</p>} renderCopy={(product) => <><h2>{product.title}</h2><p>{product.status === "published" ? t.published : t.draft}</p>{product.status !== "published" && <button type="button" onClick={() => void publish(product._id)}>{t.publish}</button>}</>} />
    {showDialog && <Dialog title={t.newContent} close={closeDialog}><form onSubmit={(event) => void submit(event, "/admin/products", (data) => ({ agencyId: creator.agencyId, creatorId: creator._id, title: data.get("title"), slug: data.get("slug"), description: data.get("description"), previewAssetId: data.get("previewAssetId") || undefined, mediaAssetIds: selectedAssetIds, amountMinor: Math.round(Number(data.get("price")) * 100), currency: data.get("currency") }), t.productCreated).then(closeDialog)}><label>{t.productTitle}<input name="title" required /></label><label>{t.productSlug}<input name="slug" pattern="[a-z0-9-]+" placeholder="product-slug" required /></label><label>{t.description}<textarea name="description" /></label><label>{t.price}<input name="price" type="number" min="3" step="0.01" required /></label><label>{t.currency}<select name="currency" defaultValue="EUR"><option>EUR</option><option>USD</option><option>GBP</option></select></label><label>{t.preview}<select name="previewAssetId"><option value="">{t.noPreview}</option>{assets.filter((asset) => asset.purpose === "preview").map((asset) => <option key={asset._id} value={asset._id}>{asset.fileName}</option>)}</select></label><fieldset><legend>{t.privateFiles}</legend>{assets.filter((asset) => (asset.purpose ?? "delivery") === "delivery").map((asset) => <label key={asset._id}><input type="checkbox" checked={selectedAssetIds.includes(asset._id)} onChange={(event) => setSelectedAssetIds(event.target.checked ? [...selectedAssetIds, asset._id] : selectedAssetIds.filter((id) => id !== asset._id))} /> {asset.fileName}</label>)}{!assets.length && <p className="help">{t.noMedia}</p>}</fieldset><button disabled={!selectedAssetIds.length}>{t.createProduct}</button></form><section className="upload-panel"><h3>{t.uploadMedia}</h3><form onSubmit={(event) => void upload(event, creator.agencyId)}><label>{t.uploadPurpose}<select name="purpose" defaultValue="delivery"><option value="delivery">{t.deliveryFile}</option><option value="preview">{t.previewFile}</option></select></label><label>{t.chooseFile}<input name="file" type="file" accept="image/*,video/*,audio/*,application/*" required /></label><button>{t.upload}</button></form><p className="help">{t.uploadHelp}</p></section></Dialog>}</>;
}

function AdminSetup({ agencies, agents, t, submit, setDefaultAgent }: { agencies: AdminAgency[]; agents: AdminAgent[]; t: typeof adminCopy.en; submit: AdminSubmit; setDefaultAgent: (agent: AdminAgent) => void }) {
  return <section id="setup" className="setup-panel"><h2>{t.setup}</h2><p className="help">{t.setupEmpty}</p><article className="warning"><h3>{t.attributionTitle}</h3><p>{t.attributionHelp}</p><p>{t.secretWarning}</p></article><div className="setup-grid"><section><h3>{t.agency}</h3><form onSubmit={(event) => void submit(event, "/admin/agencies", (data) => ({ name: data.get("name"), higherPaysWorkspaceId: data.get("workspace") }))}><label>{t.agencyName}<input name="name" required /></label><label>{t.workspaceId}<input name="workspace" required /></label><p className="help">{t.workspaceHelp}</p><button>{t.createAgency}</button></form>{agencies.length ? agencies.map((agency) => <p key={agency._id}>{agency.name}</p>) : <p className="empty">{t.agencyEmpty}</p>}</section><section><h3>{t.agent}</h3><form onSubmit={(event) => void submit(event, "/admin/agents", (data) => ({ agencyId: data.get("agencyId"), name: data.get("name"), higherPaysAgentId: data.get("higherPaysAgentId") }))}><label>{t.agency}<select name="agencyId" required><option value="">{t.chooseAgency}</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select></label><label>{t.agentName}<input name="name" required /></label><label>{t.agentId}<input name="higherPaysAgentId" required /></label><p className="help">{t.agentHelp}</p><button>{t.createAgent}</button></form>{agents.length ? agents.map((agent) => <p key={agent._id}>{agent.name} <button type="button" onClick={() => void setDefaultAgent(agent)}>{t.setCheckoutAgent}</button></p>) : <p className="empty">{t.agentEmpty}</p>}</section></div></section>;
}

function AgeGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(sessionStorage.getItem("marketplace_age_confirmed") === "yes");
  const [error, setError] = useState("");
  const confirm = async () => {
    try { await request("/me/age-confirmation", { method: "POST", body: JSON.stringify({ accepted: true, version: "2026-09" }) }); sessionStorage.setItem("marketplace_age_confirmed", "yes"); setAccepted(true); }
    catch { setError("We could not record your age confirmation. Reopen the catalog from Telegram and try again."); }
  };
  if (accepted) return <>{children}</>;
  return <main className="age-gate"><p className="eyebrow">PRIVATE MARKETPLACE</p><h1>Adults only</h1><p>This catalog contains adult content. You must be at least 18 years old and legally permitted to view it in your location.</p>{error && <p role="alert">{error}</p>}<button onClick={() => void confirm()}>I am 18 or older</button><p className="fine-print">Paid content is never streamed in this Mini App. It is delivered privately by @OnlyContentMenuBot after a confirmed payment.</p></main>;
}

function Marketplace() {
  const { ready, error } = useTelegramSession();
  if (error) return <main><h1>Private Marketplace</h1><p>{error}</p></main>;
  if (!ready) return <main><h1>Private Marketplace</h1><p>Verifying your Telegram session…</p></main>;
  return <AgeGate><Routes><Route path="/" element={<Catalog />} /><Route path="/creators/:slug" element={<CreatorPage />} /><Route path="/cart" element={<CartPage />} /><Route path="/library" element={<Library />} /><Route path="/payment-complete" element={<PaymentComplete />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></AgeGate>;
}

export function App() {
  return <Routes><Route path="/admin" element={<Admin />} /><Route path="/admin/creators/:creatorId" element={<Admin />} /><Route path="*" element={<Marketplace />} /></Routes>;
}
