import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
export const serverDir = dirname(__filename);
export const projectDir = join(serverDir, '..');

function loadEnvFromFile() {
  const envPath = join(projectDir, '.env');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFromFile();

const tokenSecret = process.env.TOKEN_SECRET;
if (!tokenSecret) {
  throw new Error('TOKEN_SECRET is required. Set it in .env before starting the server.');
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

function parseFrontendOrigins() {
  const primary = String(process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const extra = String(process.env.FRONTEND_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set([...primary, ...extra])];
}

const frontendOrigins = parseFrontendOrigins();

export const config = {
  exposeDevTokens: process.env.EXPOSE_DEV_TOKENS === 'true',
  frontendOrigin: frontendOrigins[0] ?? 'http://localhost:5173',
  frontendOrigins,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    `http://localhost:${Number(process.env.PORT ?? 8787)}/api/auth/google/callback`,
  port: Number(process.env.PORT ?? 8787),
  tokenSecret
};
