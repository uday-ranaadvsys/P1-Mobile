import { useState } from 'react';
import { changePassword } from '@/features/auth/api';
import { useSession } from '@/features/auth/session';
import { Button } from '@/components/Button';
import { ErrorText, Muted, Title } from '@/components/Text';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';

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
      <Muted>Your password was set by an admin. Choose your own to continue.</Muted>
      <Field label="Current password" value={current} onChangeText={setCurrent} secure />
      <Field label="New password" value={next} onChangeText={setNext} secure onSubmitEditing={submit} />
      <ErrorText message={error} />
      <Button title="Change password" onPress={submit} busy={busy} disabled={!current || !next} />
      <Button title="Sign out" tone="secondary" onPress={() => void signOut()} disabled={busy} />
    </Screen>
  );
}
