import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { clearToken, Creator, money, Product, request, setToken } from "./api";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: { user?: { id: number } };
        ready(): void;
        expand(): void;
        openLink(url: string): void;
        close(): void;
      };
    };
  }
}

function useTelegramSession() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    clearToken();
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
    const initData = webApp?.initData;
    // This bridge value is only a consistency check; the API derives identity from signed initData.
    const bridgeTelegramId = webApp?.initDataUnsafe?.user?.id?.toString();
    if (!initData) {
      setError("Open the catalog using the Open catalog button in @OnlyContentMenuBot. Direct links do not include your Telegram identity.");
      return;
    }

    let active = true;
    request<{ token: string; telegramId: string }>("/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) })
      .then(({ token, telegramId }) => {
        if (!active) return;
        if (bridgeTelegramId && bridgeTelegramId !== telegramId) {
          setError("Telegram returned inconsistent account details. Close this page and reopen the catalog from @OnlyContentMenuBot.");
          return;
        }
        setToken(token);
        setReady(true);
      })
      .catch(() => {
        if (active) setError("Telegram could not verify this Mini App session. Close this page and reopen the catalog from @OnlyContentMenuBot.");
      });
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
    <section className="creator-grid">{creators.map((creator) => <Link className="creator-card" key={creator._id} to={`/creators/${creator.slug}`}>
      <div className="creator-cover"><span>18+</span></div><h2>{creator.displayName}</h2><p>{creator.bio || "Explore this creator’s private collection."}</p><strong>View storefront →</strong>
    </Link>)}</section>
    {!creators.length && <p className="empty">No creators are available yet.</p>}
  </main>;
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
    <section className="reel-grid">{items.map((item) => <article className="reel-card" key={item._id}>
      <div className="reel-preview">{item.preview?.mimeType.startsWith("video/") ? <video src={item.preview.url} muted loop autoPlay playsInline preload="metadata" /> : item.preview ? <img src={item.preview.url} alt="" /> : <div className="preview-unavailable">Preview unavailable</div>}<span className="blur-label">BLURRED PREVIEW</span></div>
      <div className="reel-copy"><h2>{item.title}</h2><p>{item.description}</p><strong>{money(item.amountMinor, item.currency)}</strong><button onClick={() => void add(item._id)}>Add to cart</button></div>
    </article>)}</section>
    {!items.length && <p className="empty">No content is available from this creator yet.</p>}
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
    const order = params.get("order");
    const state = params.get("state");
    if (!order || !state) return;
    const check = () => void request<{ paymentStatus: string }>(`/payment-return/${order}?state=${encodeURIComponent(state)}`).then((result) => setStatus(result.paymentStatus === "paid" ? "Payment confirmed. Your content is being delivered in Telegram." : "Payment is still processing.")).catch(() => setStatus("Return to Telegram and check Purchases shortly."));
    check(); const timer = setInterval(check, 5000); return () => clearInterval(timer);
  }, []);
  return <main><h1>{status}</h1><Link to="/library">Open purchases</Link></main>;
}

function Admin() {
  const [token, setAdminToken] = useState(sessionStorage.getItem("marketplace_admin_token") ?? "");
  const [agencies, setAgencies] = useState<{ _id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ _id: string; agencyId: string; name: string }[]>([]);
  const [creators, setCreators] = useState<{ _id: string; agencyId: string; displayName: string; status: string }[]>([]);
  const [assets, setAssets] = useState<{ _id: string; agencyId: string; fileName: string; status: string; purpose?: "delivery" | "preview" }[]>([]);
  const [products, setProducts] = useState<{ _id: string; title: string; status: string }[]>([]);
  const [productAgencyId, setProductAgencyId] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const load = () => void Promise.all([
    request<{ items: typeof agencies }>("/admin/agencies"), request<{ items: typeof agents }>("/admin/agents"),
    request<{ items: typeof creators }>("/admin/creators"), request<{ items: typeof assets }>("/admin/assets"),
    request<{ items: typeof products }>("/admin/products"),
  ]).then(([agencyResult, agentResult, creatorResult, assetResult, productResult]) => {
    setAgencies(agencyResult.items); setAgents(agentResult.items); setCreators(creatorResult.items); setAssets(assetResult.items); setProducts(productResult.items);
  }).catch((error) => setNotice(error.message));
  useEffect(() => { if (token) { setToken(token); load(); } }, [token]);
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const result = await request<{ token: string }>("/auth/admin", { method: "POST", body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
    sessionStorage.setItem("marketplace_admin_token", result.token); setToken(result.token); setAdminToken(result.token);
  };
  const submit = async (event: FormEvent<HTMLFormElement>, path: string, build: (data: FormData) => unknown) => {
    event.preventDefault();
    try { await request(path, { method: "POST", body: JSON.stringify(build(new FormData(event.currentTarget))) }); event.currentTarget.reset(); setNotice("Saved."); load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Save failed"); }
  };
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget); const file = data.get("file");
    if (!(file instanceof File)) return;
    if (file.size > 50_000_000) { setNotice("Telegram delivery is limited to 50 MB per uploaded file."); return; }
    const checksum = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((value) => value.toString(16).padStart(2, "0")).join("");
    try {
      const result = await request<{ asset: { _id: string }; uploadUrl: string }>("/admin/assets/upload-url", { method: "POST", body: JSON.stringify({ agencyId: data.get("agencyId"), purpose: data.get("purpose"), fileName: file.name, mimeType: file.type || "application/octet-stream", bytes: file.size, sha256: checksum }) });
      await fetch(result.uploadUrl, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
      await request(`/admin/assets/${result.asset._id}/complete`, { method: "POST" });
      event.currentTarget.reset(); setNotice("Media uploaded."); load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Upload failed"); }
  };
  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const price = Number(data.get("price"));
    const amountMinor = Math.round(price * 100);
    if (!Number.isFinite(price) || !Number.isSafeInteger(amountMinor) || amountMinor < 300) {
      setNotice("Set a price of at least 3.00.");
      return;
    }
    if (!selectedAssetIds.length) {
      setNotice("Select at least one uploaded media file.");
      return;
    }
    try {
      await request("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          agencyId: data.get("agencyId"), creatorId: data.get("creatorId"), title: data.get("title"),
          slug: data.get("slug"), description: data.get("description"), previewAssetId: data.get("previewAssetId") || undefined, mediaAssetIds: selectedAssetIds,
          amountMinor, currency: data.get("currency"),
        }),
      });
      event.currentTarget.reset();
      setProductAgencyId("");
      setSelectedAssetIds([]);
      setNotice("Product saved.");
      load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Save failed");
    }
  };
  const publish = async (id: string) => { try { await request(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) }); setNotice("Product published."); load(); } catch (error) { setNotice(error instanceof Error ? error.message : "Publish failed"); } };
  const publishCreator = async (id: string) => { try { await request(`/admin/creators/${id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) }); setNotice("Creator published."); load(); } catch (error) { setNotice(error instanceof Error ? error.message : "Publish failed"); } };
  const setDefaultAgent = async (agent: { _id: string; agencyId: string; name: string }) => { try { await request(`/admin/agencies/${agent.agencyId}`, { method: "PATCH", body: JSON.stringify({ defaultAgentId: agent._id }) }); setNotice(`${agent.name} is now the checkout agent.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Update failed"); } };
  if (!token) return <main><h1>Administrator sign in</h1><form onSubmit={(event) => void login(event)}><input name="email" type="email" placeholder="Email" required /><input name="password" type="password" placeholder="Password" required /><button>Sign in</button></form></main>;
  return <main><h1>Marketplace administration</h1>{notice && <p role="status">{notice}</p>}
    <section><h2>1. Agency</h2><form onSubmit={(event) => void submit(event, "/admin/agencies", (data) => ({ name: data.get("name"), higherPaysWorkspaceId: data.get("workspace") }))}><input name="name" placeholder="Agency name" required /><input name="workspace" placeholder="HigherPays workspace ID" required /><button>Create agency</button></form>{agencies.map((agency) => <p key={agency._id}>{agency.name}</p>)}</section>
    <section><h2>2. Agent</h2><form onSubmit={(event) => void submit(event, "/admin/agents", (data) => ({ agencyId: data.get("agencyId"), name: data.get("name"), higherPaysAgentId: data.get("higherPaysAgentId") }))}><select name="agencyId" required><option value="">Agency</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select><input name="name" placeholder="Agent name" required /><input name="higherPaysAgentId" placeholder="HigherPays agent ID" required /><button>Create agent</button></form>{agents.map((agent) => <p key={agent._id}>{agent.name} <button onClick={() => void setDefaultAgent(agent)}>Set as checkout agent</button></p>)}</section>
    <section><h2>3. Creator and rights attestation</h2><form onSubmit={(event) => void submit(event, "/admin/creators", (data) => ({ agencyId: data.get("agencyId"), displayName: data.get("displayName"), slug: data.get("slug"), bio: data.get("bio"), rightsAttestation: { affirmedBy: data.get("affirmedBy"), statementVersion: "2026-09", creatorIsAdult: true, distributionAuthorized: true } }))}><select name="agencyId" required><option value="">Agency</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select><input name="displayName" placeholder="Creator display name" required /><input name="slug" pattern="[a-z0-9-]+" placeholder="creator-slug" required /><input name="affirmedBy" placeholder="Approving administrator" required /><textarea name="bio" placeholder="Bio" /><button>Create attested creator</button></form>{creators.map((creator) => <p key={creator._id}>{creator.displayName} · {creator.status} {creator.status !== "published" && <button onClick={() => void publishCreator(creator._id)}>Publish</button>}</p>)}</section>
    <section><h2>4. Private media</h2><form onSubmit={(event) => void upload(event)}><select name="agencyId" required><option value="">Agency</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select><select name="purpose" defaultValue="delivery"><option value="delivery">Private delivery file</option><option value="preview">Blurred storefront preview</option></select><input name="file" type="file" accept="image/*,video/*,audio/*,application/*" required /><button>Upload media</button></form><p>Upload a separate, safe preview clip. Private delivery files are never exposed in the Mini App.</p>{assets.map((asset) => <p key={asset._id}>{asset.fileName} · {asset.purpose ?? "delivery"} · {asset.status}</p>)}</section>
    <section><h2>5. Product</h2><form onSubmit={(event) => void createProduct(event)}><select name="agencyId" required value={productAgencyId} onChange={(event) => { setProductAgencyId(event.target.value); setSelectedAssetIds([]); }}><option value="">Agency</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select><select name="creatorId" required><option value="">Creator</option>{creators.filter((creator) => !productAgencyId || creator.agencyId === productAgencyId).map((creator) => <option value={creator._id} key={creator._id}>{creator.displayName}</option>)}</select><input name="title" placeholder="Product title" required /><input name="slug" pattern="[a-z0-9-]+" placeholder="product-slug" required /><textarea name="description" placeholder="Description" /><input name="price" type="number" min="3" step="0.01" placeholder="Price (for example, 9.99)" required /><select name="currency" defaultValue="EUR"><option>EUR</option><option>USD</option><option>GBP</option></select><select name="previewAssetId"><option value="">No preview available</option>{assets.filter((asset) => asset.status === "ready" && asset.purpose === "preview" && (!productAgencyId || asset.agencyId === productAgencyId)).map((asset) => <option value={asset._id} key={asset._id}>{asset.fileName}</option>)}</select><fieldset><legend>Private delivery files</legend>{assets.filter((asset) => asset.status === "ready" && (asset.purpose ?? "delivery") === "delivery" && (!productAgencyId || asset.agencyId === productAgencyId)).map((asset) => <label key={asset._id}><input type="checkbox" checked={selectedAssetIds.includes(asset._id)} onChange={(event) => setSelectedAssetIds((ids) => event.target.checked ? [...ids, asset._id] : ids.filter((id) => id !== asset._id))} /> {asset.fileName}</label>)}</fieldset><button>Create product</button></form>{products.map((product) => <p key={product._id}>{product.title} · {product.status} {product.status !== "published" && <button onClick={() => void publish(product._id)}>Publish</button>}</p>)}</section>
  </main>;
}

function AgeGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(sessionStorage.getItem("marketplace_age_confirmed") === "yes");
  const [error, setError] = useState("");
  const confirm = async () => {
    try {
      await request("/me/age-confirmation", { method: "POST", body: JSON.stringify({ accepted: true, version: "2026-09" }) });
      sessionStorage.setItem("marketplace_age_confirmed", "yes"); setAccepted(true);
    } catch { setError("We could not record your age confirmation. Reopen the catalog from Telegram and try again."); }
  };
  if (accepted) return <>{children}</>;
  return <main className="age-gate"><p className="eyebrow">PRIVATE MARKETPLACE</p><h1>Adults only</h1><p>This catalog contains adult content. You must be at least 18 years old and legally permitted to view it in your location.</p>{error && <p role="alert">{error}</p>}<button onClick={() => void confirm()}>I am 18 or older</button><p className="fine-print">Paid content is never streamed in this Mini App. It is delivered privately by @OnlyContentMenuBot after a confirmed payment.</p></main>;
}

function Marketplace() {
  const { ready, error } = useTelegramSession();
  if (error) return <main><h1>Private Marketplace</h1><p>{error}</p></main>;
  if (!ready) return <main><h1>Private Marketplace</h1><p>Verifying your Telegram session…</p></main>;
  return <AgeGate><Routes>
    <Route path="/" element={<Catalog />} /><Route path="/creators/:slug" element={<CreatorPage />} /><Route path="/cart" element={<CartPage />} />
    <Route path="/library" element={<Library />} /><Route path="/payment-complete" element={<PaymentComplete />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AgeGate>;
}

export function App() {
  return <Routes>
    <Route path="/admin" element={<Admin />} />
    <Route path="*" element={<Marketplace />} />
  </Routes>;
}
