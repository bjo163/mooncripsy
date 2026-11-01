import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getAppDataDir } from "../src/platform/paths.js";
import { discoverChromeExecutable } from "../src/platform/chrome-discovery.js";

test("new moncripsy home overrides the legacy environment variable", () => {
  const result = getAppDataDir(undefined, {
    env: {
      moncripsy_HOME: "/tmp/moncripsy-new",
      WEBAGENT_HOME: "/tmp/moncripsy-legacy",
    },
    platform: "linux",
    homeDir: "/home/tester",
    exists: () => false,
  });

  assert.equal(result, "/tmp/moncripsy-new");
});

test("legacy home remains a compatibility fallback", () => {
  const result = getAppDataDir(undefined, {
    env: { WEBAGENT_HOME: "/tmp/moncripsy-legacy" },
    platform: "linux",
    homeDir: "/home/tester",
    exists: () => false,
  });

  assert.equal(result, "/tmp/moncripsy-legacy");
});

test("fresh installs use the moncripsy application data directory", () => {
  const result = getAppDataDir(undefined, {
    env: {},
    platform: "linux",
    homeDir: "/home/tester",
    exists: () => false,
  });

  assert.equal(result, "/home/tester/.local/share/moncripsy");
});

test("an existing legacy moncripsy profile is reused without moving user data", () => {
  const legacySessions = "/home/tester/.local/share/webagent/sessions";
  const result = getAppDataDir(undefined, {
    env: {},
    platform: "linux",
    homeDir: "/home/tester",
    exists: (candidate) => candidate === legacySessions,
  });

  assert.equal(result, "/home/tester/.local/share/webagent");
});

test("moncripsy_CHROME_PATH overrides the legacy Chrome path", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "moncripsy-platform-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const current = path.join(directory, "current-chrome");
  const legacy = path.join(directory, "legacy-chrome");
  await Promise.all([
    fs.writeFile(current, ""),
    fs.writeFile(legacy, ""),
  ]);

  const result = discoverChromeExecutable(undefined, {
    env: {
      moncripsy_CHROME_PATH: current,
      WEBAGENT_CHROME_PATH: legacy,
    },
    platform: process.platform,
  });

  assert.equal(result, current);
});
