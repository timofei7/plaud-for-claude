import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './auth.js';
import { PlaudClient } from './client.js';
import { formatMarkdown, formatDuration } from './formatter.js';

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'plaud-for-claude', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'plaud_list_recordings',
        description: 'List recent Plaud voice recordings with date, duration, and title',
        inputSchema: {
          type: 'object' as const,
          properties: {
            limit: { type: 'number', description: 'Max recordings to return (default 20)' },
          },
        },
      },
      {
        name: 'plaud_get_transcript',
        description: 'Get the full transcript of a Plaud recording by ID, formatted as markdown with speaker labels and timestamps',
        inputSchema: {
          type: 'object' as const,
          properties: {
            recording_id: { type: 'string', description: 'The Plaud recording ID' },
          },
          required: ['recording_id'],
        },
      },
      {
        name: 'plaud_search_recordings',
        description: 'Search Plaud recordings by keyword in filename',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'Search term to match against recording titles' },
          },
          required: ['query'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const config = loadConfig();
    if (!config.auth) {
      return { content: [{ type: 'text', text: 'Not logged in. Run: plaud-for-claude login' }] };
    }

    const client = new PlaudClient(config.auth);
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    switch (request.params.name) {
      case 'plaud_list_recordings': {
        const limit = (args.limit as number) ?? 20;
        const recordings = await client.listRecordings(limit);
        const list = recordings.map(r => ({
          id: r.id,
          date: new Date(r.start_time).toISOString().slice(0, 10),
          duration: formatDuration(r.duration),
          title: r.filename,
          has_transcript: !!r.is_trans,
          has_summary: !!r.is_summary,
        }));
        return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
      }

      case 'plaud_get_transcript': {
        const id = args.recording_id as string;
        const details = await client.getRecordingDetails([id]);
        if (details.length === 0) {
          return { content: [{ type: 'text', text: 'Recording not found' }] };
        }
        const { main, transcript } = formatMarkdown(details[0]);
        const full = transcript ? main + '\n\n' + transcript : main;
        return { content: [{ type: 'text', text: full }] };
      }

      case 'plaud_search_recordings': {
        const query = (args.query as string).toLowerCase();
        const recordings = await client.listRecordings(200);
        const matches = recordings.filter(r =>
          r.filename.toLowerCase().includes(query)
        );
        const list = matches.map(r => ({
          id: r.id,
          date: new Date(r.start_time).toISOString().slice(0, 10),
          duration: formatDuration(r.duration),
          title: r.filename,
        }));
        return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }] };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
