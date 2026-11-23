import { APP_CLIENT } from 'floman-shared/constants';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL } from './config';

/** The server's error body is { success: false, error: { code, message, details? } }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** How long a read may take before the app says it can't reach the server. */
const REQUEST_TIMEOUT_MS = 15000;
/**
 * A save may take longer: approving a GRN or an invoice moves stock and ledgers on the server. Giving up too soon would
 * show an error for something the server then finishes (and a second Save would make it twice).
 */
const WRITE_TIMEOUT_MS = 60000;

// The one message the app writes itself: the phone never reached the server, so there is no server text.
export const UNREACHABLE = "Can't reach the server. Check your connection.";
// The other one: the phone reached the server, but it has not answered yet, so the save may still go through.
export const TOO_SLOW = 'The server is taking longer than usual. Check the list before saving again, so it is not saved twice.';

/** The error for a call that did not come back: it ran out of time (the server may still finish), or never got there. */
const noAnswer = (timer: AbortController) => (timer.signal.aborted ? new ApiError(0, 'TIMEOUT', TOO_SLOW) : new ApiError(0, 'NETWORK', UNREACHABLE));

type Hooks = { getToken: () => string | null; onSignedOut: () => void };
let hooks: Hooks = { getToken: () => null, onSignedOut: () => {} };
export const configureClient = (next: Hooks) => {
  hooks = next;
};

/**
 * A file the server holds (a logo): its address is relative to the server's own address, and it needs the sign-in,
 * so an Image gets both. `url` is as the API saved it ("/uploads/…").
 */
export function mediaSource(url: string | null | undefined): { uri: string; headers: Record<string, string> } | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  const token = hooks.getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (/^(https?:|data:)/.test(trimmed)) return { uri: trimmed, headers };
  const origin = API_URL.replace(/\/api\/v1\/?$/, '');
  return { uri: `${origin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`, headers };
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; login?: boolean };
type Envelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  meta?: Meta;
  /** The shape the web's lists use: the page, the total and the pages here, the cards' counts in `meta.stats` or `kpiCounts`. */
  pagination?: { total: number; page: number; limit: number; totalPages: number };
  kpiCounts?: Record<string, number | null>;
  /** The Purchases list sends its cards' counts here. */
  stats?: Record<string, number | null>;
  error?: { code: string; message: string; details?: unknown };
};

/** What a list answers beside its rows: the page, the total and the cards' counts. */
export type Meta = { page: number; limit: number; total: number; totalPages: number; stats?: Record<string, number> } & Record<string, unknown>;

/** Calls the API with the saved token and returns `data` and the server's `message` (if any). A 401 on a signed-in call signs the user out. */
export async function apiWithMessage<T>(path: string, { method = 'GET', body, login = false }: Options = {}): Promise<{ data: T; message: string | null; meta: Meta | null }> {
  const token = hooks.getToken();
  let res: Response;
  // A server that does not answer must not leave the app waiting for ever (the splash screen would never go): give up after a while.
  const timer = new AbortController();
  const giveUp = setTimeout(() => timer.abort(), method === 'GET' ? REQUEST_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  try {
    res = await fetch(`${API_URL}${path}`, {
      signal: timer.signal,
      method,
      headers: {
        'Content-Type': 'application/json',
        [APP_CLIENT.HEADER]: APP_CLIENT.MOBILE,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw noAnswer(timer);
  } finally {
    clearTimeout(giveUp);
  }
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.success) {
    if (res.status === 401 && token && !login) hooks.onSignedOut();
    // Most errors are { error: { message } }; a few routes (the GSTIN lookup) answer with a plain { message }.
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? json?.message ?? UNREACHABLE, json?.error?.details);
  }
  return { data: json.data as T, message: json.message ?? null, meta: metaOf(json) };
}

/**
 * What a list answers beside its rows, as one `meta`: the page, total and pages, and the cards' counts as `stats`. The
 * Masters lists send all of it in `meta`; the web's document lists send `pagination` (and `meta.stats` or `kpiCounts`).
 */
function metaOf(json: Envelope<unknown>): Meta | null {
  if (!json.meta && !json.pagination && !json.kpiCounts && !json.stats) return null;
  return {
    ...json.pagination,
    ...json.meta,
    ...((json.kpiCounts ?? json.stats) && !json.meta?.stats ? { stats: (json.kpiCounts ?? json.stats) as Record<string, number> } : {}),
  } as Meta;
}

/** A PDF takes the server a few seconds (it makes it in a browser of its own), so it may take longer than other calls. */
const FILE_TIMEOUT_MS = 60000;

/**
 * A file the API makes (a document's PDF), as bytes. The sign-in goes with it as for any call; a refusal (too many PDFs
 * a minute, not found) comes as the server's own words.
 */
export async function apiFile(path: string): Promise<ArrayBuffer> {
  const token = hooks.getToken();
  const timer = new AbortController();
  const giveUp = setTimeout(() => timer.abort(), FILE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      signal: timer.signal,
      headers: { [APP_CLIENT.HEADER]: APP_CLIENT.MOBILE, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (res.ok) return await res.arrayBuffer();
  } catch {
    throw noAnswer(timer);
  } finally {
    clearTimeout(giveUp);
  }
  const json = (await res.json().catch(() => null)) as Envelope<unknown> | null;
  if (res.status === 401 && token) hooks.onSignedOut();
  throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? json?.message ?? UNREACHABLE, json?.error?.details);
}

/** Same call, returning only `data`. */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  return (await apiWithMessage<T>(path, options)).data;
}

/** What the upload route answers for a saved file (its path and link). */
export type UploadedFile = { filename: string; originalName: string; path: string; url: string; size?: number; mimeType?: string };

/**
 * Sends one file picked or photographed on the phone to the server (POST /uploads, field "file") and returns what the
 * server saved. The sign-in goes with it; a refusal (too large, not allowed) comes as the server's own words.
 */
export async function apiUpload(file: { uri: string; name: string; mimeType: string }): Promise<UploadedFile> {
  const token = hooks.getToken();
  // The phone's own uploader (not fetch + FormData, which Android can drop for a photo it just saved).
  let res: FileSystem.FileSystemUploadResult;
  try {
    res = await FileSystem.uploadAsync(`${API_URL}/uploads`, file.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: file.mimeType,
      headers: { [APP_CLIENT.HEADER]: APP_CLIENT.MOBILE, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch (e) {
    if (__DEV__) console.warn('Upload failed:', e);
    throw new ApiError(0, 'NETWORK', UNREACHABLE);
  }
  let json: Envelope<UploadedFile> | null = null;
  try {
    json = JSON.parse(res.body) as Envelope<UploadedFile>;
  } catch {
    json = null;
  }
  if (res.status < 200 || res.status >= 300 || !json?.success || !json.data) {
    if (res.status === 401 && token) hooks.onSignedOut();
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? json?.message ?? UNREACHABLE, json?.error?.details);
  }
  return json.data;
}
