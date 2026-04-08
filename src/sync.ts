import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PlaudClient } from './client.js';
import { loadConfig, saveConfig, isTokenValid } from './auth.js';
import { formatMarkdown, formatFilename } from './formatter.js';
import type { PlaudRecording } from './types.js';

function contentHash(recording: PlaudRecording): string {
  const data = JSON.stringify({
    trans_result: recording.trans_result,
    ai_content: recording.ai_content,
  });
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export interface SyncResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

export async function syncRecordings(options?: {
  vaultPath?: string;
  folderName?: string;
  downloadAudio?: boolean;
}): Promise<SyncResult> {
  const config = loadConfig();

  if (!config.auth) {
    throw new Error('Not logged in. Run: plaud-for-claude login');
  }

  if (!isTokenValid(config.auth)) {
    throw new Error('Token expired. Run: plaud-for-claude login');
  }

  // Apply overrides
  if (options?.vaultPath) config.sync.vaultPath = options.vaultPath;
  if (options?.folderName) config.sync.folderName = options.folderName;
  if (options?.downloadAudio !== undefined) config.sync.downloadAudio = options.downloadAudio;

  if (!config.sync.vaultPath) {
    throw new Error('No vault path configured. Run: plaud-for-claude config --vault <path>');
  }

  const outputDir = join(config.sync.vaultPath, config.sync.folderName);
  mkdirSync(outputDir, { recursive: true });

  const client = new PlaudClient(config.auth);
  const recordings = await client.listRecordings();

  const result: SyncResult = { created: 0, updated: 0, unchanged: 0, errors: [] };

  for (const rec of recordings) {
    try {
      const hash = contentHash(rec);
      const existing = config.sync.syncedRecordings[rec.id];

      if (existing && existing.hash === hash) {
        result.unchanged++;
        continue;
      }

      const filename = existing?.file ?? formatFilename(rec);
      const filepath = join(outputDir, filename);
      const markdown = formatMarkdown(rec);

      writeFileSync(filepath, markdown, 'utf-8');

      // Restore file timestamps to recording date
      const recordingDate = new Date(rec.start_time);
      const { utimesSync } = await import('node:fs');
      utimesSync(filepath, recordingDate, recordingDate);

      // Download audio if requested
      if (config.sync.downloadAudio) {
        const audioDir = join(outputDir, 'audio');
        mkdirSync(audioDir, { recursive: true });
        const audioFile = join(audioDir, filename.replace(/\.md$/, '.mp3'));
        if (!existsSync(audioFile)) {
          const url = await client.getAudioUrl(rec.id);
          if (url) {
            const audioRes = await fetch(url);
            const buffer = Buffer.from(await audioRes.arrayBuffer());
            writeFileSync(audioFile, buffer);
          }
        }
      }

      if (existing) {
        result.updated++;
        console.log(`  updated: ${filename}`);
      } else {
        result.created++;
        console.log(`  created: ${filename}`);
      }

      config.sync.syncedRecordings[rec.id] = { hash, file: filename };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${rec.filename}: ${msg}`);
    }
  }

  saveConfig(config);
  return result;
}
