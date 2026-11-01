import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function collectJavaScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ["node_modules", "dist"].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(fullPath));
    } else if (
      entry.isFile()
      && (entry.name.endsWith(".js") || entry.name.endsWith(".cjs"))
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

const roots = ["src", "scripts", "test", "apps/desktop"];
const files = [];
for (const root of roots) {
  try {
    files.push(...await collectJavaScriptFiles(root));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Syntax OK: ${files.length} files`);
