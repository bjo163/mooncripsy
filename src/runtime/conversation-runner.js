import path from "node:path";
import {
  createWebAdapter,
  DEFAULT_PROVIDER,
  resolveProvider,
} from "../browser/provider-registry.js";
import { NativeImageReceiver } from "../image/native-image-receiver.js";
import {
  NativeMusicReceiver,
  validateGenerationType,
} from "../audio/native-music-receiver.js";
import { resolveRuntimePaths } from "../platform/runtime-paths.js";
import { formatHomePath } from "../platform/paths.js";
import { AgentRuntime } from "./agent-runtime.js";
import { PolicyEngine } from "../policy/policy-engine.js";
import { ApprovalStore } from "../policy/approval-store.js";
import { createDefaultToolRegistry } from "../tools/default-tools.js";
import { ProcessManager } from "../tools/process-manager.js";
import { resolveLimits } from "../shared/limits.js";

export class ConversationRunner {
  constructor({
    session,
    options,
    interactive = false,
    onEvent = null,
    onApproval = null,
    onAuthReady = null,
    renderer = null,
  }) {
    this.session = session;
    this.options = options;
    const provider = resolveProvider(session.state.provider ?? DEFAULT_PROVIDER);
    this.provider = provider;
    this.interactive = interactive;
    this.paths = resolveRuntimePaths(options, provider.id);
    this.limits = resolveLimits({
      modelTurnTimeoutMs: options.modelTurnTimeoutMs,
    });
    this.processManager = new ProcessManager();
    this.renderer = renderer ?? {
      handle() {},
      stopSpinner() {},
      finish() {},
    };
    this.onEvent = onEvent;
    this.onApproval = onApproval;
    this.onAuthReady = onAuthReady;
    this.approvalStore = new ApprovalStore({
      filePath: path.join(this.session.directory, "approvals.json"),
    });
    this.adapter = createWebAdapter({
      provider,
      profileDir: this.paths.profileDir,
      chromePath: options.chromePath,
      debug: options.debug,
      minimized: options.minimize !== false,
      cancelOnEsc: interactive,
    });
    const generationType = validateGenerationType(session.state.generationType, provider.id);
    this.nativeMusicReceiver = generationType === "music"
      ? new NativeMusicReceiver({ adapter: this.adapter })
      : null;
    this.nativeImageReceiver = this.nativeMusicReceiver
      ? null
      : NativeImageReceiver.forAdapter(provider.id, this.adapter);
    this.interrupted = false;
    this.closed = false;
  }

  #buildRuntime() {
    return new AgentRuntime({
      adapter: this.adapter,
      nativeImageReceiver: this.nativeImageReceiver,
      nativeMusicReceiver: this.nativeMusicReceiver,
      registry: createDefaultToolRegistry({
        processManager: this.processManager,
        limits: this.limits,
      }),
      policy: new PolicyEngine({ store: this.approvalStore }),
      session: this.session,
      limits: this.limits,
      postAuthSetup: this.interactive ? this.onAuthReady : null,
      approval: async ({ toolCall, reasons }) => {
        this.renderer.stopSpinner();
        if (!this.onApproval) {
          throw new Error("No tool approval handler has been configured.");
        }
        return await this.onApproval({
          toolCall,
          reasons,
          approvalStore: this.approvalStore,
        });
      },
      onEvent: async (event) => {
        await this.onEvent?.(event);
        this.renderer.handle(event);
      },
    });
  }

  async runTurn({
    resume,
    instruction,
    files = [],
    inPlaceRecovery = false,
    mode = null,
  }) {
    const runtime = this.#buildRuntime();
    try {
      return await runtime.run({
        resume,
        instruction,
        files,
        inPlaceRecovery,
        mode,
      });
    } catch (error) {
      if (this.interrupted) {
        await this.session.update({
          phase: "interrupted",
          lastError: "Interrupted by user.",
        });
        await this.session.appendEvent("run.interrupted", {
          message: "Interrupted by user.",
        });
        return null;
      }
      if (error?.code === "TURN_CANCELLED") {
        this.renderer.stopSpinner();
        await this.session.update({
          phase: "interrupted",
          lastError: "Turn cancelled by user.",
        });
        await this.session.appendEvent("run.turn_cancelled", {
          message: "Turn cancelled by user.",
        });
        return { cancelled: true, error };
      }
      if (error?.code === "EMPTY_ASSISTANT_RETRIES_EXHAUSTED") {
        await this.session.update({
          phase: "awaiting_user",
          lastError: error.message,
        });
        const event = await this.session.appendEvent("run.recovery_required", {
          message: error.message,
          retries: error.details?.retries ?? null,
        });
        this.renderer.handle(event);
        return { recoveryRequired: true, error };
      }
      if (this.session.state.phase !== "idle") {
        await this.session.update({
          phase: "interrupted",
          lastError: error.message,
        });
        await this.session.appendEvent("run.interrupted", {
          message: error.message,
        });
      }
      throw error;
    }
  }

  async close({ keepBrowser = false } = {}) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.renderer.finish();
    await this.processManager.stopAll().catch(() => {});
    if (keepBrowser) {
      if (!this.adapter.cdpChrome) {
        return;
      }
      await this.adapter.detach().catch((error) => {
        console.error(`Warning: ${error.message}`);
      });
      console.log(
        "The run failed; Chrome was left open for debugging. "
          + "Inspect the page and close it manually, or just run "
          + "`moncripsy resume` again — it will reuse the same window.",
      );
      return;
    }
    await this.adapter.close().catch((error) => {
      console.error(`Warning: ${error.message}`);
    });
  }
}
