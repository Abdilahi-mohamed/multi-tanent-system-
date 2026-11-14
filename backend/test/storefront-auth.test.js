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

test("Google OAuth uses the configured client ID and callback URI", async () => {
  const previousEnvironment = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    jwtSecret: process.env.JWT_SECRET
  };
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:4000/api/auth/google/callback";
  process.env.JWT_SECRET = "test-jwt-secret-for-google-oauth-route";

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  try {
    const mismatchResponse = await fetch(
      `${baseUrl}/customer/auth/google?clientId=wrong-client-id&returnTo=%2Fstore%2Fexample-store`,
      { redirect: "manual" }
    );
    assert.equal(mismatchResponse.status, 302);
    assert.match(mismatchResponse.headers.get("location"), /google_configuration_mismatch/);

    const response = await fetch(
      `${baseUrl}/customer/auth/google?clientId=test-google-client-id&returnTo=%2Fstore%2Fexample-store`,
      { redirect: "manual" }
    );
    assert.equal(response.status, 302);
    const authorizationUrl = new URL(response.headers.get("location"));
    assert.equal(authorizationUrl.origin, "https://accounts.google.com");
    assert.equal(authorizationUrl.searchParams.get("client_id"), "test-google-client-id");
    assert.equal(
      authorizationUrl.searchParams.get("redirect_uri"),
      "http://localhost:4000/api/auth/google/callback"
    );
    assert.equal(authorizationUrl.searchParams.get("response_type"), "code");

    const callbackResponse = await fetch(`${baseUrl}/auth/google/callback`, {
      redirect: "manual"
    });
    assert.equal(callbackResponse.status, 400);
    assert.match((await callbackResponse.json()).error, /expired or could not be verified/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    for (const [key, value] of Object.entries({
      GOOGLE_CLIENT_ID: previousEnvironment.clientId,
      GOOGLE_CLIENT_SECRET: previousEnvironment.clientSecret,
      GOOGLE_OAUTH_REDIRECT_URI: previousEnvironment.redirectUri,
      JWT_SECRET: previousEnvironment.jwtSecret
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
