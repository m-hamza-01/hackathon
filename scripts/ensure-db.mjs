/**
 * Copies seed/foreman.db → data/foreman.db on first deploy.
 * Never overwrites an existing DB — safe to call on every boot.
 */

import { copyFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
const seedDb = path.join(root, "seed", "foreman.db");
const dataDir = path.join(root, "data");
const dataDb = path.join(dataDir, "foreman.db");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (await exists(dataDb)) {
  console.log(`[ensure-db] ${dataDb} already exists — skipping seed copy.`);
} else {
  console.log(`[ensure-db] No DB found at ${dataDb} — copying seed DB.`);
  await mkdir(dataDir, { recursive: true });
  await copyFile(seedDb, dataDb);
  console.log(`[ensure-db] Seed DB copied to ${dataDb}.`);
}
