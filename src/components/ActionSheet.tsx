import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Text } from '@/components/AppText';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** `disabled` + `hint`: shown greyed with the reason underneath (the web's greyed menu entry with a hint on hover). */
export type SheetAction = { label: string; onPress: () => void; destructive?: boolean; disabled?: boolean; hint?: string };

/**
 * A row's actions in a bottom sheet (the web's ⋮ menu): each is 52 pt tall, a destructive one is red, and a circled X at the top
 * right closes it. Android's alert can only show three buttons, so menus with more use this.
 */
export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title?: string; actions: SheetAction[]; onClose: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  return (
    <SheetModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={1}>{title ?? ''}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}>
              <Ionicons name="close-circle" size={30} color={colors.muted} />
            </Pressable>
          </View>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                if (a.disabled) return;
                onClose();
                a.onPress();
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(a.disabled) }}
              style={({ pressed }) => [styles.row, a.disabled && { opacity: 0.45 }, pressed && !a.disabled && { opacity: 0.6 }]}
            >
              <Text style={[styles.rowText, a.destructive && { color: colors.danger }]}>{a.label}</Text>
              {a.disabled && a.hint ? <Text style={styles.hint}>{a.hint}</Text> : null}
            </Pressable>
          ))}
        </View>
      </View>
    </SheetModal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: spacing.lg, paddingTop: spacing.sm },
    head: { minHeight: 48, justifyContent: 'center' },
    title: { ...type.footnoteBold, color: c.muted, textAlign: 'center', paddingHorizontal: 56 },
    close: { position: 'absolute', right: spacing.sm, top: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    row: { minHeight: 52, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    rowText: { ...type.body, color: c.ink },
    hint: { ...type.footnote, color: c.muted, textAlign: 'center', marginTop: 2 },
  });
