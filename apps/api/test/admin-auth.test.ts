import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.ADMIN_SHARED_PASSWORD = "test-shared-password";

const { app } = await import("../src/app.js");

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server_address_unavailable");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("admin APIs reject requests without an admin session", async () => {
  await withServer(async (baseUrl) => {
    const [listResponse, uploadResponse] = await Promise.all([
      fetch(`${baseUrl}/api/admin/agencies`),
      fetch(`${baseUrl}/api/admin/assets/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    ]);

    assert.equal(listResponse.status, 401);
    assert.equal(uploadResponse.status, 401);
  });
});

test("admin login accepts only the shared password", async () => {
  await withServer(async (baseUrl) => {
    const invalidResponse = await fetch(`${baseUrl}/api/auth/admin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    assert.equal(invalidResponse.status, 401);

    const emailResponse = await fetch(`${baseUrl}/api/auth/admin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "test-shared-password" }),
    });
    assert.equal(emailResponse.status, 400);

    const response = await fetch(`${baseUrl}/api/auth/admin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "test-shared-password" }),
    });
    assert.equal(response.status, 200);

    const { token } = await response.json() as { token: string };
    const payload = jwt.decode(token);
    assert.ok(payload && typeof payload === "object");
    assert.equal(payload.kind, "admin");
    assert.ok(!("email" in payload));
    assert.equal(payload.exp! - payload.iat!, 4 * 60 * 60);
  });
});
