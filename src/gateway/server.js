import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { GatewayRouter } from "./router.js";

function sendJson(response, statusCode, payload) {
  if (response.headersSent || response.destroyed) return;
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
  });
  response.end(body);
}

function hasValidClientKey(request, expectedKey) {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match) return false;
  const actual = Buffer.from(match[1]);
  const expected = Buffer.from(expectedKey);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJsonBody(request, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > limitBytes) {
      const error = new Error("Request body exceeds the configured size limit.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function copyUpstreamHeaders(upstream, downstream) {
  const headers = {};
  for (const name of ["content-type", "cache-control", "x-request-id", "openai-processing-ms"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  downstream.writeHead(upstream.status, headers);
}

async function pipeUpstreamResponse(upstream, downstream) {
  copyUpstreamHeaders(upstream, downstream);
  if (!upstream.body) {
    downstream.end();
    return;
  }
  for await (const chunk of upstream.body) {
    if (downstream.destroyed) return;
    if (!downstream.write(Buffer.from(chunk))) {
      await new Promise((resolve) => downstream.once("drain", resolve));
    }
  }
  downstream.end();
}

export function createGatewayServer({
  config,
  router = new GatewayRouter({ upstreams: config.upstreams }),
} = {}) {
  if (!config?.clientApiKey) throw new Error("Gateway config with clientApiKey is required.");

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, {
        status: "ok",
        service: "mooncripsy-gateway",
        upstreams: router.providers.length,
      });
      return;
    }

    if (!url.pathname.startsWith("/v1/")) {
      sendJson(response, 404, { error: { message: "Not found.", type: "not_found_error" } });
      return;
    }

    if (!hasValidClientKey(request, config.clientApiKey)) {
      sendJson(response, 401, {
        error: { message: "A valid Mooncripsy bearer API key is required.", type: "authentication_error" },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/models") {
      try {
        const data = await router.listModels();
        sendJson(response, 200, { object: "list", data });
      } catch (error) {
        sendJson(response, error.statusCode ?? 503, {
          error: { message: error.message, type: "upstream_error" },
        });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      const controller = new AbortController();
      response.on("close", () => {
        if (!response.writableEnded) controller.abort();
      });

      try {
        const body = await readJsonBody(request, config.requestBodyLimitBytes);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          const error = new Error("Request body must be a JSON object.");
          error.statusCode = 400;
          throw error;
        }
        if (!Array.isArray(body.messages)) {
          const error = new Error("Request body must contain a messages array.");
          error.statusCode = 400;
          throw error;
        }

        const result = await router.createChatCompletion(body, { signal: controller.signal });
        await pipeUpstreamResponse(result.response, response);
      } catch (error) {
        if (controller.signal.aborted || response.destroyed) return;
        sendJson(response, error.statusCode ?? 502, {
          error: {
            message: error.message,
            type: error.statusCode === 400 ? "invalid_request_error" : "upstream_error",
            details: error.details,
          },
        });
      }
      return;
    }

    sendJson(response, 404, { error: { message: "Unsupported gateway endpoint.", type: "not_found_error" } });
  });

  return server;
}
