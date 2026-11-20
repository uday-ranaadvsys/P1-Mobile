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

// The one message the app writes itself: the phone never reached the server, so there is no server text.
export const UNREACHABLE = "Can't reach the server. Check your connection.";

type Hooks = { getToken: () => string | null; onSignedOut: () => void };
let hooks: Hooks = { getToken: () => null, onSignedOut: () => {} };
export const configureClient = (next: Hooks) => {
  hooks = next;
};

type Options = { method?: 'GET' | 'POST'; body?: unknown; login?: boolean };
type Envelope<T> = { success?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } };

/** Calls the API with the saved token and returns `data`. A 401 on a signed-in call signs the user out. */
export async function api<T>(path: string, { method = 'GET', body, login = false }: Options = {}): Promise<T> {
  const token = hooks.getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
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
  }
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.success) {
    if (res.status === 401 && token && !login) hooks.onSignedOut();
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? UNREACHABLE, json?.error?.details);
  }
  return json.data as T;
}
