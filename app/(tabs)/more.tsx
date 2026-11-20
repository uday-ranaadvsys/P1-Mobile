import { useState } from 'react';
import { Text } from 'react-native';
import { useSession } from '@/auth/session';
import { Button, Screen } from '@/components/ui';
import { colors } from '@/theme';

export default function More() {
  const { user, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  return (
    <Screen>
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors.ink }}>{name || user?.email}</Text>
      <Text style={{ color: colors.muted }}>{user?.email ?? user?.phoneNo}</Text>
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
