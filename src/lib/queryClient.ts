import { QueryClient } from '@tanstack/react-query';

/** One cache for the app. It is cleared on sign-out (features/auth/session.tsx). */
export const queryClient = new QueryClient();
