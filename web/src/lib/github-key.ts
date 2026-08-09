/**
 * GitHub App private key loader.
 *
 * Resolution order (called lazily inside functions — never at module scope so
 * Railway builds succeed before data/ or env vars exist):
 *
 * 1. GITHUB_APP_PRIVATE_KEY env var:
 *    - If the value contains "-----BEGIN", treat it as a PEM string and
 *      normalize any literal two-char `\n` sequences to real newlines
 *      (Railway's Variables UI sometimes stores them that way).
 *    - Otherwise treat the value as a base64-encoded PEM and decode it.
 *    - Surrounding whitespace and quotes are stripped in both cases.
 * 2. File at GITHUB_APP_PRIVATE_KEY_PATH, or <dataDir>/github-app.pem.
 *
 * Returns null when neither source is available or readable.
 */

import fs from "fs";
import path from "path";

export function loadGithubPrivateKey(dataDir: string): string | null {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY;
  if (raw) {
    const trimmed = raw.trim().replace(/^["']|["']$/g, "");
    if (trimmed.includes("-----BEGIN")) {
      // PEM passed directly — normalize escaped newlines from Railway/env files.
      return trimmed.replace(/\\n/g, "\n");
    }
    // Assume base64-encoded PEM.
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8");
      return decoded || null;
    } catch {
      return null;
    }
  }

  // Fall back to file on disk.
  const pemPath =
    process.env.GITHUB_APP_PRIVATE_KEY_PATH ?? path.join(dataDir, "github-app.pem");
  try {
    return fs.readFileSync(pemPath, "utf8");
  } catch {
    return null;
  }
}
