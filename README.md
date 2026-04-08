# plaud-for-claude

Sync [Plaud AI](https://www.plaud.ai/) voice recordings to an Obsidian vault as formatted markdown notes with speaker labels, timestamps, and AI summaries.

Also includes an MCP server so Claude can query your recordings directly.

> **Disclaimer**: This tool uses an unofficial, reverse-engineered Plaud API. It may break if Plaud changes their backend. Use at your own risk.

## Installation

```bash
npm install -g plaud-for-claude
```

Or run directly with npx:

```bash
npx plaud-for-claude <command>
```

Requires Node.js 22+.

## Quick Start

```bash
# 1. Log in with your Plaud credentials
plaud-for-claude login

# 2. Set your Obsidian vault path
plaud-for-claude config --vault "/path/to/your/obsidian/vault"

# 3. Sync recordings
plaud-for-claude sync
```

## CLI Commands

### `login`

Interactive login with your Plaud email and password. Stores a JWT token locally (`~/.plaud-for-claude/config.json`, mode 0600). Tokens last ~300 days.

If you use Google Sign-In on Plaud, you must first set a password via "Forgot Password" at [web.plaud.ai](https://web.plaud.ai).

### `list`

List recent recordings with date, duration, and transcript/summary status.

```bash
plaud-for-claude list              # default: 20 most recent
plaud-for-claude list --limit 50   # show more
```

### `sync`

Sync recordings to your Obsidian vault. Incremental — only creates/updates notes for new or changed recordings.

```bash
plaud-for-claude sync                           # use configured vault
plaud-for-claude sync --vault /path/to/vault    # override vault path
plaud-for-claude sync --folder "Meeting Notes"  # custom folder name (default: Recordings)
plaud-for-claude sync --audio                   # also download MP3 audio files
```

If you edit a transcript or speaker names on Plaud, the next sync detects the change and updates the Obsidian note.

### `config`

Show or update configuration.

```bash
plaud-for-claude config                        # show current config
plaud-for-claude config --vault /path/to/vault # set vault path
plaud-for-claude config --folder Recordings    # set folder name
plaud-for-claude config --audio true           # enable audio download
```

### `mcp`

Start the MCP server for Claude integration (see below).

## Obsidian Note Format

Each synced recording becomes a markdown note in your vault with this structure:

### Frontmatter

```yaml
---
created: 2026-04-07
modified: 2026-04-07
plaud_id: "abc123"
title: "Weekly Standup"
duration: 45m
speakers:
  - "Tim"
  - "Alice"
  - "Bob"
tags:
  - plaud
---
```

- `created` / `modified` — recording date, enables Obsidian's built-in sort-by-date
- `plaud_id` — unique recording ID for sync tracking
- `speakers` — automatically extracted from Plaud's speaker diarization
- `tags` — always includes `plaud` for easy filtering

### Summary

If Plaud generated an AI summary, it appears under a `## Summary` heading.

### Transcript

The full transcript with speaker labels and timestamps:

```
## Transcript

[0:00] **Tim** Let's start with the weekly standup.

[0:03] **Alice** Sure, I'll go first. We shipped the new feature yesterday.

[0:15] **Bob** I've been working on the database migration...
```

- Timestamps in `[MM:SS]` format from Plaud's diarization
- Speaker names bolded for visual distinction in Obsidian's reading view
- One segment per line with blank line spacing for readability

### Dataview Queries

With the [Dataview plugin](https://github.com/blacksmithgu/obsidian-dataview), you can query your recordings:

```dataview
TABLE speakers, duration, created
FROM "Recordings"
SORT created DESC
```

## MCP Server (Claude Integration)

The built-in MCP server lets Claude query your Plaud recordings directly.

### Setup

Add to your Claude Code config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "plaud": {
      "command": "npx",
      "args": ["plaud-for-claude", "mcp"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `plaud_list_recordings` | List recent recordings with date, duration, title |
| `plaud_get_transcript` | Get full formatted transcript by recording ID |
| `plaud_search_recordings` | Search recordings by keyword in title |

## How It Works

1. Authenticates with the Plaud API using email/password
2. Fetches your recording list with transcripts and AI summaries
3. For each recording, computes a content hash of the transcript + summary
4. Compares against previously synced hashes to detect new/changed recordings
5. Generates Obsidian-formatted markdown and writes to your vault
6. Sets file timestamps to the original recording date
7. Stores sync state for incremental updates

## Authentication

Credentials are stored in `~/.plaud-for-claude/config.json` with 0600 permissions (owner read/write only). The JWT token lasts approximately 300 days. When it expires, run `plaud-for-claude login` again.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
