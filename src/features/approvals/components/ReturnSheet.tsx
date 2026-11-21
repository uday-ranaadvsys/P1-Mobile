import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ErrorText } from '@/components/Text';
import { Field } from '@/components/Field';
import { spacing, useThemed, type Colors } from '@/theme';

/** Asks why a document goes back. The server checks the remarks (at least 2 characters) and says so if not. */
export function ReturnSheet({ visible, title, busy, error, onClose, onSend }: {
  visible: boolean; title: string; busy: boolean; error: string | null; onClose: () => void; onSend: (remarks: string) => void;
}) {
  const styles = useThemed(makeStyles);
  const [remarks, setRemarks] = useState('');
  return (
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Field label="Remarks" value={remarks} onChangeText={setRemarks} multiline autoCapitalize="sentences" autoFocus />
          <ErrorText message={error} />
          <Button title="Return" onPress={() => onSend(remarks.trim())} busy={busy} disabled={!remarks.trim()} />
          <Button title="Cancel" tone="secondary" onPress={onClose} disabled={busy} />
        </View>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, padding: spacing.lg, gap: spacing.md, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    title: { fontSize: 18, fontWeight: '700', color: c.ink },
  });
