# Mooncripsy Gateway (MVP)

Mooncripsy Gateway is a headless local HTTP service. It is independent of the Electron renderer and independent of the existing Playwright browser-agent workspace.

## Current MVP surface

- \`GET /healthz\`
- \`GET /v1/models\`
- \`POST /v1/chat/completions\`
- OpenAI-compatible bearer authentication for clients
- Generic OpenAI-compatible upstream connections
- Explicit configured model lists or upstream \`/models\` discovery
- Priority-ordered upstream selection and bounded retry to the next eligible connection for retryable upstream failures
- SSE response pass-through

This is an early gateway foundation, not yet the complete smart router. Model aliases, editable route profiles, round-robin/weighted/quota-aware selection, detailed usage accounting, secure desktop credential vault integration, and additional ingress protocols are separate follow-up work.

## Start

Use Node.js 20.17+.

Set a random client key (this is the key tools use to call Mooncripsy):

\`\`\`bash
# Linux/macOS
export MOONCRIPSY_GATEWAY_API_KEY="$(openssl rand -hex 32)"
export MOONCRIPSY_GATEWAY_PORT=20128
\`\`\`

Configure an upstream. The upstream API key is read from a named environment variable; it is not stored in the provider configuration:

\`\`\`bash
export OPENAI_API_KEY="your-provider-key"
export MOONCRIPSY_UPSTREAMS_JSON='[
  {
    "id": "openai",
    "name": "OpenAI",
    "baseUrl": "https://api.openai.com/v1",
    "apiKeyEnv": "OPENAI_API_KEY",
    "models": ["gpt-4o-mini"],
    "priority": 10
  },
  {
    "id": "ollama",
    "name": "Ollama",
    "baseUrl": "http://127.0.0.1:11434/v1",
    "models": ["qwen2.5-coder:7b"],
    "priority": 20
  }
]'
pnpm gateway
\`\`\`

The first upstream configured with a smaller priority value is tried first. If a request fails with a retryable transport/server/rate-limit failure before a usable response is returned, the router can try the next eligible connection. It does not retry after streaming has been handed to the client.

For a single upstream, the shorter configuration is also supported:

\`\`\`bash
export MOONCRIPSY_UPSTREAM_BASE_URL="http://127.0.0.1:1234/v1"
export MOONCRIPSY_UPSTREAM_MODELS="local-model"
# Optional if the upstream requires a key:
export MOONCRIPSY_UPSTREAM_API_KEY="..."
pnpm gateway
\`\`\`

For Ollama and LM Studio, use the OpenAI-compatible endpoint they expose and omit the API key when authentication is not configured. Use models that are already available in the local runtime.

## Call the gateway

\`\`\`bash
curl http://127.0.0.1:20128/v1/models \
  -H "Authorization: Bearer $MOONCRIPSY_GATEWAY_API_KEY"

curl http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer $MOONCRIPSY_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello from Mooncripsy"}]
  }'
\`\`\`

Point an OpenAI-compatible SDK or client at \`http://127.0.0.1:20128/v1\` and set its API key to the Mooncripsy client key. Do not give that client the upstream provider key.

## Security defaults

- Binds to \`127.0.0.1\` by default.
- Requires a Mooncripsy client bearer key for all \`/v1\` routes.
- Requires \`MOONCRIPSY_ALLOW_REMOTE=1\` before binding beyond loopback; remote exposure also requires a protected network, TLS/reverse proxy, and a strong client key.
- Rejects upstream redirects to avoid silently forwarding upstream credentials to another origin.
- Does not log request bodies or credentials.
- Uses environment variable references for upstream secrets.
- Does not expose the Chrome CDP endpoint or Playwright control surface.

## Browser Workspace separation

The existing \`ConversationRunner → AgentRuntime → BaseWebAdapter → Playwright/CDP\` path remains separate. Its Chrome profiles are website login profiles, not upstream API credentials. Gateway requests do not read, export, or reuse browser cookies, local storage, HAR files, or subscription session tokens. Browser Workspace remains available independently and does not participate in gateway routing or fallback.

## Roadmap after this MVP

1. Typed provider/connection/model/route contracts and persistent config migrations.
2. Official Anthropic and Gemini upstream API connectors.
3. Model aliases and user-defined routing profiles.
4. Retry classification, per-account cooldowns, circuit breakers, and decision traces.
5. Secure OS credential vault and separate client key management.
6. Usage, quota, latency, and cost accounting.
7. Desktop control-plane integration.
8. Additional client ingress protocols and permission-reviewed OAuth/CLI connectors.
