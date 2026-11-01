import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { replaceFileAtomic } from "../shared/atomic-write.js";
import { ensureDirectory, getProfileDir } from "../platform/paths.js";
import { isPathInside } from "../policy/path-guard.js";
import {
  getProvider,
  getProviderProfileDir,
  listActiveProviderIds,
} from "./provider-registry.js";

const ACCOUNT_FILE = "provider-accounts.json";
const accountSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  providerId: z.string().min(1),
  label: z.string().min(1).max(80),
  isDefault: z.boolean(),
  createdAt: z.string().datetime(),
}).strict();
const accountFileSchema = z.object({
  version: z.literal(1),
  accounts: z.array(accountSchema),
}).strict();

function defaultAccount(providerId) {
  const provider = getProvider(providerId);
  return {
    id: `default-${provider.id}`,
    providerId: provider.id,
    label: `${provider.label} (default)`,
    isDefault: true,
    createdAt: new Date(0).toISOString(),
  };
}

function profileDirFor(appDataDir, account) {
  return account.isDefault
    ? getProviderProfileDir(appDataDir, account.providerId)
    : getProfileDir(
      appDataDir,
      path.join("account-profiles", account.providerId, account.id),
    );
}

export class ProviderAccountStore {
  constructor({ appDataDir }) {
    this.appDataDir = path.resolve(appDataDir);
    this.filePath = path.join(this.appDataDir, ACCOUNT_FILE);
    this.mutationQueue = Promise.resolve();
  }

  async list() {
    let accounts;
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      accounts = accountFileSchema.parse(parsed).accounts;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(`Could not read provider accounts: ${error.message}`, {
          cause: error,
        });
      }
      accounts = [];
    }

    let changed = false;
    for (const providerId of listActiveProviderIds()) {
      if (!accounts.some((account) => account.providerId === providerId && account.isDefault)) {
        accounts.push(defaultAccount(providerId));
        changed = true;
      }
    }
    if (changed || !(await fileExists(this.filePath))) {
      await this.#save(accounts);
    }

    return accounts.map((account) => ({
      ...account,
      profileDir: profileDirFor(this.appDataDir, account),
    }));
  }

  async create({ providerId, label }) {
    return await this.#serializeMutation(async () => {
      const provider = getProvider(providerId);
      if (provider.status !== "active") {
        throw new Error(`Provider "${provider.id}" is not available for new accounts.`);
      }
      const normalizedLabel = String(label ?? "").trim();
      if (normalizedLabel.length < 1 || normalizedLabel.length > 80) {
        throw new Error("Account label must contain between 1 and 80 characters.");
      }

      const accounts = await this.list();
      const account = {
        id: randomUUID(),
        providerId: provider.id,
        label: normalizedLabel,
        isDefault: false,
        createdAt: new Date().toISOString(),
      };
      const profileDir = profileDirFor(this.appDataDir, account);
      await ensureDirectory(profileDir);
      await this.#save([
        ...accounts.map(({ profileDir: _profileDir, ...stored }) => stored),
        account,
      ]);
      return { ...account, profileDir };
    });
  }

  async get(accountId) {
    if (typeof accountId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(accountId)) {
      throw new Error("Invalid account ID.");
    }
    const account = (await this.list()).find((item) => item.id === accountId);
    if (!account) {
      throw new Error(`Provider account not found: ${accountId}`);
    }
    return account;
  }

  /**
   * @returns {Promise<{accountId: string, profileCleanupError: string | null}>}
   */
  async deleteCustom(accountId) {
    return await this.#serializeMutation(async () => {
    const accounts = await this.list();
    const account = accounts.find((item) => item.id === accountId);
    if (!account) {
      throw new Error(`Provider account not found: ${accountId}`);
    }
    if (account.isDefault) {
      throw new Error("Default provider accounts cannot be deleted.");
    }

    const profileRoot = path.resolve(this.appDataDir, "account-profiles");
    const expectedProfileDir = path.resolve(
      profileRoot,
      account.providerId,
      account.id,
    );
    const profileDir = path.resolve(account.profileDir);
    if (
      profileDir !== expectedProfileDir
      || !isPathInside(profileRoot, profileDir)
      || profileDir === profileRoot
    ) {
      throw new Error("Provider account profile path is outside its managed directory.");
    }

    for (const directory of [
      profileRoot,
      path.dirname(profileDir),
      profileDir,
    ]) {
      try {
        const stat = await fs.lstat(directory);
        if (stat.isSymbolicLink()) {
          throw new Error(`Refusing to delete a provider profile through a symbolic link: ${directory}`);
        }
        if (!stat.isDirectory()) {
          throw new Error(`Provider profile path is not a directory: ${directory}`);
        }
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }

    let stagedProfileDir = null;
    try {
      await fs.lstat(profileDir);
      stagedProfileDir = path.join(
        path.dirname(profileDir),
        `.deleting-${account.id}-${randomUUID()}`,
      );
      await fs.rename(profileDir, stagedProfileDir);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    try {
      await this.#save(accounts
        .filter((item) => item.id !== account.id)
        .map(({ profileDir: _profileDir, ...stored }) => stored));
    } catch (error) {
      if (stagedProfileDir) {
        try {
          await fs.rename(stagedProfileDir, profileDir);
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            `Could not remove provider account metadata or restore its profile directory: ${profileDir}`,
          );
        }
      }
      throw error;
    }

    if (stagedProfileDir) {
      try {
        await fs.rm(stagedProfileDir, { recursive: true, force: true });
        return { accountId: account.id, profileCleanupError: null };
      } catch (error) {
        return {
          accountId: account.id,
          profileCleanupError:
            `Account metadata was removed, but local profile cleanup failed at ${stagedProfileDir}: ${error.message}`,
        };
      }
    }

    return { accountId: account.id, profileCleanupError: null };
    });
  }

  async #serializeMutation(operation) {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return await result;
  }

  async #save(accounts) {
    const validated = accountFileSchema.parse({ version: 1, accounts });
    await ensureDirectory(this.appDataDir);
    const temporary = `${this.filePath}.${process.pid}-${randomUUID()}.tmp`;
    try {
      await fs.writeFile(
        temporary,
        `${JSON.stringify(validated, null, 2)}\n`,
        { mode: 0o600 },
      );
      await replaceFileAtomic(temporary, this.filePath);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => null);
    }
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
