import { useState } from 'react';
import { Text } from 'react-native';
import { changePassword } from '@/api/auth';
import { useSession } from '@/auth/session';
import { Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { colors } from '@/theme';

/** Shown first when an admin set a temporary password: nothing else opens until it is replaced. */
export default function ChangePassword() {
  const { reload, signOut } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      await reload(); // mustChangePassword is now off: the app opens
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Change password</Title>
      <Text style={{ color: colors.muted }}>Your password was set by an admin. Choose your own to continue.</Text>
      <Field label="Current password" value={current} onChangeText={setCurrent} secure />
      <Field label="New password" value={next} onChangeText={setNext} secure onSubmitEditing={submit} />
      <ErrorText message={error} />
      <Button title="Change password" onPress={submit} busy={busy} disabled={!current || !next} />
      <Button title="Sign out" tone="plain" onPress={() => void signOut()} disabled={busy} />
    </Screen>
  );
}
