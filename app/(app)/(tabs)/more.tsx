import { useState } from 'react';
import { Text } from 'react-native';
import { useSession } from '@/features/auth/session';
import { Button } from '@/components/Button';
import { Muted } from '@/components/Text';
import { Screen } from '@/components/Screen';
import { useColors } from '@/theme';

export default function More() {
  const { user, signOut } = useSession();
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  return (
    <Screen>
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors.ink }}>{name || user?.email}</Text>
      <Muted>{user?.email ?? user?.phoneNo}</Muted>
      <Button
        title="Sign out"
        tone="plain"
        busy={busy}
        onPress={() => {
          setBusy(true);
          void signOut();
        }}
      />
    </Screen>
  );
}
