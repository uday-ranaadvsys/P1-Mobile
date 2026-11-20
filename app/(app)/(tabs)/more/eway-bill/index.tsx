import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EWAY_GSP_NAME } from 'floman-shared/constants';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ErrorBanner } from '@/components/FormParts';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { getEwaySettings, testEwayConnection } from '@/features/eway/api';
import { notify } from '@/lib/notify';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const PORTAL = 'ewaybillgst.gov.in';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Free calls start again on the 1st of next month. */
const resetsOn = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/**
 * Settings → E-Way Bill (Admin only), as the web: connect the company's own e-way bill API user in 3 steps, then see
 * this month's calls. A typed login is saved only once the portal accepts it; the password is never shown again.
 */
export default function EwayBill() {
  const queryClient = useQueryClient();
  const styles = useThemed(makeStyles);
  const colors = useColors();

  const settings = useQuery({ queryKey: ['eway-settings'], queryFn: getEwaySettings, retry: false });
  const view = settings.data;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    setUsername(view?.apiUsername ?? '');
  }, [view?.apiUsername]);

  const changed = !!view && (username.trim() !== (view.apiUsername ?? '') || !!password);
  const canTest = !!username.trim() && (!!password || !!view?.hasPassword) && !!view?.gstin;
  const connected = !!view?.isVerified && !changed;

  const test = useMutation({
    mutationFn: () => testEwayConnection(changed ? { apiUsername: username.trim(), apiPassword: password || undefined } : {}),
    onSuccess: ({ data, message: server }) => {
      queryClient.setQueryData(['eway-settings'], data);
      setPassword('');
      setBanner(null);
      notify(server ?? 'Connected to the e-way bill portal.');
    },
    onError: (e) => {
      setBanner(message(e));
      void settings.refetch(); // the failed call still counts, and the last test message changed
    },
  });

  if (settings.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (settings.error || !view) {
    return (
      <Centered>
        <ErrorText message={message(settings.error ?? 'Could not load the e-way bill settings.')} />
        <Button title="Try again" tone="secondary" onPress={() => void settings.refetch()} />
      </Centered>
    );
  }

  const usage = view.usage;
  const usedShare = usage.freeLimit > 0 ? Math.min(100, (usage.freeUsed / usage.freeLimit) * 100) : 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={settings.isRefetching} onRefresh={() => void settings.refetch()} tintColor={colors.brandText} />}
      >
        <ScreenTitle back="Settings" title="E-Way Bill" />
        <Text style={styles.help}>Create e-way bills from invoices and delivery challans, through your own portal login.</Text>
        <ErrorBanner message={banner} />

        {/* Connect */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Connect in 3 steps</Text>
            <View style={[styles.pill, connected && styles.pillGood]}>
              {connected ? <Ionicons name="checkmark-circle" size={14} color={colors.receive} /> : null}
              <Text style={[styles.pillText, connected && { color: colors.receive }]}>{connected ? 'Connected' : 'Not connected'}</Text>
            </View>
          </View>

          <View style={styles.step}>
            <Text style={styles.stepNo}>1</Text>
            <Text style={styles.stepText}>
              Sign in to{' '}
              <Text style={styles.link} onPress={() => void Linking.openURL(`https://${PORTAL}`)} accessibilityRole="link">{PORTAL}</Text>{' '}
              with your company's e-way bill login.
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNo}>2</Text>
            <Text style={styles.stepText}>
              Go to <Text style={styles.bold}>Registration → For GSP</Text>, choose <Text style={styles.bold}>{EWAY_GSP_NAME}</Text>, and create an API username and password.
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNo}>3</Text>
            <Text style={styles.stepText}>Enter them here and test the connection. They are saved once the portal accepts them.</Text>
          </View>

          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>Company GSTIN</Text>
            {view.gstin ? <Text style={styles.gstin}>{view.gstin}</Text> : <Text style={{ ...type.subhead, color: colors.danger }}>Missing: add it in My Company first.</Text>}
          </View>
          <Field label="API username" required value={username} onChangeText={setUsername} autoComplete="off" />
          <Field
            label="API password"
            required={!view.hasPassword}
            secure
            value={password}
            onChangeText={setPassword}
            placeholder={view.hasPassword ? 'Saved (leave empty to keep it)' : ''}
            autoComplete="off"
          />
          {view.lastTestMessage && !changed ? (
            <Text style={[styles.lastTest, view.isVerified && { color: colors.receive }]}>
              Last test: {view.lastTestMessage}
              {view.lastTestedAt ? ` (${new Date(view.lastTestedAt).toLocaleString('en-IN')})` : ''}
            </Text>
          ) : null}
          <Button title={test.isPending ? 'Testing…' : 'Test connection'} onPress={() => test.mutate()} busy={test.isPending} disabled={!canTest} />
        </View>

        {/* This month's usage */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Usage this month</Text>
          <View style={{ gap: spacing.xs }}>
            <View style={styles.usageRow}>
              <Text style={styles.sub}>Free calls</Text>
              <Text style={styles.sub}><Text style={styles.bold}>{usage.freeUsed}</Text> of {usage.freeLimit} used</Text>
            </View>
            <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: usage.freeLimit, now: usage.freeUsed }}>
              <View style={[styles.bar, { width: `${usedShare}%`, backgroundColor: usage.freeLeft === 0 ? colors.warnText : colors.brandText }]} />
            </View>
          </View>
          <View style={styles.stats}>
            {([['Top-up calls left', usage.creditsLeft], ['Failed calls', usage.failedCalls], ['Free calls reset on', resetsOn()]] as const).map(([label, value]) => (
              <View key={label} style={styles.stat}>
                <Text style={styles.footnote}>{label}</Text>
                <Text style={styles.statValue}>{value}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.footnote}>
            Every call to the portal counts, including sign-ins and failed calls. Top-up calls carry over until used. To buy a top-up, contact support.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    help: { ...type.subhead, color: c.muted },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.md },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    cardTitle: { ...type.headline, color: c.ink },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: c.track },
    pillGood: { backgroundColor: 'rgba(16,185,129,0.14)' },
    pillText: { ...type.footnoteBold, color: c.muted },
    step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    stepNo: { ...type.footnoteBold, color: c.muted, width: 22, height: 22, lineHeight: 20, borderRadius: 11, borderWidth: 1, borderColor: c.outline, textAlign: 'center', overflow: 'hidden' },
    stepText: { ...type.subhead, flex: 1, color: c.ink },
    bold: { fontWeight: '700', color: c.ink },
    link: { fontWeight: '600', color: c.brandText, textDecorationLine: 'underline' },
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    gstin: { ...type.body, fontWeight: '600', color: c.ink },
    lastTest: { ...type.footnote, color: c.muted },
    sub: { ...type.subhead, color: c.muted },
    usageRow: { flexDirection: 'row', justifyContent: 'space-between' },
    track: { height: 8, borderRadius: 4, backgroundColor: c.track, overflow: 'hidden' },
    bar: { height: 8, borderRadius: 4 },
    stats: { flexDirection: 'row', gap: spacing.md },
    stat: { flex: 1, gap: 2 },
    statValue: { ...type.headline, color: c.ink },
    footnote: { ...type.footnote, color: c.muted },
  });
