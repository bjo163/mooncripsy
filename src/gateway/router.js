import {
  OpenAICompatibleProvider,
  isRetryableUpstreamStatus,
} from "./openai-compatible-provider.js";

export class GatewayRouter {
  constructor({ upstreams = [], fetchImpl = fetch, modelCacheTtlMs = 30_000 } = {}) {
    this.providers = upstreams
      .filter((item) => item.enabled)
      .map((item) => new OpenAICompatibleProvider(item, { fetchImpl }));
    this.modelCacheTtlMs = modelCacheTtlMs;
    this.modelCache = new Map();
  }

  async #listProviderModels(provider, signal) {
    const cached = this.modelCache.get(provider.id);
    if (cached && cached.expiresAt > Date.now()) return cached.models;

    const models = await provider.listModels({ signal });
    this.modelCache.set(provider.id, {
      models,
      expiresAt: Date.now() + this.modelCacheTtlMs,
    });
    return models;
  }

  async listModels({ signal } = {}) {
    const results = await Promise.allSettled(
      this.providers.map((provider) => this.#listProviderModels(provider, signal)),
    );
    const byId = new Map();
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result.status !== "fulfilled") continue;
      for (const model of result.value) {
        if (!byId.has(model.id)) {
          byId.set(model.id, {
            object: "model",
            id: model.id,
            created: model.created,
            owned_by: model.owned_by ?? this.providers[index].id,
          });
        }
      }
    }
    return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  async #resolveCandidates(model, signal) {
    const candidates = [];
    const discoveryErrors = [];
    for (const provider of this.providers) {
      try {
        const models = await this.#listProviderModels(provider, signal);
        if (models.some((entry) => entry.id === model)) candidates.push(provider);
      } catch (error) {
        discoveryErrors.push({ provider: provider.id, message: error.message });
      }
    }
    candidates.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
    return { candidates, discoveryErrors };
  }

  async createChatCompletion(body, { signal } = {}) {
    const model = String(body?.model ?? "").trim();
    if (!model) {
      const error = new Error("Request body must contain a non-empty model.");
      error.statusCode = 400;
      throw error;
    }
    if (model === "auto") {
      const error = new Error("The auto model alias is not configured yet. Use an explicit model ID in this MVP.");
      error.statusCode = 400;
      throw error;
    }

    const { candidates, discoveryErrors } = await this.#resolveCandidates(model, signal);
    if (candidates.length === 0) {
      const error = new Error(
        discoveryErrors.length > 0
          ? "No upstream could confirm support for model " + model + "."
          : "No enabled upstream supports model " + model + ".",
      );
      error.statusCode = discoveryErrors.length > 0 ? 503 : 404;
      error.details = discoveryErrors;
      throw error;
    }

    const attempts = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const provider = candidates[index];
      try {
        const response = await provider.createChatCompletion(body, { signal });
        attempts.push({ connectionId: provider.id, status: response.status });
        if (response.ok) {
          return { response, connectionId: provider.id, attempts };
        }
        if (isRetryableUpstreamStatus(response.status) && index < candidates.length - 1) {
          await response.arrayBuffer();
          continue;
        }
        return { response, connectionId: provider.id, attempts };
      } catch (error) {
        if (signal?.aborted) throw error;
        attempts.push({ connectionId: provider.id, error: error.message });
        if (index === candidates.length - 1) {
          const failure = new Error("All eligible upstream attempts failed for model " + model + ".");
          failure.statusCode = 502;
          failure.details = attempts.map((attempt) => ({
            connectionId: attempt.connectionId,
            status: attempt.status,
            error: attempt.error,
          }));
          throw failure;
        }
      }
    }

    const error = new Error("No upstream could serve model " + model + ".");
    error.statusCode = 502;
    error.details = attempts;
    throw error;
  }
}
