# Product

## Product identity

**Mooncripsy** is a local-first, self-hosted multi-provider AI gateway and smart router. The existing product also contains a separate Browser Workspace for interactive coding-agent tasks through user-controlled browser profiles.

The executable/package identity currently remains moncripsy; a separate identity/metadata cleanup decision is required before changing package names, install paths, or persisted data directories.

## Platform

- Headless Node.js gateway service.
- CLI for gateway lifecycle and browser workspace operations.
- Electron + React desktop application as the local gateway control plane.
- Optional local inference upstreams and remote OpenAI-compatible API upstreams.

## Users

Developers and advanced AI users who want one stable local API endpoint and control plane for multiple AI providers, models, local inference runtimes, and routing policies.

## Primary product purpose

Let any compatible client call one Mooncripsy endpoint. Mooncripsy authenticates the client, resolves the requested model or route, selects a configured upstream connection, forwards the request, normalizes the response, and applies bounded retry/fallback behavior where safe.

Users should not need to reconfigure every client when they change upstream providers. Their selected Mooncripsy model alias or route should remain stable while the upstream connection set evolves.

## Runtime separation

### AI Gateway — primary product

The gateway is the inference runtime. It must:
- Run headless without Electron or Chrome.
- Expose stable local HTTP APIs, starting with OpenAI-compatible /v1/models and /v1/chat/completions.
- Support official API providers, generic OpenAI-compatible endpoints, and local inference endpoints.
- Keep ingress protocols separate from upstream provider connectors.
- Manage provider connections, model metadata, model aliases, routes/combos, client keys, and routing decisions.
- Provide bounded routing, retry, fallback, health, usage, and cost/quota observability as those capabilities are implemented.
- Bind to loopback by default and authenticate clients.

### Browser Workspace — separate existing product mode

The existing Playwright/CDP coding-agent workflow remains available as an independent user-directed workspace. It includes:
- Per-provider and per-account Chrome profiles.
- User login and authentication verification.
- Conversation creation, send, response reading, resume and recovery.
- Local project files, process execution, tool approvals, transcript export.
- Existing image/music workflows and artifacts.

Browser Workspace constraints:
- It is not an OpenAI-compatible API upstream.
- It is not part of gateway model pools or automatic fallback.
- Website cookies, local storage, HAR files, and browser session tokens are not exported into gateway credentials.
- Browser profile/account records are distinct from API provider connections and credential references.
- Its workflows remain independent from the gateway lifecycle.

## Current gateway implementation boundary

The experimental gateway MVP currently provides:
- GET /healthz
- GET /v1/models
- POST /v1/chat/completions including upstream SSE pass-through.
- Mooncripsy client bearer authentication.
- Multiple configurable OpenAI-compatible upstream connections.
- Environment-backed upstream credential references.
- Explicit model lists or /models discovery.
- Priority selection and bounded fallback for retryable upstream failures.
- Loopback-only default binding.

Not yet implemented:
- User-editable model aliases and routing combos.
- Weighted, round-robin, cost-aware, quota-aware, and latency-aware routing.
- Full provider catalog and native Anthropic/Gemini adapters.
- Native OpenAI Responses, Anthropic Messages, and Gemini client-facing ingress.
- OS credential vault integration and UI-based client-key management.
- Usage accounting, pricing/quota telemetry, and dashboard screens.
- Supported OAuth/CLI subscription connectors.

## Core domain concepts

- **Ingress protocol**: client request protocol accepted by Mooncripsy.
- **Provider**: upstream vendor or compatible service type and its protocol capabilities.
- **Connection**: one configured upstream endpoint and operational state.
- **Account**: identity attached to a connection where the provider supports multiple accounts.
- **CredentialRef**: reference to a secret held in a protected store, not the secret itself.
- **Model**: upstream model ID plus normalized capabilities and metadata.
- **Alias**: stable Mooncripsy-facing model name.
- **Route/Combo**: ordered or weighted eligible connections/models and routing rules.
- **ClientKey**: downstream key used by tools to call Mooncripsy.
- **Usage/Health record**: timestamped operational metadata with known source/confidence.

## Product principles

1. **One endpoint for clients.** Clients integrate with Mooncripsy, not every upstream separately.
2. **Local-first.** The gateway runs on the user's machine or self-hosted infrastructure.
3. **Provider-neutral core.** Ingress translation, routing policy, upstream connectors, persistence, and UI have clear boundaries.
4. **Transparent routing.** Show which connection/model served a request and why a fallback occurred.
5. **No fabricated quota or price.** Unknown, estimated, stale, and provider-reported values must be distinguished.
6. **Secure by default.** Separate upstream secrets from client keys; redact credentials; loopback binding by default.
7. **Browser profiles stay separate.** Existing Playwright profiles and sessions are preserved but not transformed into API credentials.
8. **Incremental compatibility.** Start with a stable OpenAI-compatible API, then add other ingress protocols and providers through tested adapters.
9. **No free/unlimited promise.** Provider tiers, pricing, quotas, and capabilities change and must be represented accurately.

## MVP success criteria

A user can start the gateway headless, connect an official or OpenAI-compatible upstream plus a local model, point a standard client at one Mooncripsy base URL, and call a model through authenticated /v1/chat/completions. A deterministic route can fail over to another eligible connection on a retryable failure, while the existing Browser Workspace and its profiles remain intact.
