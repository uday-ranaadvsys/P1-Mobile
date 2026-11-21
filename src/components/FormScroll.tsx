import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { View } from 'react-native';

/** Just what is used of the ScrollView and of a View (their own types leave these out in this React Native version). */
type Scroller = { scrollTo: (to: { y: number; animated?: boolean }) => void; getInnerViewRef?: () => unknown };
type Anchor = { measureLayout: (relativeTo: unknown, onSuccess: (x: number, y: number) => void, onFail: () => void) => void };

type Api = { register: (name: string, node: Anchor | null) => void };
const FormScrollContext = createContext<Api | null>(null);

/**
 * A long form scrolls to the field that has an error (instead of repeating the message in a banner at the top).
 * The screen keeps `scrollRef` on its ScrollView, wraps it in `<FormScrollProvider value={api}>`, and calls
 * `scrollTo(name)`; each field that can fail sits in a `<ScrollAnchor name="...">`.
 */
export function useFormScroll() {
  const scrollRef = useRef<Scroller | null>(null);
  const anchors = useRef(new Map<string, Anchor>());
  const api = useMemo<Api>(
    () => ({
      register: (name, node) => {
        if (node) anchors.current.set(name, node);
        else anchors.current.delete(name);
      },
    }),
    [],
  );
  /** Scrolls so the field sits near the top; false when it is not on the screen (the caller then shows a banner). */
  const scrollTo = useCallback((name: string) => {
    const anchor = anchors.current.get(name);
    const scroller = scrollRef.current;
    const inner = scroller?.getInnerViewRef?.();
    if (!anchor || !scroller || !inner) return false;
    anchor.measureLayout(inner, (_x, y) => scroller.scrollTo({ y: Math.max(0, y - 90), animated: true }), () => undefined);
    return true;
  }, []);
  const toTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), []);
  return { scrollRef, api, scrollTo, toTop };
}

export const FormScrollProvider = FormScrollContext.Provider;

/** Marks a field so the form can scroll to it. Outside a form that scrolls to errors it changes nothing. */
export function ScrollAnchor({ name, children }: { name: string; children: ReactNode }) {
  const api = useContext(FormScrollContext);
  const node = useRef<unknown>(null);
  useEffect(() => {
    api?.register(name, node.current as Anchor);
    return () => api?.register(name, null);
  }, [api, name]);
  return (
    <View ref={node as never} collapsable={false}>
      {children}
    </View>
  );
}
