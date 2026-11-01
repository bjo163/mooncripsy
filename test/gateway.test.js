import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { loadGatewayConfig } from "../src/gateway/config.js";
import { createGatewayServer } from "../src/gateway/server.js";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return "http://127.0.0.1:" + server.address().port;
}

async function close(server) {
  if (!server.listening) return;
  server.close();
  await once(server, "close");
}

function makeConfig(upstreams) {
  return {
    host: "127.0.0.1",
    port: 0,
    clientApiKey: "mooncripsy-test-client-key-000000000000",
    requestBodyLimitBytes: 1024 * 1024,
    upstreams,
  };
}

test("gateway requires a sufficiently strong client key", () => {
  assert.throws(
    () => loadGatewayConfig({ MOONCRIPSY_GATEWAY_API_KEY: "short" }),
    /at least 24 characters/,
  );
});

test("gateway refuses non-loopback binding without explicit opt-in", () => {
  assert.throws(
    () => loadGatewayConfig({
      MOONCRIPSY_GATEWAY_API_KEY: "mooncripsy-test-client-key-000000000000",
      MOONCRIPSY_GATEWAY_HOST: "0.0.0.0",
    }),
    /MOONCRIPSY_ALLOW_REMOTE=1/,
  );
});

test("gateway validates upstream URLs and unique connection ids", () => {
  const base = {
    MOONCRIPSY_GATEWAY_API_KEY: "mooncripsy-test-client-key-000000000000",
  };
  assert.throws(
    () => loadGatewayConfig({
      ...base,
      MOONCRIPSY_UPSTREAMS_JSON: JSON.stringify([{
        id: "bad",
        baseUrl: "file:///etc/passwd",
      }]),
    }),
    /unsupported baseUrl/,
  );
  assert.throws(
    () => loadGatewayConfig({
      ...base,
      MOONCRIPSY_UPSTREAMS_JSON: JSON.stringify([
        { id: "same", baseUrl: "http://127.0.0.1:11434/v1", models: ["qwen"] },
        { id: "same", baseUrl: "http://127.0.0.1:1234/v1", models: ["qwen"] },
      ]),
    }),
    /Duplicate upstream id/,
  );
});

test("gateway authenticates clients, lists models, and routes with priority fallback", async (t) => {
  let primaryCalls = 0;
  let secondaryCalls = 0;

  const primary = createServer((request, response) => {
    if (request.url === "/v1/chat/completions") {
      primaryCalls += 1;
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "temporarily unavailable" } }));
      return;
    }
    response.writeHead(404).end();
  });
  const secondary = createServer((request, response) => {
    if (request.url === "/v1/chat/completions") {
      secondaryCalls += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "routed" }, finish_reason: "stop" }],
      }));
      return;
    }
    response.writeHead(404).end();
  });

  const primaryUrl = await listen(primary);
  const secondaryUrl = await listen(secondary);
  t.after(async () => {
    await Promise.all([close(primary), close(secondary)]);
  });

  const gateway = createGatewayServer({
    config: makeConfig([
      {
        id: "primary",
        name: "Primary",
        baseUrl: primaryUrl + "/v1",
        apiKey: "",
        models: ["shared-model"],
        enabled: true,
        priority: 10,
        timeoutMs: 2_000,
      },
      {
        id: "secondary",
        name: "Secondary",
        baseUrl: secondaryUrl + "/v1",
        apiKey: "",
        models: ["shared-model"],
        enabled: true,
        priority: 20,
        timeoutMs: 2_000,
      },
    ]),
  });

  const gatewayUrl = await listen(gateway);
  t.after(async () => close(gateway));

  const unauthenticated = await fetch(gatewayUrl + "/v1/models");
  assert.equal(unauthenticated.status, 401);

  const models = await fetch(gatewayUrl + "/v1/models", {
    headers: { authorization: "Bearer " + makeConfig([]).clientApiKey },
  });
  assert.equal(models.status, 200);
  const modelPayload = await models.json();
  assert.deepEqual(modelPayload.data.map((item) => item.id), ["shared-model"]);

  const completion = await fetch(gatewayUrl + "/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: "Bearer " + makeConfig([]).clientApiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "shared-model",
      messages: [{ role: "user", content: "hello" }],
    }),
  });

  assert.equal(completion.status, 200);
  const payload = await completion.json();
  assert.equal(payload.choices[0].message.content, "routed");
  assert.equal(primaryCalls, 1);
  assert.equal(secondaryCalls, 1);
});

test("gateway passes upstream SSE streams through without rewriting chunks", async (t) => {
  const upstream = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    });
    response.write("data: {\"choices\":[]}\n\n");
    response.end("data: [DONE]\n\n");
  });
  const upstreamUrl = await listen(upstream);
  t.after(async () => close(upstream));

  const gateway = createGatewayServer({
    config: makeConfig([{
      id: "stream",
      name: "Streaming upstream",
      baseUrl: upstreamUrl + "/v1",
      apiKey: "",
      models: ["stream-model"],
      enabled: true,
      priority: 1,
      timeoutMs: 2_000,
    }]),
  });
  const gatewayUrl = await listen(gateway);
  t.after(async () => close(gateway));

  const response = await fetch(gatewayUrl + "/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: "Bearer " + makeConfig([]).clientApiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "stream-model",
      stream: true,
      messages: [{ role: "user", content: "hello" }],
    }),
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  assert.equal(
    await response.text(),
    "data: {\"choices\":[]}\n\ndata: [DONE]\n\n",
  );
});
