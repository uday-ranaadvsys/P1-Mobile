import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button, type ButtonTone } from '@/components/Button';
import { Field } from '@/components/Field';
import { SheetModal } from '@/components/SheetModal';
import { ErrorText } from '@/components/Text';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/**
 * A confirmation that asks for a reason (the web's Cancel and Restore boxes): a title, what will happen, the reason
 * (optional, with a few quick choices), and two buttons. The server's refusal is shown inside it.
 */
export function ReasonSheet({ visible, title, description, label, placeholder, suggestions = [], confirmText, cancelText, tone = 'primary', busy, error, extra, required, onConfirm, onClose }: {
  visible: boolean; title: string; description: string; label: string; placeholder: string; suggestions?: readonly string[];
  confirmText: string; cancelText: string; tone?: ButtonTone; busy: boolean; error: string | null;
  /** Anything to show under the description (the "Edit instead" link). */
  extra?: ReactNode;
  /** A reason must be typed before the confirm button works. */
  required?: boolean;
  onConfirm: (reason: string) => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [reason, setReason] = useState('');
  // Each time it opens it starts empty.
  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);
  return (
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={busy ? () => undefined : onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <Text style={styles.body}>{description}</Text>
            {extra}
            {suggestions.length > 0 ? (
              <View style={styles.chips}>
                {suggestions.map((s) => (
                  <Pressable key={s} onPress={() => setReason(s)} accessibilityRole="button" style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}>
                    <Text style={[type.subhead, { color: colors.ink }]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Field label={label} value={reason} onChangeText={setReason} placeholder={placeholder} multiline autoCapitalize="sentences" />
            <ErrorText message={error} />
          </ScrollView>
          <View style={styles.buttons}>
            <Button title={cancelText} tone="secondary" style={{ flex: 1 }} onPress={onClose} disabled={busy} />
            <Button title={confirmText} tone={tone} style={{ flex: 1 }} onPress={() => onConfirm(reason.trim())} busy={busy} disabled={Boolean(required) && !reason.trim()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, maxHeight: '85%', padding: spacing.lg, gap: spacing.md, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    title: { ...type.title3, color: c.ink },
    body: { ...type.body, color: c.ink },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: c.outline, justifyContent: 'center' },
    buttons: { flexDirection: 'row', gap: spacing.md },
  });
