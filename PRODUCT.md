# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers using the Electron desktop app to delegate coding work to web-based AI providers.

## Product Purpose

Let developers start and continue coding tasks in local project folders with a coding agent that uses an existing signed-in provider account. Success means users can choose a project and account, delegate work, follow the conversation, and review or approve tool actions.

## Positioning

moncripsy connects web AI accounts to local project files and commands without requiring an API key, hosted service, MCP server, tunnel, or provider plugin.

## Operating Context

Users work in local project directories. The desktop app reuses moncripsy's browser runtime and existing provider login profiles. Users may need to recover interrupted sessions, switch a saved session to another account for the same provider, inspect tool activity, and export transcripts.

## Capabilities and Constraints

- The desktop app provides Projects, Sessions, Accounts, and Settings surfaces.
- Project file access and command execution remain local; prompts and returned context go to the selected provider.
- Provider access and usage limits apply. Accounts are selected explicitly and are never rotated automatically.
- Keep all existing workflows, actions, states, and accessibility behavior intact during visual redesign.
- The desktop shell is Electron with a React, Vite, and TypeScript renderer.

## Brand Commitments

The product name is moncripsy. Do not change product identity, factual product claims, or provider terminology as part of visual work.

## Evidence on Hand

- Product documentation: [README.md](./README.md).
- Existing working desktop UI and tests in `apps/desktop/` and `test/`.
- No customer testimonials, benchmarks, or third-party endorsements are supplied.

## Product Principles

- Keep project files and command execution local.
- Make the selected provider account and its limits clear.
- Preserve user control over sessions, account selection, and tool approvals.
- Keep recovery and saved history understandable and available.
