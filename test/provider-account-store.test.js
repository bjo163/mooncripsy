import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProviderAccountStore } from "../src/browser/provider-account-store.js";
import { getProviderProfileDir } from "../src/browser/provider-registry.js";

async function fixture(t) {
  const appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "moncripsy-accounts-"));
  t.after(() => fs.rm(appDataDir, { recursive: true, force: true }));
  return { appDataDir, store: new ProviderAccountStore({ appDataDir }) };
}

test("provider account store seeds defaults at the legacy profile locations", async (t) => {
  const { appDataDir, store } = await fixture(t);
  const accounts = await store.list();
  const chatgpt = accounts.find((account) => account.providerId === "chatgpt");

  assert.ok(chatgpt);
  assert.equal(chatgpt.isDefault, true);
  assert.equal(chatgpt.profileDir, getProviderProfileDir(appDataDir, "chatgpt"));
  assert.equal(chatgpt.id, "default-chatgpt");
});

test("custom accounts for one provider have separate profile directories", async (t) => {
  const { appDataDir, store } = await fixture(t);
  const first = await store.create({ providerId: "chatgpt", label: "Personal" });
  const second = await store.create({ providerId: "chatgpt", label: "Work" });

  assert.notEqual(first.id, second.id);
  assert.notEqual(first.profileDir, second.profileDir);
  assert.equal(path.dirname(path.dirname(first.profileDir)), path.join(appDataDir, "account-profiles"));
  assert.equal((await store.get(first.id)).label, "Personal");
  assert.deepEqual(
    (await store.list()).filter((account) => !account.isDefault).map((account) => account.label),
    ["Personal", "Work"],
  );
});

test("provider account store rejects invalid providers and empty labels", async (t) => {
  const { store } = await fixture(t);
  await assert.rejects(
    store.create({ providerId: "unknown", label: "Personal" }),
    /Unknown model/,
  );
  await assert.rejects(
    store.create({ providerId: "chatgpt", label: " " }),
    /Account label must contain/,
  );
});

test("provider account store reports corrupt metadata instead of overwriting it", async (t) => {
  const { appDataDir, store } = await fixture(t);
  await fs.writeFile(
    path.join(appDataDir, "provider-accounts.json"),
    '{"version":99,"accounts":[]}\n',
  );

  await assert.rejects(store.list(), /Could not read provider accounts/);
});

test("custom account removal preserves defaults and removes only its profile", async (t) => {
  const { store } = await fixture(t);
  const account = await store.create({ providerId: "chatgpt", label: "Temporary" });

  await assert.rejects(store.deleteCustom("default-chatgpt"), /cannot be deleted|Default provider accounts/);
  const result = await store.deleteCustom(account.id);

  assert.equal(result.accountId, account.id);
  assert.equal(result.profileCleanupError, null);
  await assert.rejects(fs.stat(account.profileDir), { code: "ENOENT" });
  assert.ok((await store.list()).some((item) => item.id === "default-chatgpt"));
  await assert.rejects(store.get(account.id), /Provider account not found/);
});

test("custom account removal refuses a profile symlink", async (t) => {
  const { appDataDir, store } = await fixture(t);
  const account = await store.create({ providerId: "chatgpt", label: "Linked" });
  const externalDir = path.join(appDataDir, "outside-profile");
  await fs.mkdir(externalDir);
  await fs.writeFile(path.join(externalDir, "keep.txt"), "preserve");
  await fs.rm(account.profileDir, { recursive: true, force: true });

  try {
    await fs.symlink(externalDir, account.profileDir, "junction");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip("Symbolic links are not available in this Windows environment.");
      return;
    }
    throw error;
  }

  await assert.rejects(store.deleteCustom(account.id), /symbolic link/);
  assert.ok((await store.list()).some((item) => item.id === account.id));
  assert.equal(await fs.readFile(path.join(externalDir, "keep.txt"), "utf8"), "preserve");
});
