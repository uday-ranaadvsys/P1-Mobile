import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text } from '@/components/AppText';
import { useSession } from '@/features/auth/session';
import { Button } from '@/components/Button';
import { ErrorText, Title } from '@/components/Text';
import { Screen } from '@/components/Screen';
import { radius, spacing, useColors } from '@/theme';

export default function ChooseCompany() {
  const { companies, pickCompany, cancelChoice } = useSession();
  const router = useRouter();
  const colors = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(workspace: string) {
    setBusy(workspace);
    setError(null);
    try {
      await pickCompany(workspace); // signed in: the layout opens the app
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Title>Choose company</Title>
      {companies.map((company) => (
        <Pressable
          key={company.workspace}
          onPress={() => void pick(company.workspace)}
          disabled={busy !== null}
          style={{
            backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, borderRadius: radius,
            padding: spacing.md, opacity: busy && busy !== company.workspace ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{company.name}</Text>
          {busy === company.workspace ? <Text style={{ color: colors.muted }}>Signing in…</Text> : null}
        </Pressable>
      ))}
      <ErrorText message={error} />
      <Button
        title="Back"
        tone="secondary"
        onPress={() => {
          cancelChoice();
          router.back();
        }}
        disabled={busy !== null}
      />
    </Screen>
  );
}
