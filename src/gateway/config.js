const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 20128;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 60_000;

function parseInteger(value, fallback, name, { min = 1, max = 65_535 } = {}) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(name + " must be an integer between " + min + " and " + max + ".");
  }
  return parsed;
}

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function normalizeUpstream(item, index, env) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("Each upstream connection must be an object.");
  }

  const id = String(item.id ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
    throw new Error("Upstream " + index + " has an invalid id.");
  }

  const baseUrl = String(item.baseUrl ?? "").trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error("Upstream " + id + " must have an absolute baseUrl.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)
    || parsedUrl.username
    || parsedUrl.password
    || parsedUrl.search
    || parsedUrl.hash) {
    throw new Error("Upstream " + id + " has an unsupported baseUrl.");
  }

  const models = item.models == null
    ? null
    : item.models;
  if (models != null && (
    !Array.isArray(models)
    || models.some((model) => typeof model !== "string" || !model.trim())
  )) {
    throw new Error("Upstream " + id + " models must be an array of non-empty strings.");
  }

  const apiKeyEnv = item.apiKeyEnv == null ? null : String(item.apiKeyEnv).trim();
  if (apiKeyEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
    throw new Error("Upstream " + id + " apiKeyEnv is invalid.");
  }

  const priority = item.priority == null ? 100 : Number(item.priority);
  if (!Number.isFinite(priority)) {
    throw new Error("Upstream " + id + " priority must be a finite number.");
  }

  return Object.freeze({
    id,
    name: String(item.name ?? id).trim() || id,
    baseUrl: parsedUrl.toString().replace(/\/+$/, ""),
    apiKey: apiKeyEnv ? String(env[apiKeyEnv] ?? "") : "",
    apiKeyEnv,
    models: models == null ? null : [...new Set(models.map((model) => model.trim()))],
    enabled: item.enabled !== false,
    priority,
    timeoutMs: item.timeoutMs == null
      ? parseInteger(env.MOONCRIPSY_UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS, "MOONCRIPSY_UPSTREAM_TIMEOUT_MS", { max: 600_000 })
      : parseInteger(String(item.timeoutMs), DEFAULT_UPSTREAM_TIMEOUT_MS, "upstream timeoutMs", { max: 600_000 }),
  });
}

function loadUpstreams(env) {
  let raw;
  if (env.MOONCRIPSY_UPSTREAMS_JSON) {
    try {
      raw = JSON.parse(env.MOONCRIPSY_UPSTREAMS_JSON);
    } catch {
      throw new Error("MOONCRIPSY_UPSTREAMS_JSON must contain valid JSON.");
    }
    if (!Array.isArray(raw)) {
      throw new Error("MOONCRIPSY_UPSTREAMS_JSON must be a JSON array.");
    }
  } else if (env.MOONCRIPSY_UPSTREAM_BASE_URL) {
    raw = [{
      id: "default",
      name: "Default upstream",
      baseUrl: env.MOONCRIPSY_UPSTREAM_BASE_URL,
      apiKeyEnv: "MOONCRIPSY_UPSTREAM_API_KEY",
      models: env.MOONCRIPSY_UPSTREAM_MODELS
        ? String(env.MOONCRIPSY_UPSTREAM_MODELS).split(",").map((value) => value.trim()).filter(Boolean)
        : null,
    }];
  } else {
    raw = [];
  }

  const upstreams = raw.map((item, index) => normalizeUpstream(item, index + 1, env));
  const ids = new Set();
  for (const upstream of upstreams) {
    if (ids.has(upstream.id)) throw new Error("Duplicate upstream id: " + upstream.id);
    ids.add(upstream.id);
  }
  return upstreams;
}

export function loadGatewayConfig(env = process.env) {
  const host = String(env.MOONCRIPSY_GATEWAY_HOST ?? DEFAULT_HOST).trim() || DEFAULT_HOST;
  const port = parseInteger(env.MOONCRIPSY_GATEWAY_PORT, DEFAULT_PORT, "MOONCRIPSY_GATEWAY_PORT");
  const clientApiKey = String(env.MOONCRIPSY_GATEWAY_API_KEY ?? "").trim();
  if (clientApiKey.length < 24) {
    throw new Error("Set MOONCRIPSY_GATEWAY_API_KEY to a random secret of at least 24 characters.");
  }

  const allowRemote = env.MOONCRIPSY_ALLOW_REMOTE === "1";
  if (!isLoopbackHost(host) && !allowRemote) {
    throw new Error("Non-loopback binding requires MOONCRIPSY_ALLOW_REMOTE=1 and a protected network.");
  }

  return Object.freeze({
    host,
    port,
    clientApiKey,
    allowRemote,
    requestBodyLimitBytes: parseInteger(
      env.MOONCRIPSY_GATEWAY_BODY_LIMIT_BYTES,
      4 * 1024 * 1024,
      "MOONCRIPSY_GATEWAY_BODY_LIMIT_BYTES",
      { max: 64 * 1024 * 1024 },
    ),
    upstreams: loadUpstreams(env),
  });
}
