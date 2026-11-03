import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
const { app } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { Creator, Product } = await import("../src/models.js");

test("catalog filters published creators through published products in the selected category", async () => {
  const distinct = Product.distinct;
  const find = Creator.find;
  let productQuery: any;
  let creatorQuery: any;
  Product.distinct = (async (_field: string, query: unknown) => { productQuery = query; return ["creator-id"]; }) as never;
  Creator.find = ((query: unknown) => { creatorQuery = query; return { sort: () => ({ lean: async () => [] }) }; }) as never;
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server_address_unavailable");
  const token = jwt.sign({ kind: "telegram", userId: "test", telegramId: "123" }, config.JWT_SECRET);
  try {
    const url = `http://127.0.0.1:${address.port}/api/catalog/creators`;
    const response = await fetch(`${url}?category=0123456789abcdef01234567`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(productQuery, { status: "published", categoryIds: "0123456789abcdef01234567" });
    assert.deepEqual(creatorQuery, { status: "published", _id: { $in: ["creator-id"] } });
    assert.deepEqual(await response.json(), { items: [] });
    const invalid = await fetch(`${url}?category=invalid`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(invalid.status, 400);
  } finally {
    Product.distinct = distinct;
    Creator.find = find;
    server.close();
    await once(server, "close");
  }
});
