import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const installerPath = process.env.MONCRIPSY_DESKTOP_INSTALLER;

test("Windows installer installs, launches, and uninstalls without deleting app data", {
  skip: process.platform !== "win32" || !installerPath,
}, async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "moncripsy-installer-smoke-"));
  const installDir = path.join(tempDir, "installed-app");
  const appHome = path.join(tempDir, "user-data");
  const sentinelPath = path.join(appHome, "keep-after-uninstall.txt");
  await fs.mkdir(appHome);
  await fs.writeFile(sentinelPath, "user data must survive uninstall\n");
  let desktopProcess;

  t.after(async () => {
    try {
      if (desktopProcess && desktopProcess.exitCode === null) {
        desktopProcess.kill();
        await once(desktopProcess, "exit");
      }
      const uninstaller = path.join(installDir, "Uninstall moncripsy.exe");
      try {
        await fs.access(uninstaller);
        execFileSync(uninstaller, ["/S"], { timeout: 120_000, windowsHide: true });
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  execFileSync(path.resolve(installerPath), ["/S", `/D=${installDir}`], {
    timeout: 120_000,
    windowsHide: true,
  });

  const appExecutable = path.join(installDir, "moncripsy.exe");
  await fs.access(appExecutable);
  desktopProcess = spawn(appExecutable, [], {
    env: { ...process.env, moncripsy_HOME: appHome },
    stdio: "ignore",
    windowsHide: true,
  });
  await Promise.race([
    once(desktopProcess, "spawn"),
    once(desktopProcess, "error").then(([error]) => Promise.reject(error)),
  ]);
  const accountFile = path.join(appHome, "provider-accounts.json");
  const startupDeadline = Date.now() + 30_000;
  while (Date.now() < startupDeadline) {
    if (desktopProcess.exitCode !== null) {
      throw new Error(`Installed app exited during startup with code ${desktopProcess.exitCode}.`);
    }
    try {
      await fs.access(accountFile);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await delay(250);
    }
  }
  await fs.access(accountFile);
  desktopProcess.kill();
  await once(desktopProcess, "exit");

  const uninstallerPath = path.join(installDir, "Uninstall moncripsy.exe");
  await fs.access(uninstallerPath);
  execFileSync(uninstallerPath, ["/S"], {
    timeout: 120_000,
    windowsHide: true,
  });

  await assert.rejects(fs.access(appExecutable), { code: "ENOENT" });
  assert.equal(await fs.readFile(sentinelPath, "utf8"), "user data must survive uninstall\n");
  assert.ok(await fs.readFile(accountFile, "utf8"));
});
