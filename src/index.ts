#!/usr/bin/env node

import { Command } from 'commander';
import { interactiveLogin, loadConfig, saveConfig } from './auth.js';
import { PlaudClient } from './client.js';
import { syncRecordings } from './sync.js';
import { formatDuration } from './formatter.js';

const program = new Command();

program
  .name('plaud-for-claude')
  .description('Sync Plaud AI voice recordings to Obsidian')
  .version('0.1.0');

program
  .command('login')
  .description('Log in with your Plaud email and password')
  .action(async () => {
    try {
      await interactiveLogin();
    } catch (err) {
      console.error('Login failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List recent recordings')
  .option('-n, --limit <number>', 'Max recordings to show', '20')
  .action(async (opts) => {
    const config = loadConfig();
    if (!config.auth) {
      console.error('Not logged in. Run: plaud-for-claude login');
      process.exit(1);
    }

    const client = new PlaudClient(config.auth);
    const recordings = await client.listRecordings(parseInt(opts.limit));

    if (recordings.length === 0) {
      console.log('No recordings found.');
      return;
    }

    console.log(`\n${'Date'.padEnd(12)} ${'Duration'.padEnd(10)} ${'T'.padEnd(3)} ${'S'.padEnd(3)} Title`);
    console.log('-'.repeat(70));

    for (const rec of recordings) {
      const date = new Date(rec.start_time).toISOString().slice(0, 10);
      const duration = formatDuration(rec.duration);
      const hasTrans = rec.is_trans ? 'Y' : ' ';
      const hasSumm = rec.is_summary ? 'Y' : ' ';
      console.log(`${date}  ${duration.padEnd(10)} ${hasTrans.padEnd(3)} ${hasSumm.padEnd(3)} ${rec.filename}`);
    }
    console.log(`\n${recordings.length} recordings (T=transcript, S=summary)`);
  });

program
  .command('sync')
  .description('Sync recordings to Obsidian vault')
  .option('--vault <path>', 'Obsidian vault path')
  .option('--folder <name>', 'Folder name within vault', 'Recordings')
  .option('--audio', 'Also download audio files')
  .action(async (opts) => {
    try {
      console.log('Syncing recordings...');
      const result = await syncRecordings({
        vaultPath: opts.vault,
        folderName: opts.folder,
        downloadAudio: opts.audio,
      });

      console.log(`\nDone: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged`);
      if (result.errors.length > 0) {
        console.error(`\n${result.errors.length} errors:`);
        for (const err of result.errors) {
          console.error(`  ${err}`);
        }
      }
    } catch (err) {
      console.error('Sync failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show or update configuration')
  .option('--vault <path>', 'Set Obsidian vault path')
  .option('--folder <name>', 'Set folder name within vault')
  .option('--audio <bool>', 'Enable/disable audio download')
  .action((opts) => {
    const config = loadConfig();

    if (opts.vault) config.sync.vaultPath = opts.vault;
    if (opts.folder) config.sync.folderName = opts.folder;
    if (opts.audio !== undefined) config.sync.downloadAudio = opts.audio === 'true';

    if (opts.vault || opts.folder || opts.audio) {
      saveConfig(config);
      console.log('Configuration updated.');
    }

    console.log('\nCurrent config:');
    console.log(`  Vault path:     ${config.sync.vaultPath || '(not set)'}`);
    console.log(`  Folder name:    ${config.sync.folderName}`);
    console.log(`  Download audio: ${config.sync.downloadAudio}`);
    console.log(`  Synced:         ${Object.keys(config.sync.syncedRecordings).length} recordings`);
    if (config.auth) {
      console.log(`  Logged in as:   ${config.auth.email} (${config.auth.region})`);
      console.log(`  Token expires:  ${new Date(config.auth.expiresAt).toLocaleDateString()}`);
    } else {
      console.log('  Auth:           not logged in');
    }
  });

program
  .command('mcp')
  .description('Start MCP server for Claude integration')
  .action(async () => {
    const { startMcpServer } = await import('./mcp.js');
    await startMcpServer();
  });

program.parse();
