import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSession } from '@/features/auth/session';
import { Button } from '@/components/Button';
import { ErrorText, Muted, Title } from '@/components/Text';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';

export default function Login() {
  const { signIn } = useSession();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Signed in: the layout opens the app. Several companies: choose one.
      if ((await signIn(identifier.trim(), password)) === 'chooseCompany') router.push('/choose-company');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>floman</Title>
      <Muted>Sign in to your company</Muted>
      <Field
        label="Email Address or Mobile Number"
        value={identifier}
        onChangeText={setIdentifier}
        keyboardType="email-address"
        textContentType="username"
      />
      <Field label="Password" value={password} onChangeText={setPassword} secure textContentType="password" onSubmitEditing={submit} />
      <ErrorText message={error} />
      <Button title="Sign in" onPress={submit} busy={busy} disabled={!identifier.trim() || !password} />
    </Screen>
  );
}
