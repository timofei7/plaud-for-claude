/** Raw API response types from Plaud */

export interface PlaudTranscriptSegment {
  speaker: string;
  content: string;
  start_time: number; // ms
  end_time: number;   // ms
}

export interface PlaudRecording {
  id: string;
  filename: string;
  duration: number;      // ms
  filesize: number;
  start_time: number;    // epoch ms (created)
  is_trash: number;      // 0 or 1
  is_trans: number;      // 0 or 1
  is_summary: number;    // 0 or 1
  trans_result: PlaudTranscriptSegment[];
  ai_content: string | AiContentJson;
  summary_list?: string[];
  filetag_id_list: string[];
  outline_result?: unknown;
  task_id_info?: unknown;
  serial_number?: string;
  keywords?: string[];
}

export interface PlaudRecordingListResponse {
  data_file_list: PlaudRecording[];
}

export interface PlaudTempUrlResponse {
  temp_url?: string;
  url?: string;
  data?: { url?: string };
}

/** AI content can arrive in many shapes */
export type AiContentJson = {
  markdown?: string;
  summary?: string;
  content?: { markdown?: string };
};

/** Local config types */

export interface AuthConfig {
  email: string;
  region: 'us' | 'eu';
  token: string;
  issuedAt: number;
  expiresAt: number;
}

export interface SyncedRecording {
  hash: string;
  file: string;
}

export interface SyncConfig {
  vaultPath: string;
  folderName: string;
  downloadAudio: boolean;
  syncedRecordings: Record<string, SyncedRecording>;
}

export interface AppConfig {
  auth?: AuthConfig;
  sync: SyncConfig;
}
