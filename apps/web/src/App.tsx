import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Creator, money, Product, request, setToken } from "./api";

declare global {
  interface Window { Telegram?: { WebApp?: { initData: string; ready(): void; openLink(url: string): void; close(): void } }; }
}

function useTelegramSession() {
  const [ready, setReady] = useState(Boolean(sessionStorage.getItem("marketplace_token")));
  const [error, setError] = useState("");
  useEffect(() => {
    if (ready) return;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) { setError("Open this catalog from the Telegram bot."); return; }
    window.Telegram?.WebApp?.ready();
    request<{ token: string }>("/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) })
      .then(({ token }) => { setToken(token); setReady(true); })
      .catch((reason) => setError(reason.message));
  }, [ready]);
  return { ready, error };
}

function Catalog() {
  const { ready, error } = useTelegramSession();
  const [creators, setCreators] = useState<Creator[]>([]);
  useEffect(() => { if (ready) void request<{ items: Creator[] }>("/catalog/creators").then((result) => setCreators(result.items)); }, [ready]);
  if (error) return <main><h1>Private Marketplace</h1><p>{error}</p></main>;
  return <main><nav><Link to="/">Catalog</Link><Link to="/cart">Cart</Link><Link to="/library">Purchases</Link></nav><h1>Creators</h1>{creators.map((creator) => <article key={creator._id}><h2>{creator.displayName}</h2><p>{creator.bio}</p><Link to={`/creators/${creator.slug}`}>View content</Link></article>)}</main>;
}

function CreatorPage() {
  const { slug } = useParams();
  const [items, setItems] = useState<Product[]>([]);
  const [creator, setCreator] = useState<Creator | null>(null);
  useEffect(() => { void request<{ creator: Creator; items: Product[] }>(`/catalog/creators/${slug}/products`).then((result) => { setCreator(result.creator); setItems(result.items); }); }, [slug]);
  const add = async (productId: string) => { await request("/cart/items", { method: "POST", body: JSON.stringify({ productId }) }); alert("Added to cart"); };
  return <main><nav><Link to="/">Catalog</Link><Link to="/cart">Cart</Link></nav><h1>{creator?.displayName ?? "Creator"}</h1>{items.map((item) => <article key={item._id}><h2>{item.title}</h2><p>{item.description}</p><strong>{money(item.amountMinor, item.currency)}</strong><button onClick={() => void add(item._id)}>Add to cart</button></article>)}</main>;
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
  const [assets, setAssets] = useState<{ _id: string; agencyId: string; fileName: string }[]>([]);
  const [products, setProducts] = useState<{ _id: string; title: string; status: string }[]>([]);
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
      const result = await request<{ asset: { _id: string }; uploadUrl: string }>("/admin/assets/upload-url", { method: "POST", body: JSON.stringify({ agencyId: data.get("agencyId"), fileName: file.name, mimeType: file.type || "application/octet-stream", bytes: file.size, sha256: checksum }) });
      await fetch(result.uploadUrl, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
      await request(`/admin/assets/${result.asset._id}/complete`, { method: "POST" });
      event.currentTarget.reset(); setNotice("Media uploaded."); load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Upload failed"); }
  };
  const publish = async (id: string) => { try { await request(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) }); setNotice("Product published."); load(); } catch (error) { setNotice(error instanceof Error ? error.message : "Publish failed"); } };
  const publishCreator = async (id: string) => { try { await request(`/admin/creators/${id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) }); setNotice("Creator published."); load(); } catch (error) { setNotice(error instanceof Error ? error.message : "Publish failed"); } };
  const setDefaultAgent = async (agent: { _id: string; agencyId: string; name: string }) => { try { await request(`/admin/agencies/${agent.agencyId}`, { method: "PATCH", body: JSON.stringify({ defaultAgentId: agent._id }) }); setNotice(`${agent.name} is now the checkout agent.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Update failed"); } };
  if (!token) return <main><h1>Administrator sign in</h1><form onSubmit={(event) => void login(event)}><input name="email" type="email" placeholder="Email" required /><input name="password" type="password" placeholder="Password" required /><button>Sign in</button></form></main>;
  return <main><h1>Marketplace administration</h1>{notice && <p role="status">{notice}</p>}
    <section><h2>1. Agency</h2><form onSubmit={(event) => void submit(event, "/admin/agencies", (data) => ({ name: data.get("name"), higherPaysWorkspaceId: data.get("workspace") }))}><input name="name" placeholder="Agency name" required /><input name="workspace" placeholder="HigherPays workspace ID" required /><button>Create agency</button></form>{agencies.map((agency) => <p key={agency._id}>{agency.name}</p>)}</section>
    <section><h2>2. Agent</h2><form onSubmit={(event) => void submit(event, "/admin/agents", (data) => ({ agencyId: data.get("agencyId"), name: data.get("name"), higherPaysAgentId: data.get("higherPaysAgentId") }))}><select name="agencyId" required><option value="">Agency</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select><input name="name" placeholder="Agent name" required /><input name="higherPaysAgentId" placeholder="HigherPays agent ID" required /><button>Create agent</button></form>{agents.map((agent) => <p key={agent._id}>{agent.name} <button onClick={() => void setDefaultAgent(agent)}>Set as checkout agent</button></p>)}</section>
    <section><h2>3. Creator and rights attestation</h2><form onSubmit={(event) => void submit(event, "/admin/creators", (data) => ({ agencyId: data.get("agencyId"), displayName: data.get("displayName"), slug: data.get("slug"), bio: data.get("bio"), rightsAttestation: { affirmedBy: data.get("affirmedBy"), statementVersion: "2026-09", creatorIsAdult: true, distributionAuthorized: true } }))}><select name="agencyId" required><option value="">Agency</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select><input name="displayName" placeholder="Creator display name" required /><input name="slug" pattern="[a-z0-9-]+" placeholder="creator-slug" required /><input name="affirmedBy" placeholder="Approving administrator" required /><textarea name="bio" placeholder="Bio" /><button>Create attested creator</button></form>{creators.map((creator) => <p key={creator._id}>{creator.displayName} · {creator.status} {creator.status !== "published" && <button onClick={() => void publishCreator(creator._id)}>Publish</button>}</p>)}</section>
    <section><h2>4. Private media</h2><form onSubmit={(event) => void upload(event)}><select name="agencyId" required><option value="">Agency</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select><input name="file" type="file" required /><button>Upload media</button></form><p>Maximum 50 MB per file for Bot API delivery.</p>{assets.map((asset) => <p key={asset._id}>{asset.fileName}</p>)}</section>
    <section><h2>5. Product</h2><form onSubmit={(event) => void submit(event, "/admin/products", (data) => ({ agencyId: data.get("agencyId"), creatorId: data.get("creatorId"), title: data.get("title"), slug: data.get("slug"), description: data.get("description"), mediaAssetIds: String(data.get("mediaAssetIds")).split(",").filter(Boolean), amountMinor: Number(data.get("amountMinor")), currency: data.get("currency") }))}><select name="agencyId" required><option value="">Agency</option>{agencies.map((agency) => <option value={agency._id} key={agency._id}>{agency.name}</option>)}</select><select name="creatorId" required><option value="">Creator</option>{creators.map((creator) => <option value={creator._id} key={creator._id}>{creator.displayName}</option>)}</select><input name="title" placeholder="Product title" required /><input name="slug" pattern="[a-z0-9-]+" placeholder="product-slug" required /><textarea name="description" placeholder="Description" /><input name="amountMinor" type="number" min="300" placeholder="Price in cents" required /><select name="currency" defaultValue="EUR"><option>EUR</option><option>USD</option><option>GBP</option></select><input name="mediaAssetIds" placeholder="Media IDs, comma-separated" required /><button>Create product</button></form>{products.map((product) => <p key={product._id}>{product.title} · {product.status} {product.status !== "published" && <button onClick={() => void publish(product._id)}>Publish</button>}</p>)}</section>
  </main>;
}

export function App() {
  return <Routes>
    <Route path="/" element={<Catalog />} /><Route path="/creators/:slug" element={<CreatorPage />} /><Route path="/cart" element={<CartPage />} />
    <Route path="/library" element={<Library />} /><Route path="/payment-complete" element={<PaymentComplete />} /><Route path="/admin" element={<Admin />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
