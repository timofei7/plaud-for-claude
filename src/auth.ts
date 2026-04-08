import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { AppConfig, AuthConfig, SyncConfig } from './types.js';

const CONFIG_DIR = join(homedir(), '.plaud-for-claude');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_SYNC: SyncConfig = {
  vaultPath: '',
  folderName: 'Recordings',
  downloadAudio: false,
  syncedRecordings: {},
};

export function loadConfig(): AppConfig {
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as AppConfig;
  } catch {
    return { sync: { ...DEFAULT_SYNC } };
  }
}

export function saveConfig(config: AppConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  chmodSync(CONFIG_FILE, 0o600);
}

function decodeJwt(token: string): { iat: number; exp: number } {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Invalid JWT');
  const json = Buffer.from(payload, 'base64url').toString('utf-8');
  return JSON.parse(json) as { iat: number; exp: number };
}

export function isTokenValid(auth: AuthConfig): boolean {
  const now = Date.now();
  // Refresh if within 30 days of expiry
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return auth.expiresAt - now > thirtyDays;
}

const API_BASE: Record<string, string> = {
  us: 'https://api.plaud.ai',
  eu: 'https://api-euc1.plaud.ai',
};

export async function login(email: string, password: string, region: 'us' | 'eu'): Promise<AuthConfig> {
  const url = `${API_BASE[region]}/auth/access-token`;
  const body = new URLSearchParams({ username: email, password });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json() as Record<string, unknown>;

  if (!res.ok || (data.status !== undefined && data.status !== 0)) {
    throw new Error(`Login failed: ${data.msg ?? data.detail ?? res.statusText}`);
  }

  const token = data.access_token as string;
  if (!token) throw new Error('No access token in response');

  const jwt = decodeJwt(token);

  return {
    email,
    region,
    token,
    issuedAt: jwt.iat * 1000,
    expiresAt: jwt.exp * 1000,
  };
}

export async function refreshToken(auth: AuthConfig, password: string): Promise<AuthConfig> {
  return login(auth.email, password, auth.region);
}

export async function interactiveLogin(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const email = await rl.question('Plaud email: ');
    const password = await rl.question('Plaud password: ');
    const regionInput = await rl.question('Region (us/eu) [us]: ');
    const region = (regionInput.trim().toLowerCase() === 'eu' ? 'eu' : 'us') as 'us' | 'eu';

    console.log('Logging in...');
    const auth = await login(email.trim(), password.trim(), region);

    const config = loadConfig();
    config.auth = auth;
    saveConfig(config);

    const expiresDate = new Date(auth.expiresAt).toLocaleDateString();
    console.log(`Logged in as ${email}. Token expires ${expiresDate}.`);
  } finally {
    rl.close();
  }
}
