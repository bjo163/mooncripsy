# ADR-0001: API-first gateway with a separate browser workspace

- **Status:** Proposed implementation baseline
- **Date:** 2026-11-01
- **Related:** GitHub issues #10, #11, #12, #13, #25

## Context

The repository currently contains a capable Playwright/CDP coding-agent workflow. Its ConversationRunner creates an AgentRuntime, which delegates provider interaction to BaseWebAdapter and a provider-specific website adapter. Chrome profiles hold interactive website login state. This is a browser-driven task runtime, not an API gateway.

The product direction is now a local-first AI gateway/router inspired by patterns in GPT4Free, 9Router, OmniRoute, LiteLLM, and CLIProxyAPI: compatible clients should call one Mooncripsy endpoint, while Mooncripsy selects and calls configured upstream connections.

Trying to turn the browser-agent runtime directly into a generic /v1 gateway would couple HTTP request semantics to website DOMs, conversation sessions, agent prompts, tool protocols, browser availability, and recovery state. It would also create a false equivalence between web login profiles and provider API credentials.

## Decision

### 1. Build the gateway as a headless service first

The gateway is a Node.js HTTP service that can start without Electron, Chrome, or a user session. The desktop application is a control plane that manages this service after its API contract stabilizes.

MVP local endpoint:
- Base URL: http://127.0.0.1:20128/v1
- GET /models
- POST /chat/completions
- /healthz outside the /v1 namespace

The first implementation uses OpenAI-compatible ingress and upstream APIs. Other ingress protocols are independent translators added after the first contract is stable.

### 2. Separate ingress protocol from upstream connector

A client-facing protocol adapter parses an inbound protocol and maps it to a canonical request. The router selects an eligible connection. An upstream connector maps the canonical request into that upstream's protocol and returns a canonical response/stream.

Conceptual request flow:

Client → Ingress Adapter → Client Auth/Policy → Canonical Request → Route Resolver → Connection Selection → Upstream Connector → Canonical Response → Ingress Serializer → Client

No HTTP handler should contain provider-specific API logic or browser DOM logic.

### 3. Keep the existing browser workspace independent

Retain the existing path:
ConversationRunner → AgentRuntime → BaseWebAdapter → Playwright/CDP → website

Keep Chrome profiles, saved sessions, recovery, local tools, tool approvals, and image/music workflows intact. Do not:
- Read/export Chrome cookies or local storage for gateway use.
- Treat a website profile as an API credential.
- Turn an arbitrary incoming /v1 request into a chat submitted to a consumer website.
- Include website sessions in API model pools or automatic fallback.
- Expose the CDP control endpoint outside loopback.

This preserves useful existing behavior while letting the gateway operate on machines with no browser.

### 4. Distinguish domain concepts

- **Provider:** vendor/protocol definition and connector capabilities.
- **Connection:** configured upstream endpoint, auth reference, priority, enabled state.
- **Account:** identity under a connection/provider when multiple identities are supported.
- **CredentialRef:** pointer to protected credential storage.
- **Model:** upstream model identifier and capability metadata.
- **Alias:** stable Mooncripsy-facing model name.
- **Route/Combo:** routing policy and candidate order/weights.
- **ClientKey:** downstream credential for applications calling Mooncripsy.
- **Ingress protocol:** OpenAI Chat Completions, later Responses, Anthropic Messages, Gemini API.
- **Upstream protocol:** OpenAI-compatible, native OpenAI, Anthropic, Gemini, local inference API, etc.

ClientKey and CredentialRef are different trust directions and must never be interchangeable.

### 5. Start with a modular monolith, not microservices

For a single-user/local-first MVP, keep one Node process and one repository:
- Gateway server.
- Router core.
- Upstream connectors.
- Configuration and credential abstraction.
- Usage/health persistence.
- CLI lifecycle commands.
- Electron control plane.
- Existing browser workspace kept as a separate module.

Do not introduce Kubernetes, a hosted control plane, remote database, message broker, or separate service fleet before scale or collaboration requirements justify them.

### 6. Secure defaults

- Loopback bind by default.
- Authenticated client API routes.
- Non-loopback listener requires explicit opt-in and protected network/TLS setup.
- Upstream secrets are read via secret references/environment for MVP; never serialize them into ordinary configuration.
- Never log authorization headers, keys, cookies, prompts, or completion bodies by default.
- Reject unsafe upstream redirects when credentials could be forwarded.
- Respect cancellation and bounded timeouts.
- Retry only failures known to be safe; do not retry after streamed content is committed to the client.

## Consequences

Positive:
- Clients use one stable base URL and need not know which provider is selected.
- Gateway can run headless and independently of browser profiles.
- New upstream integrations do not need changes to ingress handlers.
- The existing browser workspace remains useful and is not destabilized by gateway work.

Trade-offs:
- Provider capability normalization and protocol translation require explicit engineering.
- Native ingress protocols must be added for clients that cannot speak OpenAI-compatible APIs.
- Existing website login sessions do not automatically count as API provider connections.
- A dashboard cannot be the first deliverable; it depends on a working service and stable configuration API.

## Implementation sequence

1. Freeze the architecture and trust boundaries in this ADR.
2. Build and test the headless HTTP gateway with a mock-compatible upstream.
3. Implement provider/connection/model contracts and generic OpenAI-compatible connector.
4. Add official API and local inference connectors.
5. Add model aliases, user-defined routing combos, and selection strategies.
6. Add bounded fallback, cooldowns, circuit breakers, and route traces.
7. Add secure credential and client-key management.
8. Add usage/health telemetry and the Electron dashboard.
9. Evaluate OAuth/CLI account integrations individually; never reuse browser profile cookies as an API bridge.
