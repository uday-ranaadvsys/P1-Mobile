import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { formatMoney } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/**
 * A section of a long form that folds: a header you tap (title, a one-line summary while it is folded, an arrow) and
 * the fields below it. The fields stay in place when folded (only hidden), so nothing typed or picked is lost.
 * `bare`: the body is not put on the card.
 */
export function FoldCard({ title, summary, open, onToggle, bare, children }: { title: string; summary?: string; open: boolean; onToggle: () => void; bare?: boolean; children: ReactNode }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  return (
    <View style={bare ? { gap: spacing.md } : styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${open ? 'open' : 'folded'}`}
        style={({ pressed }) => [styles.head, bare && styles.headCard, pressed && { opacity: 0.6 }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {!open && summary ? <Text style={styles.summary} numberOfLines={1}>{summary}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.muted} />
      </Pressable>
      {/* Hidden, not removed: the fields keep what was typed and the form can still find them. */}
      <View style={[bare ? { gap: spacing.md } : styles.body, !open && { display: 'none' }]}>{children}</View>
    </View>
  );
}

/** Which sections of a form are open. */
export type FoldSection = 'vendor' | 'items' | 'tax' | 'notes';

/** The form's sections that start open: a new document starts at its vendor; an edit starts folded. */
export const NEW_FOLDS: Record<FoldSection, boolean> = { vendor: true, items: false, tax: false, notes: false };
export const EDIT_FOLDS: Record<FoldSection, boolean> = { vendor: false, items: false, tax: false, notes: false };

/**
 * The open / folded state of a form's sections. `reveal(anchor, scrollTo)` opens the section a field is in, then
 * scrolls to it (a mistake found on save must not stay hidden behind a fold).
 */
export function useFolds(initial: Record<FoldSection, boolean>) {
  const [open, setOpen] = useState(initial);
  const toggle = useCallback((section: FoldSection) => setOpen((o) => ({ ...o, [section]: !o[section] })), []);
  const show = useCallback((section: FoldSection) => setOpen((o) => (o[section] ? o : { ...o, [section]: true })), []);
  /** A line's anchor belongs to the Items; every other field to the vendor section (its custom fields included). */
  const reveal = useCallback(
    (anchor: string, scrollTo: (anchor: string) => unknown) => {
      show(anchor.startsWith('line:') ? 'items' : 'vendor');
      // The section needs a moment to show before its field can be measured.
      setTimeout(() => scrollTo(anchor), 150);
    },
    [show],
  );
  return { open, toggle, show, reveal };
}

export type Folds = ReturnType<typeof useFolds>;

/** The Items header's summary: how many items and what they come to ("3 items · ₹48,200.00"). */
export function useItemsSummary(count: number, total: number) {
  const hide = useHide();
  return `${count} ${count === 1 ? 'item' : 'items'} · ${hide.hidden ? hide.rupees(0) : formatMoney(total)}`;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, overflow: 'hidden' },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    headCard: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline },
    title: { ...type.headline, color: c.ink },
    summary: { ...type.footnote, color: c.muted },
    body: { gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  });
