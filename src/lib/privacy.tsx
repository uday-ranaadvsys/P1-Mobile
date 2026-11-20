import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { formatINR } from '@/lib/format';

/**
 * Privacy mode (the eye): hides money and party names on screen, as on the web. On purpose it is not
 * saved: it is off again when the app is opened (web memory: "Hide totals is screen-only").
 */
type Privacy = { hidden: boolean; toggle: () => void };
const Ctx = createContext<Privacy>({ hidden: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const toggle = useCallback(() => setHidden((h) => !h), []);
  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePrivacy = () => useContext(Ctx);

const MASK = '••••';

/** Text that is hidden in privacy mode: a party's name, an amount already written out. */
export function useHide() {
  const { hidden } = usePrivacy();
  return {
    hidden,
    text: (value: string) => (hidden ? MASK : value),
    rupees: (value: number) => (hidden ? `₹ ${MASK}` : formatINR(value)),
  };
}
