import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useSession } from '@/auth/session';
import { Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { colors } from '@/theme';

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
      <Text style={{ color: colors.muted }}>Sign in to your company</Text>
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
