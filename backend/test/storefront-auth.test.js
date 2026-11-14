import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";

test("storefront catalog and checkout APIs require a customer session", async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  try {
    const catalogResponse = await fetch(`${baseUrl}/store/example-store`);
    assert.equal(catalogResponse.status, 401);
    assert.deepEqual(await catalogResponse.json(), {
      error: "Sign in with your customer account to continue."
    });

    const checkoutResponse = await fetch(`${baseUrl}/store/example-store/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(checkoutResponse.status, 401);
    assert.deepEqual(await checkoutResponse.json(), {
      error: "Sign in with your customer account to continue."
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
