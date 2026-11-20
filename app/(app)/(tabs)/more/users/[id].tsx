import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ErrorBanner, SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { listUsers } from '@/features/users/api';
import { ResetPasswordSheet } from '@/features/users/components/ResetPasswordSheet';
import { displayName, roleText, signInText } from '@/features/users/text';
import { useToggleUser, useUserAccess } from '@/features/users/useUserAccess';
import { formatDate } from '@/lib/format';
import { notify } from '@/lib/notify';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** One user in full: contact, role and department, last sign-in; with Edit, Reset password and Activate / Deactivate. */
export default function UserDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const access = useUserAccess();
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const toggle = useToggleUser(setError);

  // There is no route for one user: the list has everyone.
  const { data, error: loadError, isLoading, refetch } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const user = data?.find((u) => u.id === id);

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (loadError || !user) {
    return (
      <Centered>
        <ErrorText message={loadError instanceof Error ? loadError.message : 'User not found'} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const isMe = user.id === access.meId;
  const manage = access.canManage(user);

  return (
    <>
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
        <ScreenTitle back="Users" />
        <ErrorBanner message={error} />

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.name} accessibilityRole="header">{displayName(user)}</Text>
          <View style={styles.pills}>
            <Text style={styles.pill}>{user.isActive ? 'Active' : 'Inactive'}</Text>
            {isMe ? <Text style={styles.pill}>You</Text> : null}
          </View>
        </View>

        <View>
          <SectionHeader>Contact</SectionHeader>
          <View style={styles.card}>
            <InfoRow label="Mobile number" value={`+91 ${user.phoneNo}`} onPress={() => void Linking.openURL(`tel:+91${user.phoneNo}`)} />
            <InfoRow label="Email" value={user.email} onPress={user.email ? () => void Linking.openURL(`mailto:${user.email}`) : undefined} />
          </View>
        </View>

        <View>
          <SectionHeader>Access</SectionHeader>
          <View style={styles.card}>
            <InfoRow label="Role" value={roleText(user)} />
            <InfoRow label="Department" value={user.department?.name} />
            <InfoRow label="Last sign-in" value={signInText(user.lastSignInAt)} />
            <InfoRow label="Joined" value={user.createdAt ? formatDate(user.createdAt) : null} />
          </View>
        </View>

        {manage ? (
          <View style={{ gap: spacing.sm + spacing.xs }}>
            <Button title="Edit" onPress={() => router.push({ pathname: '/more/users/edit', params: { id } })} />
            <Button title="Reset password" tone="secondary" onPress={() => setReset(true)} />
            {/* Not on your own account. */}
            {!isMe ? (
              user.isActive ? (
                <Button title="Deactivate" tone="danger" onPress={() => toggle.toggle(user)} busy={toggle.busy} />
              ) : (
                <Button title="Activate" tone="secondary" onPress={() => toggle.toggle(user)} busy={toggle.busy} />
              )
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <ResetPasswordSheet
        user={reset ? user : null}
        onClose={() => setReset(false)}
        onDone={(message) => {
          setReset(false);
          notify(message);
        }}
      />
    </>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    name: { ...type.title1, color: c.ink },
    pills: { flexDirection: 'row', gap: spacing.sm },
    pill: { ...type.footnoteBold, color: c.muted, backgroundColor: c.track, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.md },
  });
