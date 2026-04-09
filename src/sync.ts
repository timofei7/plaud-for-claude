import { createHash } from 'node:crypto';
import { createWriteStream, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { PlaudClient } from './client.js';
import { loadConfig, saveConfig, isTokenExpired, isTokenExpiringSoon } from './auth.js';
import { formatMarkdown, formatFilename, transcriptFilename } from './formatter.js';
import type { PlaudRecording } from './types.js';

function contentHash(recording: PlaudRecording): string {
  const data = JSON.stringify({
    filename: recording.filename,
    start_time: recording.start_time,
    duration: recording.duration,
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

  if (isTokenExpired(config.auth)) {
    throw new Error('Token expired. Run: plaud-for-claude login');
  }

  if (isTokenExpiringSoon(config.auth)) {
    const days = Math.ceil((config.auth.expiresAt - Date.now()) / 86400000);
    console.warn(`Warning: token expires in ${days} days. Run 'plaud-for-claude login' to refresh.`);
  }

  const vaultPath = options?.vaultPath || config.sync.vaultPath;
  const folderName = options?.folderName || config.sync.folderName;
  const downloadAudio = options?.downloadAudio ?? config.sync.downloadAudio;

  if (!vaultPath) {
    throw new Error('No vault path configured. Run: plaud-for-claude config --vault <path>');
  }

  const outputDir = join(vaultPath, folderName);
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'transcripts'), { recursive: true });

  if (downloadAudio) {
    mkdirSync(join(outputDir, 'audio'), { recursive: true });
  }

  const client = new PlaudClient(config.auth);
  const listings = await client.listRecordings();

  // Filter to recordings that need syncing (new or potentially changed)
  const needsDetail = listings.filter(rec => rec.is_trans);

  // Fetch full details (with transcripts) in batches of 10
  const recordings: PlaudRecording[] = [];
  for (let i = 0; i < needsDetail.length; i += 10) {
    const batch = needsDetail.slice(i, i + 10);
    const details = await client.getRecordingDetails(batch.map(r => r.id));
    recordings.push(...details);
  }

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
      const { main, transcript } = formatMarkdown(rec);

      writeFileSync(filepath, main, 'utf-8');

      const recordingDate = new Date(rec.start_time);
      utimesSync(filepath, recordingDate, recordingDate);

      if (transcript) {
        const transFile = transcriptFilename(filename);
        const transPath = join(outputDir, 'transcripts', transFile);
        writeFileSync(transPath, transcript, 'utf-8');
        utimesSync(transPath, recordingDate, recordingDate);
      }

      if (downloadAudio) {
        const audioFile = join(outputDir, 'audio', filename.replace(/\.md$/, '.mp3'));
        const url = await client.getAudioUrl(rec.id);
        if (url) {
          const audioRes = await fetch(url);
          if (!audioRes.ok) {
            result.errors.push(`${rec.filename}: audio download failed (${audioRes.status})`);
          } else if (audioRes.body) {
            await pipeline(
              Readable.fromWeb(audioRes.body as import('node:stream/web').ReadableStream),
              createWriteStream(audioFile),
            );
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

      // Persist progress periodically
      if ((result.created + result.updated) % 10 === 0) {
        saveConfig(config);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${rec.filename}: ${msg}`);
    }
  }

  saveConfig(config);
  return result;
}
