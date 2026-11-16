import test from "node:test";
import assert from "node:assert/strict";

const previousEnvironment = {
  clientOrigin: process.env.CLIENT_ORIGIN,
  nodeEnv: process.env.NODE_ENV
};
process.env.CLIENT_ORIGIN = "http://localhost:3000";
process.env.NODE_ENV = "test";
const { default: app } = await import("../src/app.js");
if (previousEnvironment.clientOrigin === undefined) delete process.env.CLIENT_ORIGIN;
else process.env.CLIENT_ORIGIN = previousEnvironment.clientOrigin;
if (previousEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousEnvironment.nodeEnv;

test("development CORS accepts localhost aliases and rejects unrelated origins", async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;

  try {
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
      const response = await fetch(url, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type"
        }
      });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    }

    const externalResponse = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://untrusted.invalid",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
      }
    });
    assert.equal(externalResponse.headers.get("access-control-allow-origin"), null);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
