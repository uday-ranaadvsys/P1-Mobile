import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as authApi from '@/features/auth/api';
import { ApiError, configureClient } from '@/api/client';
import type { Company, SessionUser, Workspace } from '@/features/auth/api';

// The 30-day token lives in the phone's secure storage, never in plain storage.
const TOKEN_KEY = 'floman.token';
const EXPIRES_KEY = 'floman.expiresAt';

type Status = 'loading' | 'out' | 'in' | 'unreachable';
export type SignInResult = 'signedIn' | 'chooseCompany';

type Session = {
  status: Status;
  user: SessionUser | null;
  workspace: Workspace | null;
  companies: Company[];
  signIn: (identifier: string, password: string, company?: string) => Promise<SignInResult>;
  /** After "Choose company": signs in again with the same login and the picked company. */
  pickCompany: (company: string) => Promise<SignInResult>;
  /** Back from "Choose company" to the login form. */
  cancelChoice: () => void;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  can: (permission: string) => boolean;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const token = useRef<string | null>(null);
  // Kept in memory only, to sign in again after "Choose company" (the server needs the password again).
  const pending = useRef<{ identifier: string; password: string } | null>(null);

  const queryClient = useQueryClient();

  const clear = useCallback(async () => {
    token.current = null;
    queryClient.clear(); // the next sign-in must never see this user's cached lists
    pending.current = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(EXPIRES_KEY);
    setUser(null);
    setWorkspace(null);
    setCompanies([]);
    setStatus('out');
  }, [queryClient]);

  useEffect(() => {
    configureClient({ getToken: () => token.current, onSignedOut: () => void clear() });
  }, [clear]);

  const reload = useCallback(async () => {
    setStatus('loading');
    const saved = await SecureStore.getItemAsync(TOKEN_KEY);
    const expiresAt = await SecureStore.getItemAsync(EXPIRES_KEY);
    if (!saved || (expiresAt && new Date(expiresAt) <= new Date())) return clear();
    token.current = saved;
    try {
      const data = await authApi.me();
      setUser(data.user);
      setWorkspace(data.workspace);
      setStatus('in');
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setStatus('unreachable'); // keep the token: try again
      else await clear();
    }
  }, [clear]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const signIn = useCallback<Session['signIn']>(async (identifier, password, company) => {
    const result = await authApi.login(identifier, password, company);
    if ('chooseCompany' in result) {
      pending.current = { identifier, password };
      setCompanies(result.chooseCompany);
      return 'chooseCompany';
    }
    token.current = result.token;
    pending.current = null;
    await SecureStore.setItemAsync(TOKEN_KEY, result.token);
    await SecureStore.setItemAsync(EXPIRES_KEY, result.expiresAt);
    setCompanies([]);
    setUser(result.user);
    setWorkspace(result.workspace);
    setStatus('in');
    return 'signedIn';
  }, []);

  const pickCompany = useCallback<Session['pickCompany']>(
    async (company) => {
      if (!pending.current) throw new Error('No sign-in in progress');
      return signIn(pending.current.identifier, pending.current.password, company);
    },
    [signIn],
  );

  const cancelChoice = useCallback(() => {
    pending.current = null;
    setCompanies([]);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout(); // cancels the token on the server
    } catch {
      // Offline: still sign out here.
    }
    await clear();
  }, [clear]);

  const value = useMemo<Session>(
    () => ({
      status, user, workspace, companies, signIn, pickCompany, cancelChoice, signOut, reload,
      can: (permission) => Boolean(user?.permissions.includes(permission)),
    }),
    [status, user, workspace, companies, signIn, pickCompany, cancelChoice, signOut, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}
