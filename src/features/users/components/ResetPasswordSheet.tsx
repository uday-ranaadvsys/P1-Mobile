import { MIN_PASSWORD_LENGTH } from 'floman-shared/constants';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ErrorBanner } from '@/components/FormParts';
import { spacing, type, useThemed, type Colors } from '@/theme';
import { resetUserPassword, type AppUser } from '../api';
import { fullName } from '../text';

/**
 * Reset password, in the web's words: the admin types a temporary password for the user, who signs in with it and
 * must then choose their own. `onDone` gets the server's message.
 */
export function ResetPasswordSheet({ user, onDone, onClose }: { user: AppUser | null; onDone: (message: string) => void; onClose: () => void }) {
  const styles = useThemed(makeStyles);
  const [password, setPassword] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPassword('');
    setBanner(null);
  }, [user]);

  const submit = async () => {
    if (!user || password.length < MIN_PASSWORD_LENGTH) return;
    setBusy(true);
    setBanner(null);
    try {
      const { message } = await resetUserPassword(user.id, password);
      onDone(message ?? 'Temporary password set.');
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={user !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.help}>
            For {user ? fullName(user) || user.phoneNo : ''}. Give them this temporary password; they sign in with it and must then choose their own.
          </Text>
          <ErrorBanner message={banner} />
          <Field label="Temporary password" required secure value={password} onChangeText={setPassword} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} autoComplete="off" autoFocus onSubmitEditing={submit} />
          <View style={styles.buttons}>
            <Button title="Cancel" tone="secondary" style={{ flex: 1 }} onPress={onClose} disabled={busy} />
            <Button title="Set password" style={{ flex: 1 }} onPress={() => void submit()} busy={busy} disabled={password.length < MIN_PASSWORD_LENGTH} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, padding: spacing.lg, gap: spacing.md, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    title: { ...type.title3, color: c.ink },
    help: { ...type.subhead, color: c.muted },
    buttons: { flexDirection: 'row', gap: spacing.md },
  });
