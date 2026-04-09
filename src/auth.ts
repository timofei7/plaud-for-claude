import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { AppConfig, AuthConfig, SyncConfig } from './types.js';
import { API_BASE } from './constants.js';

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

export function isTokenExpired(auth: AuthConfig): boolean {
  return Date.now() >= auth.expiresAt;
}

export function isTokenExpiringSoon(auth: AuthConfig): boolean {
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return auth.expiresAt - Date.now() < thirtyDays;
}

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

async function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    stdout.write(prompt);
    stdin.setRawMode?.(true);
    let password = '';
    const onData = (ch: Buffer) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r') {
        stdin.setRawMode?.(false);
        stdin.removeListener('data', onData);
        stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (c === '\x7f' || c === '\b') {
        password = password.slice(0, -1);
      } else if (c === '\x03') {
        process.exit(1);
      } else {
        password += c;
      }
    };
    stdin.on('data', onData);
  });
}

export function loginWithToken(token: string, region: 'us' | 'eu' = 'us'): AuthConfig {
  const jwt = decodeJwt(token);
  return {
    email: '(token login)',
    region,
    token,
    issuedAt: jwt.iat * 1000,
    expiresAt: jwt.exp * 1000,
  };
}

function parseRegion(input: string): 'us' | 'eu' {
  return input.trim().toLowerCase() === 'eu' ? 'eu' : 'us';
}

export async function interactiveLogin(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  const method = await rl.question('Login method (email/token) [email]: ');
  rl.close();

  let auth: AuthConfig;

  if (method.trim().toLowerCase() === 'token') {
    console.log('\nTo get your token:');
    console.log('  1. Open https://web.plaud.ai in Chrome and sign in');
    console.log('  2. Open DevTools (F12) → Network tab');
    console.log('  3. Click any request to api.plaud.ai');
    console.log('  4. Copy the Authorization header value (after "bearer ")\n');

    const rl2 = createInterface({ input: stdin, output: stdout });
    const token = await rl2.question('Paste token: ');
    const regionInput = await rl2.question('Region (us/eu) [us]: ');
    rl2.close();

    auth = loginWithToken(token.trim(), parseRegion(regionInput));
  } else {
    const rl2 = createInterface({ input: stdin, output: stdout });
    const email = await rl2.question('Plaud email: ');
    rl2.close();

    const password = await readPassword('Plaud password: ');

    const rl3 = createInterface({ input: stdin, output: stdout });
    const regionInput = await rl3.question('Region (us/eu) [us]: ');
    rl3.close();

    console.log('Logging in...');
    auth = await login(email.trim(), password.trim(), parseRegion(regionInput));
  }

  const config = loadConfig();
  config.auth = auth;
  saveConfig(config);

  const expiresDate = new Date(auth.expiresAt).toLocaleDateString();
  console.log(`Authenticated. Token expires ${expiresDate}.`);
}
