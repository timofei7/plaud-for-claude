import type {
  AuthConfig,
  PlaudRecording,
  PlaudRecordingListResponse,
  PlaudRecordingDetailResponse,
  PlaudSpeaker,
  PlaudSpeakerListResponse,
  PlaudTag,
  PlaudTagListResponse,
  PlaudTempUrlResponse,
} from './types.js';

const API_BASE: Record<string, string> = {
  us: 'https://api.plaud.ai',
  eu: 'https://api-euc1.plaud.ai',
};

const BROWSER_HEADERS: Record<string, string> = {
  'Accept': '*/*',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': 'https://web.plaud.ai',
  'Referer': 'https://web.plaud.ai/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  'Sec-Fetch-Site': 'same-site',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
  'app-platform': 'web',
  'edit-from': 'web',
};

export class PlaudClient {
  private baseUrl: string;
  private token: string;
  private region: string;

  constructor(auth: AuthConfig) {
    this.baseUrl = API_BASE[auth.region];
    this.token = auth.token;
    this.region = auth.region;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    // Cache buster
    url.searchParams.set('r', Math.random().toString());

    const res = await fetch(url.toString(), {
      ...options,
      headers: {
        ...BROWSER_HEADERS,
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await res.json() as Record<string, unknown>;

    // Handle region redirect
    if (data.status === -302) {
      const domains = (data.data as Record<string, unknown>)?.domains as Record<string, string> | undefined;
      if (domains?.api) {
        this.baseUrl = domains.api.startsWith('http') ? domains.api : `https://${domains.api}`;
        this.region = this.baseUrl.includes('euc1') ? 'eu' : 'us';
        return this.request<T>(path, options);
      }
    }

    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${data.msg ?? res.statusText}`);
    }

    return data as T;
  }

  async listRecordings(limit = 200): Promise<PlaudRecording[]> {
    const all: PlaudRecording[] = [];
    let skip = 0;
    const pageSize = 50;

    while (skip < limit) {
      const params = new URLSearchParams({
        skip: skip.toString(),
        limit: Math.min(pageSize, limit - skip).toString(),
        is_trash: '0',
        sort_by: 'start_time',
        is_desc: 'true',
      });

      const res = await this.request<PlaudRecordingListResponse>(
        `/file/simple/web?${params}`
      );

      const recordings = res.data_file_list ?? [];
      if (recordings.length === 0) break;

      all.push(...recordings);
      skip += recordings.length;
      if (recordings.length < pageSize) break;
    }

    return all;
  }

  async getRecording(id: string): Promise<PlaudRecording> {
    const res = await this.request<PlaudRecordingDetailResponse>(`/file/${id}`);
    return res.data_file;
  }

  async getAudioUrl(id: string): Promise<string | null> {
    const res = await this.request<PlaudTempUrlResponse>(`/file/temp-url/${id}`);
    return res.temp_url ?? res.url ?? (res.data as Record<string, string> | undefined)?.url ?? null;
  }

  async listSpeakers(): Promise<PlaudSpeaker[]> {
    const res = await this.request<PlaudSpeakerListResponse>('/speaker/list');
    return res.data_speaker_list ?? [];
  }

  async listTags(): Promise<PlaudTag[]> {
    const res = await this.request<PlaudTagListResponse>('/filetag/');
    return res.data_filetag_list ?? [];
  }
}
