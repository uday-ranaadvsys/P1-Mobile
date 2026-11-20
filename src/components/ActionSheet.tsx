import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

export type SheetAction = { label: string; onPress: () => void; destructive?: boolean };

/**
 * A row's actions in a bottom sheet (the web's ⋮ menu): each is 52 pt tall, a destructive one is red, and Cancel is
 * always the last. Android's alert can only show three buttons, so menus with more use this.
 */
export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title?: string; actions: SheetAction[]; onClose: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.rowText, a.destructive && { color: colors.danger }]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.row, styles.cancel, pressed && { opacity: 0.6 }]}>
            <Text style={[styles.rowText, { fontWeight: '700' }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: spacing.lg, paddingTop: spacing.sm },
    title: { ...type.footnoteBold, color: c.muted, textAlign: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    row: { minHeight: 52, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    rowText: { ...type.body, color: c.ink },
    cancel: { marginTop: spacing.xs },
  });
