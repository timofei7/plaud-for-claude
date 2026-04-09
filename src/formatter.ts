import type { PlaudRecording, AiContentJson } from './types.js';

export function formatDuration(ms: number): string {
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
    try {
      const parsed = JSON.parse(aiContent) as AiContentJson;
      return parseSummary(parsed);
    } catch {
      return aiContent.trim();
    }
  }
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
  const slug = slugify(recording.filename || 'untitled') || 'recording';
  const idSuffix = recording.id.slice(0, 8);
  return `${date}_${slug}_${idSuffix}.md`;
}

export function transcriptFilename(mainFilename: string): string {
  return mainFilename.replace(/\.md$/, '_transcript.md');
}

export interface FormattedRecording {
  main: string;
  transcript: string | null;
}

export function formatMarkdown(recording: PlaudRecording): FormattedRecording {
  const date = new Date(recording.start_time).toISOString().slice(0, 10);
  const duration = formatDuration(recording.duration);
  const title = recording.filename || 'Untitled Recording';
  const mainFile = formatFilename(recording);
  const transFile = transcriptFilename(mainFile);
  const transNoteName = transFile.replace(/\.md$/, '');

  const speakers = [
    ...new Set(
      (recording.trans_result ?? [])
        .map(s => s.speaker)
        .filter(Boolean)
    ),
  ];

  // --- Main note ---
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

  const mainLines = [...frontmatter, ''];

  const summary = parseSummary(recording.ai_content);
  if (summary) {
    mainLines.push('## Summary', '', summary, '');
  }

  const segments = recording.trans_result ?? [];
  if (segments.length > 0) {
    mainLines.push(`## Transcript`, '', `![[${transNoteName}]]`, '');
  } else {
    mainLines.push('*No transcript available.*', '');
  }

  // --- Transcript note ---
  let transcript: string | null = null;
  if (segments.length > 0) {
    const transLines = [
      '---',
      `created: ${date}`,
      `parent: "[[${mainFile.replace(/\.md$/, '')}]]"`,
      'tags:',
      '  - plaud-transcript',
      '---',
      '',
    ];

    for (const seg of segments) {
      const ts = formatTimestamp(seg.start_time);
      const speaker = seg.speaker ? `**${seg.speaker}** ` : '';
      const text = (seg.content ?? '').trim();
      if (text) {
        transLines.push(`[${ts}] ${speaker}${text}`);
        transLines.push('');
      }
    }

    transcript = transLines.join('\n');
  }

  return { main: mainLines.join('\n'), transcript };
}
