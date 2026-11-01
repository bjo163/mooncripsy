# moncripsy

Turn ChatGPT Web (including Pro) into Codex.
Turn Claude Web into Claude Code.

Also DeepSeek, Gemini, Grok, Kimi, GLM.

No API key. No MCP. No tunnel. No plugin.

https://xixian42.github.io/moncripsy/

[中文](#中文)

## Quick start

Requires Node.js 20.x ≥20.17, 22.x ≥22.13, or ≥23.5, and Chrome/Chromium. moncripsy supports macOS, Linux, native Windows, and preview support for WSL2 with WSLg. WSL1 and external X11 configurations are best effort.

On WSL, install the Linux Chrome/Chromium package inside the distribution and launch moncripsy from WSL. moncripsy keeps file and command execution in the WSL environment and connects to that Linux browser over local CDP. Display environment variables are only configuration hints; actual GUI availability is confirmed when Chrome starts. Windows-host Chrome is not supported from WSL yet.

```bash
pnpm add --global moncripsy
```

Open a working directory and start moncripsy:

```bash
mkdir moncripsy-demo
cd moncripsy-demo
moncripsy
```

After login, interactive runs give you five seconds to choose a model in the browser. Press Enter to continue immediately, or wait to keep the current selection. Then type a task:

```text
$ moncripsy
you › Create hello.js that writes "Hello from moncripsy" to hello.txt. Run it with Node.js and verify the result.
```

moncripsy creates the files in the current directory, runs the script locally, and checks its output. You can continue chatting in the same terminal after the task finishes.

Choose a provider with `--model` (ChatGPT is the default). Supported values are `chatgpt`, `claude`, `deepseek`, `gemini`, `grok`, `kimi`, and `glm`:

```bash
moncripsy --model claude "inspect this project and summarize its architecture"
moncripsy --model gemini "inspect this project and summarize its architecture"
```

### Generate and save images

Use ChatGPT, Gemini, or Grok to generate images in the current conversation. No
extra image flag is needed; describe the image in your task:

```bash
moncripsy --model chatgpt --once "Generate a square illustration of a blue robot watering a plant. Save it locally."
moncripsy --model gemini --once "Generate a 16:9 watercolor city skyline and save the image locally."
moncripsy --model grok --once "Generate a minimalist landscape illustration and save it locally."
```

moncripsy waits for the completed image reply, downloads its images, checks their
format and dimensions, and records SHA-256 hashes. Supported file formats are
PNG, JPEG, and WebP. Files are saved under the current project's
`artifacts/native-images/<turn-id>/`, for example:

```text
artifacts/native-images/<turn-id>/image-1.png
artifacts/native-images/<turn-id>/image-2.webp
```

The extension follows the downloaded file's actual format. Multiple images from
one reply are saved separately. moncripsy passes the verified local paths back to
the model, which can finish the task or continue with file operations such as
organizing assets and building a page that uses them.

In an interactive conversation, attach a local reference image with `@path`:

```text
you › @assets/reference.png Create a watercolor illustration based on this reference and save it locally.
```

Reference handling, image size, aspect ratio, and image availability depend on
the website and selected model. moncripsy uses your logged-in account and its
quota. A text-only explanation or refusal is returned as text; it is not reported
as a saved image.

If downloading or returning the saved paths is interrupted, resume the recorded
session without adding a new instruction:

```bash
moncripsy resume <session-id>
```

Recovery reuses the recorded reply when it can verify the conversation. It does
not automatically repeat an image-generation request whose submission is
uncertain. Partially downloaded replies may need to download their files again.

### Generate music with Gemini

```bash
moncripsy --model gemini --type music --once "Create peaceful instrumental piano music, no vocals"
```

`--type music` selects Gemini's native Music tool. Tracks are saved under
`artifacts/music/<turn-id>/`. If Gemini returns an MP4 with audio and a cover
video, moncripsy preserves that original; when `ffmpeg` is on PATH, it also extracts
an `.m4a` audio file without re-encoding. Without FFmpeg, the original MP4 remains
usable. Duration follows the provider's output.

Download interruptions can be resumed with `moncripsy resume <session-id>`. A bare
resume of a completed music session returns its saved result without generating
again. The default `--type agent` retains ordinary agent behavior, including
native image output.

### Conversation recovery and diagnostics

The ChatGPT adapter supports legacy and modern message layouts, temporary
conversation URLs, and virtualized history. When a send cannot be verified,
moncripsy preserves the session for recovery. Structural failure reports identify
the recognized page layout, missing identity fields, and send stage; the CLI
shows the report path for startup, send-confirmation, and recovery failures.
When ChatGPT truncates a collapsed long message, moncripsy expands the latest
user message before verifying its send marker. Recovery checks the existing
reply without automatically resending a message whose commit is uncertain.
ChatGPT sends wait for an enabled Send button, including the modern composer
layout. A click failure does not trigger a second submission through Enter.
Structural reports also record whether Send is enabled and a draft is present,
without including the draft text.

Claude keeps the model selected by claude.ai in its browser profile; moncripsy does not override it.
Gemini likewise keeps the model selected in its browser profile.

If the provider is not signed in, moncripsy opens its dedicated Chrome profile and asks you to sign in. Each provider has an independent profile, and your task continues automatically after login.

moncripsy itself does not require an API key. It uses your own web account, available models, and quota.

You can also provide the first task directly:

```bash
moncripsy "create hello.js, run it, and verify the output"
```

Multiline paste and `↑` / `↓` input history are supported. Press `Ctrl+C` or `Ctrl+D` to exit.

### Desktop app

The repository includes a local desktop app. It uses Electron for
the desktop shell, React/Vite with TypeScript for the UI, React Router for
in-app routes, and local shadcn-style UI components. It reuses moncripsy's
existing browser runtime; it is not a Next.js web service or an API router.

```bash
pnpm install
pnpm desktop
```

The desktop app has Projects, Sessions, Accounts, and Settings pages. Packaged
Windows builds use a per-user installer and do not require Node.js to be
installed. Chrome or Chromium must be installed separately; browser binaries,
login credentials, and account profiles are not bundled. For a local
development build, Node.js and pnpm are required.

Build the unsigned Windows installer with:

```bash
pnpm --filter @moncripsy/desktop dist:win
```

The installer does not require administrator privileges. Windows may show a
publisher warning because release artifacts are unsigned. Uninstalling keeps
the app's local data. The default browser profile is shared with the CLI and
cannot be removed. Removing an additional account deletes its local login
profile after confirmation, but keeps session history; a saved session can be
explicitly linked to another account for the same provider before continuing.
Recent project folders are stored locally, with missing folders marked as
unavailable. Provider limits still apply, and accounts are never rotated
automatically.

The desktop workbench can search saved sessions by task, project, or session
ID, filter by provider and recovery/error state, and progressively show older
results. Conversation activity is read from the local session event log, so
tool and recovery history remains visible after a reload. Assistant messages
support safe Markdown rendering; links open externally only over HTTP(S).
Session transcripts can be exported locally as Codex or Claude Code JSONL using
the native save dialog. Settings includes an explicit setup check for browser,
storage, and configured profiles; it does not send prompts or verify login
without using the account-specific Verify action.
