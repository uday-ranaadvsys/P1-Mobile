import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Muted } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { usePrivacy } from '@/lib/privacy';
import { radius, spacing, useColors, useThemed, type Colors } from '@/theme';

export default function More() {
  const { user, signOut } = useSession();
  const { hidden, toggle } = usePrivacy();
  const colors = useColors();
  const styles = useThemed(makeStyles);
  const [busy, setBusy] = useState(false);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  return (
    <Screen>
      <Text style={styles.name}>{name || user?.email}</Text>
      <Muted>{user?.email ?? user?.phoneNo}</Muted>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Privacy mode</Text>
          <Muted>Hide amounts and names on screen</Muted>
        </View>
        <Switch value={hidden} onValueChange={toggle} trackColor={{ true: colors.brand }} />
      </View>
      <Button
        title="Sign out"
        tone="secondary"
        busy={busy}
        onPress={() => {
          setBusy(true);
          void signOut();
        }}
      />
    </Screen>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    name: { fontSize: 18, fontWeight: '600', color: c.ink },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: c.surface, borderRadius: radius,
      borderWidth: 1, borderColor: c.outline, padding: spacing.md,
    },
    label: { fontSize: 16, fontWeight: '600', color: c.ink },
  });
