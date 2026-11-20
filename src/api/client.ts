import { APP_CLIENT } from 'floman-shared/constants';
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

/** How long a request may take before the app says it can't reach the server. */
const REQUEST_TIMEOUT_MS = 15000;

// The one message the app writes itself: the phone never reached the server, so there is no server text.
export const UNREACHABLE = "Can't reach the server. Check your connection.";

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
type Envelope<T> = { success?: boolean; data?: T; message?: string; meta?: Meta; error?: { code: string; message: string; details?: unknown } };

/** What a list answers beside its rows: the page, the total and the cards' counts. */
export type Meta = { page: number; limit: number; total: number; totalPages: number; stats?: Record<string, number> } & Record<string, unknown>;

/** Calls the API with the saved token and returns `data` and the server's `message` (if any). A 401 on a signed-in call signs the user out. */
export async function apiWithMessage<T>(path: string, { method = 'GET', body, login = false }: Options = {}): Promise<{ data: T; message: string | null; meta: Meta | null }> {
  const token = hooks.getToken();
  let res: Response;
  // A server that does not answer must not leave the app waiting for ever (the splash screen would never go): give up after a while.
  const timer = new AbortController();
  const giveUp = setTimeout(() => timer.abort(), REQUEST_TIMEOUT_MS);
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
    throw new ApiError(0, 'NETWORK', UNREACHABLE);
  } finally {
    clearTimeout(giveUp);
  }
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.success) {
    if (res.status === 401 && token && !login) hooks.onSignedOut();
    // Most errors are { error: { message } }; a few routes (the GSTIN lookup) answer with a plain { message }.
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? json?.message ?? UNREACHABLE, json?.error?.details);
  }
  return { data: json.data as T, message: json.message ?? null, meta: json.meta ?? null };
}

/** Same call, returning only `data`. */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  return (await apiWithMessage<T>(path, options)).data;
}
