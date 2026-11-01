import path from "node:path";
import {
  DEFAULT_PROVIDER,
  getProviderProfileDir,
} from "../browser/provider-registry.js";
import {
  getAppDataDir,
  getSessionsDir,
  getTasksDir,
} from "./paths.js";

export function resolveRuntimePaths(options, providerId = DEFAULT_PROVIDER) {
  const appDataDir = path.resolve(options.home ?? getAppDataDir());
  return {
    appDataDir,
    profileDir: path.resolve(
      options.profileDir ?? getProviderProfileDir(appDataDir, providerId),
    ),
    sessionsDir: getSessionsDir(appDataDir),
    legacyTasksDir: getTasksDir(appDataDir),
  };
}
