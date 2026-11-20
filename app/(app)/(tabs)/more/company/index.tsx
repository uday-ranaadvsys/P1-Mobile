import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DOCUMENT_LOCK_NAME } from 'floman-shared/constants';
import { gstinStateMismatch } from 'floman-shared/gst';
import { ADMIN_ROLE_NAME, PERMISSIONS } from 'floman-shared/permissions';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { mediaSource } from '@/api/client';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ErrorBanner, SwitchRow } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import {
  deactivateBankAccount, deactivateLocation, getCompany, getDocumentLock, reactivateBankAccount, reactivateLocation, setDocumentLock,
  updateBankAccount, type BankAccount, type Company, type CompanyLocation,
} from '@/features/company/api';
import { BankAccountSheet } from '@/features/company/components/BankAccountSheet';
import { LocationSheet } from '@/features/company/components/LocationSheet';
import { formatDate } from '@/lib/format';
import { notify } from '@/lib/notify';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** How many days before its end an LUT shows as expiring (the web's LUT_WARNING_DAYS). */
const LUT_WARNING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type Tone = 'good' | 'warn' | 'bad';
/** The LUT's status as its card shows it: not set up (amber), valid (green), expiring (amber), expired (red). */
function lutStatus(company: Company): { label: string; tone: Tone; setUp: boolean } {
  if (!company.lutNo || !company.lutEndDate) return { label: 'Not set up', tone: 'warn', setUp: false };
  const left = Math.ceil((new Date(company.lutEndDate).getTime() - Date.now()) / DAY_MS);
  if (left < 0) return { label: 'Expired', tone: 'bad', setUp: true };
  if (left <= LUT_WARNING_DAYS) return { label: `Ends in ${left} ${left === 1 ? 'day' : 'days'}`, tone: 'warn', setUp: true };
  return { label: 'Valid', tone: 'good', setUp: true };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const last4 = (n: string) => n.slice(-4);

/**
 * My Company, as the web's Company Profile: a warning when the GSTIN and address are in different states, the
 * business details, the export LUT, the bank accounts, the locations, and the document lock (Admin only). Each card
 * has its own Edit / Add. The GSTIN and state are fixed when the account is made, so they are shown, never edited.
 */
export default function MyCompany() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can, user, workspace } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const canEdit = can(PERMISSIONS.COMPANY.UPDATE);
  const isAdmin = Boolean(user?.roles.includes(ADMIN_ROLE_NAME));
  const canLock = isAdmin && !workspace?.readOnly;

  const [error, setError] = useState<string | null>(null);
  const [bank, setBank] = useState<{ open: boolean; account: BankAccount | null }>({ open: false, account: null });
  const [place, setPlace] = useState<{ open: boolean; location: CompanyLocation | null }>({ open: false, location: null });
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);

  const company = useQuery({ queryKey: ['company'], queryFn: getCompany });
  const lock = useQuery({ queryKey: ['document-lock'], queryFn: getDocumentLock });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['company'] });

  const toggleLock = useMutation({
    mutationFn: (locked: boolean) => setDocumentLock(locked),
    onSuccess: ({ locked, message: text }) => {
      queryClient.setQueryData(['document-lock'], locked);
      notify(text);
    },
    onError: (e) => setError(message(e)),
  });

  if (company.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (company.error) {
    return (
      <Centered>
        <ErrorText message={message(company.error)} />
        <Button title="Try again" tone="secondary" onPress={() => void company.refetch()} />
      </Centered>
    );
  }
  const c = company.data;
  if (!c) {
    return (
      <View style={styles.page}>
        <ScreenTitle back="Settings" title="My Company" />
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No company yet</Text>
          <Text style={styles.help}>The company is set up when the account is created.</Text>
        </View>
      </View>
    );
  }

  const mismatch = gstinStateMismatch(c.gstin, c.state);
  const lut = lutStatus(c);
  const accounts = c.bankAccounts ?? [];
  const locations = c.locations ?? [];
  const logo = mediaSource(c.logoUrl);
  const edit = () => router.push('/more/company/edit');
  const toneStyle = (tone: Tone) =>
    tone === 'good' ? { color: colors.receive, backgroundColor: 'rgba(16,185,129,0.14)' } : tone === 'bad' ? { color: colors.lateText, backgroundColor: colors.lateBg } : { color: colors.warnText, backgroundColor: colors.warnBg };

  // ── Bank accounts: the web's ⋮ menu ──
  const accountMenu = (a: BankAccount) => {
    const title = `${a.bankName} ···${last4(a.accountNumber)}`;
    const run = (call: () => Promise<{ message: string | null }>) => async () => {
      try {
        const { message: text } = await call();
        refresh();
        notify(text);
      } catch (e) {
        setError(message(e));
      }
    };
    if (a.isActive === false) return setMenu({ title, actions: [{ label: 'Reactivate', onPress: run(() => reactivateBankAccount(c.id, a.id)) }] });
    setMenu({
      title,
      actions: [
        { label: 'Edit', onPress: () => setBank({ open: true, account: a }) },
        ...(!a.isDefault ? [{ label: 'Use by default', onPress: run(() => updateBankAccount(c.id, a.id, { isDefault: true })) }] : []),
        {
          label: 'Deactivate',
          destructive: true,
          onPress: () =>
            Alert.alert(
              'Deactivate bank account',
              `Deactivate ${title}? It won't be offered on new documents or payments. Documents and payments that already use it keep it. You can reactivate it later.`,
              [{ text: 'Keep it', style: 'cancel' }, { text: 'Deactivate', style: 'destructive', onPress: () => void run(() => deactivateBankAccount(c.id, a.id))() }],
            ),
        },
      ],
    });
  };

  // ── Locations ──
  const locationMenu = (l: CompanyLocation) => {
    const run = (call: () => Promise<{ message: string | null }>) => async () => {
      try {
        const { message: text } = await call();
        refresh();
        notify(text);
      } catch (e) {
        setError(message(e));
      }
    };
    if (l.isActive === false) return setMenu({ title: l.name, actions: [{ label: 'Reactivate', onPress: run(() => reactivateLocation(c.id, l.id)) }] });
    setMenu({
      title: l.name,
      actions: [
        { label: 'Edit', onPress: () => setPlace({ open: true, location: l }) },
        {
          label: 'Deactivate',
          destructive: true,
          onPress: () =>
            Alert.alert(
              'Deactivate location',
              `Deactivate ${l.name}? It won't be offered on new documents. Documents that already use it keep it. Its numbering series must be deactivated first. You can reactivate it later.`,
              [{ text: 'Keep it', style: 'cancel' }, { text: 'Deactivate', style: 'destructive', onPress: () => void run(() => deactivateLocation(c.id, l.id))() }],
            ),
        },
      ],
    });
  };

  const hasActiveAccount = accounts.some((a) => a.isActive !== false);
  const hasDefault = accounts.some((a) => a.isActive !== false && a.isDefault);

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={company.isRefetching} onRefresh={() => void company.refetch()} tintColor={colors.brandText} />}
      >
        <ScreenTitle back="Settings" title="My Company" />
        <Text style={styles.help}>Your details as they print on invoices.</Text>
        <ErrorBanner message={error} />

        {/* GSTIN registered in one state, address in another: prints on every invoice */}
        {mismatch ? (
          <View style={styles.warnCard}>
            <Ionicons name="warning" size={22} color={colors.warnText} />
            <Text style={styles.warnBody}>
              <Text style={styles.bold}>GSTIN and address don't match.</Text> GSTIN starts with {String(mismatch.code).padStart(2, '0')} ({mismatch.name}), but the address is in {[c.city, c.state].filter(Boolean).join(', ')}. Check before issuing invoices.
            </Text>
            {canEdit ? (
              <Pressable onPress={edit} accessibilityRole="button" style={({ pressed }) => [styles.cardAction, pressed && { opacity: 0.6 }]}>
                <Text style={[styles.cardActionText, { color: colors.warnText }]}>Fix now</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Business details */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Business details</Text>
            {canEdit ? <Button title="Edit" tone="secondary" onPress={edit} style={styles.smallButton} /> : null}
          </View>
          <View style={styles.logoBox}>
            {logo ? <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel={`${c.name} logo`} /> : <Text style={styles.help}>Logo</Text>}
          </View>
          <InfoRow label="Legal name" value={c.name} />
          <InfoRow label="GSTIN" value={c.gstin} />
          <InfoRow label="Address" value={c.address} />
          <InfoRow label="City, State, PIN" value={`${c.city || '—'}, ${c.state || '—'}, ${c.pincode || '—'}`} />
        </View>

        {/* Export LUT */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Export LUT</Text>
            {canEdit ? <Button title={lut.setUp ? 'Edit LUT' : 'Set up LUT'} tone={lut.setUp ? 'secondary' : 'primary'} onPress={edit} style={styles.smallButton} /> : null}
          </View>
          <View style={{ gap: 2 }}>
            <Text style={styles.label}>Status</Text>
            <Text style={[styles.badge, toneStyle(lut.tone)]}>{lut.label}</Text>
          </View>
          <InfoRow label="ARN" value={c.lutNo} />
          <InfoRow label="Valid" value={c.lutEndDate ? `${c.lutFiledDate ? `${formatDate(c.lutFiledDate)} to ` : 'Until '}${formatDate(c.lutEndDate)}` : null} />
          <Text style={styles.help}>Needed to export without paying IGST.</Text>
        </View>

        {/* Bank accounts */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Bank accounts</Text>
            {canEdit ? <Button title="Add" tone="secondary" onPress={() => setBank({ open: true, account: null })} style={styles.smallButton} /> : null}
          </View>
          <Text style={styles.help}>Where money comes in and goes out. Used on Receive and Pay, and printed on invoices.</Text>
          {/* The app never picks the default itself: with active accounts and none the default, say so. */}
          {hasActiveAccount && !hasDefault ? <Text style={[styles.help, { color: colors.warnText }]}>No default bank account. Choose one from its menu: Use by default.</Text> : null}
          {accounts.length === 0 ? (
            <Text style={styles.empty}>No bank accounts yet.</Text>
          ) : (
            <View style={styles.list}>
              {accounts.map((a, i) => (
                <Pressable
                  key={a.id}
                  onPress={() => (canEdit ? accountMenu(a) : undefined)}
                  disabled={!canEdit}
                  accessibilityRole="button"
                  accessibilityHint={canEdit ? 'Opens its actions' : undefined}
                  style={({ pressed }) => [styles.item, i > 0 && styles.itemLine, a.isActive === false && { opacity: 0.6 }, pressed && { opacity: 0.6 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {a.bankName} ···{last4(a.accountNumber)}
                      {a.isDefault ? ' · Default' : ''}
                      {a.isActive === false ? ' · Deactivated' : ''}
                    </Text>
                    <Text style={styles.help} numberOfLines={2}>{[a.label, `IFSC ${a.ifsc}`, a.branch, a.upiId].filter(Boolean).join(' · ')}</Text>
                  </View>
                  {canEdit ? <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} /> : null}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Locations: plants, warehouses and branches under the GSTIN */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Locations</Text>
            {canEdit ? <Button title="Add" tone="secondary" onPress={() => setPlace({ open: true, location: null })} style={styles.smallButton} /> : null}
          </View>
          <Text style={styles.help}>Plants, warehouses and branches under your GSTIN, besides the registered address. Each one bills, dispatches and receives goods, with its own numbering series.</Text>
          {locations.length === 0 ? (
            <Text style={styles.empty}>Only the registered address.</Text>
          ) : (
            <View style={styles.list}>
              {locations.map((l, i) => (
                <Pressable
                  key={l.id}
                  onPress={() => (canEdit ? locationMenu(l) : undefined)}
                  disabled={!canEdit}
                  accessibilityRole="button"
                  accessibilityHint={canEdit ? 'Opens its actions' : undefined}
                  style={({ pressed }) => [styles.item, i > 0 && styles.itemLine, l.isActive === false && { opacity: 0.6 }, pressed && { opacity: 0.6 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{l.name}{l.isActive === false ? ' · Deactivated' : ''}</Text>
                    <Text style={styles.help} numberOfLines={3}>
                      {[l.addressLine1, l.addressLine2, `${l.city} ${l.pincode}`, l.contactPerson, l.contactPhone].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {canEdit ? <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} /> : null}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Lock Approved & Cancelled Docs (one switch for every document; off by default) */}
        {lock.data !== undefined ? (
          <View style={styles.card}>
            <SwitchRow
              label={DOCUMENT_LOCK_NAME}
              help="On: approved documents can't be edited and cancelled ones can't be restored. Corrections are made with Cancel or a Credit / Debit Note."
              value={lock.data}
              onChange={(next) => toggleLock.mutate(next)}
              disabled={!canLock || toggleLock.isPending}
            />
            {!canLock ? <Text style={styles.help}>Only an Admin can change this.</Text> : null}
          </View>
        ) : null}
      </ScrollView>

      <BankAccountSheet
        visible={bank.open}
        companyId={c.id}
        account={bank.account}
        onClose={() => setBank({ open: false, account: null })}
        onSaved={(text) => {
          setBank({ open: false, account: null });
          refresh();
          notify(text);
        }}
      />
      <LocationSheet
        visible={place.open}
        companyId={c.id}
        state={c.state}
        location={place.location}
        onClose={() => setPlace({ open: false, location: null })}
        onSaved={(text) => {
          setPlace({ open: false, location: null });
          refresh();
          notify(text);
        }}
      />
      <ActionSheet visible={menu !== null} title={menu?.title} actions={menu?.actions ?? []} onClose={() => setMenu(null)} />
    </>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg * 2 },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.md },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    cardTitle: { ...type.headline, color: c.ink },
    smallButton: { minHeight: 44, paddingHorizontal: spacing.md },
    help: { ...type.footnote, color: c.muted },
    label: { ...type.footnote, color: c.muted },
    bold: { fontWeight: '700', color: c.ink },
    badge: { ...type.footnoteBold, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
    logoBox: { alignSelf: 'flex-start', width: 160, height: 80, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: c.outline, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    logo: { width: '100%', height: '100%' },
    warnCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: c.warnBorder, backgroundColor: c.warnBg },
    warnBody: { ...type.subhead, flex: 1, color: c.ink },
    cardAction: { minHeight: 44, justifyContent: 'center' },
    cardActionText: { ...type.headline },
    empty: { ...type.subhead, color: c.muted, borderRadius: 12, borderWidth: 1, borderColor: c.outline, padding: spacing.md },
    list: { borderRadius: 12, borderWidth: 1, borderColor: c.outline, overflow: 'hidden' },
    item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
    itemLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    itemTitle: { ...type.headline, color: c.ink },
  });
