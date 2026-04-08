import type { PlaudRecording, AiContentJson } from './types.js';

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function parseSummary(aiContent: string | AiContentJson | null | undefined): string {
  if (!aiContent) return '';
  if (typeof aiContent === 'string') {
    // Could be JSON string or plain markdown
    try {
      const parsed = JSON.parse(aiContent) as AiContentJson;
      return parseSummary(parsed);
    } catch {
      return aiContent.trim();
    }
  }
  // Object — check various shapes
  if (aiContent.markdown) return aiContent.markdown.trim();
  if (aiContent.summary) return aiContent.summary.trim();
  if (aiContent.content?.markdown) return aiContent.content.markdown.trim();
  return '';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function formatFilename(recording: PlaudRecording): string {
  const date = new Date(recording.start_time).toISOString().slice(0, 10);
  const slug = slugify(recording.filename || 'untitled');
  return `${date}_${slug}.md`;
}

export function formatMarkdown(recording: PlaudRecording): string {
  const date = new Date(recording.start_time).toISOString().slice(0, 10);
  const duration = formatDuration(recording.duration);
  const title = recording.filename || 'Untitled Recording';

  // Extract unique speakers
  const speakers = [
    ...new Set(
      (recording.trans_result ?? [])
        .map(s => s.speaker)
        .filter(Boolean)
    ),
  ];

  // Build frontmatter
  const frontmatter = [
    '---',
    `created: ${date}`,
    `modified: ${date}`,
    `plaud_id: "${recording.id}"`,
    `title: "${title.replace(/"/g, '\\"')}"`,
    `duration: ${duration}`,
  ];

  if (speakers.length > 0) {
    frontmatter.push('speakers:');
    for (const s of speakers) {
      frontmatter.push(`  - "${s.replace(/"/g, '\\"')}"`);
    }
  }

  frontmatter.push('tags:');
  frontmatter.push('  - plaud');
  frontmatter.push('---');

  const lines = [...frontmatter, ''];

  // Summary
  const summary = parseSummary(recording.ai_content);
  if (summary) {
    lines.push('## Summary', '', summary, '');
  }

  // Transcript
  const segments = recording.trans_result ?? [];
  if (segments.length > 0) {
    lines.push('## Transcript', '');
    for (const seg of segments) {
      const ts = formatTimestamp(seg.start_time);
      const speaker = seg.speaker ? `**${seg.speaker}** ` : '';
      const text = (seg.content ?? '').trim();
      if (text) {
        lines.push(`[${ts}] ${speaker}${text}`);
        lines.push('');
      }
    }
  } else {
    lines.push('*No transcript available.*', '');
  }

  return lines.join('\n');
}
