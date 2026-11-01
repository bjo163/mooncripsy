const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function joinEndpoint(baseUrl, suffix) {
  return baseUrl.replace(/\/+$/, "") + "/" + suffix.replace(/^\/+/, "");
}

function timeoutSignal(timeoutMs, parentSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
}

export class OpenAICompatibleProvider {
  constructor(config, { fetchImpl = fetch } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.id = config.id;
    this.name = config.name;
    this.priority = config.priority;
  }

  getConfiguredModels() {
    return this.config.models;
  }

  async listModels({ signal } = {}) {
    if (this.config.models != null) {
      return this.config.models.map((id) => ({
        id,
        object: "model",
        owned_by: this.id,
      }));
    }

    const response = await this.#request("models", {
      method: "GET",
      signal,
    });
    if (!response.ok) {
      throw new Error("Upstream " + this.id + " model discovery returned HTTP " + response.status + ".");
    }
    const payload = await response.json();
    if (!Array.isArray(payload?.data)) {
      throw new Error("Upstream " + this.id + " returned an invalid /models response.");
    }
    return payload.data
      .filter((item) => item && typeof item.id === "string" && item.id.length > 0)
      .map((item) => ({ ...item, owned_by: item.owned_by ?? this.id }));
  }

  async createChatCompletion(body, { signal } = {}) {
    return await this.#request("chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  }

  async #request(path, options) {
    const headers = new Headers(options.headers ?? {});
    headers.set("accept", "application/json, text/event-stream");
    if (this.config.apiKey) {
      headers.set("authorization", "Bearer " + this.config.apiKey);
    }

    const response = await this.fetchImpl(joinEndpoint(this.config.baseUrl, path), {
      method: options.method,
      headers,
      body: options.body,
      signal: timeoutSignal(this.config.timeoutMs, options.signal),
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error("Upstream " + this.id + " returned a redirect; redirects are disabled to protect credentials.");
    }
    return response;
  }
}

export function isRetryableUpstreamStatus(status) {
  return RETRYABLE_STATUS.has(status);
}
