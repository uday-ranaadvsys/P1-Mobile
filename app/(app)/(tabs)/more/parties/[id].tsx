import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OPENING_BALANCE_TYPE, PARTY_TYPE, PAYMENT_TYPE, PAYMENT_TYPE_LABEL } from 'floman-shared/constants';
import { SUPPLY_TYPE, SUPPLY_TYPE_LABEL, type SupplyType } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Centered } from '@/components/Screen';
import { ErrorBanner, SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { getParty, type PartyAddress } from '@/features/parties/api';
import { addressLine, balanceColor, balanceInWords, gstinText, PARTY_TYPE_LABEL } from '@/features/parties/text';
import { useToggleParty } from '@/features/parties/useToggleParty';
import { formatDate, formatMoney } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** One party in full: who they are, contact, GST, addresses, what is owed and the opening balance. */
export default function PartyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const canUpdate = can(PERMISSIONS.VENDORS.UPDATE);
  const [error, setError] = useState<string | null>(null);

  const { data: party, error: loadError, isLoading, refetch } = useQuery({ queryKey: ['party', id], queryFn: () => getParty(id) });

  const status = useToggleParty(setError);

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (loadError || !party) {
    return (
      <Centered>
        <ErrorText message={loadError instanceof Error ? loadError.message : null} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const places = (party.addresses ?? []).filter((a) => a.isActive);
  const opening = Number(party.openingBalance ?? 0);
  const owed = party.balance ?? null;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <ScreenTitle back="Vendors & Customers" />
      <ErrorBanner message={error} />

      <View style={{ gap: spacing.xs }}>
        <Text style={styles.name} accessibilityRole="header">{hide.text(party.name)}</Text>
        <View style={styles.pills}>
          <Text style={styles.pill}>{PARTY_TYPE_LABEL[party.type] ?? party.type}</Text>
          <Text style={styles.pill}>{party.isActive ? 'Active' : 'Inactive'}</Text>
        </View>
      </View>

      {owed ? (
        <View style={styles.card}>
          <Text style={styles.label}>Balance today</Text>
          <Text style={[styles.balance, { color: balanceColor(owed, colors) }]}>{hide.hidden ? hide.rupees(0) : balanceInWords(owed)}</Text>
        </View>
      ) : null}

      <View>
        <SectionHeader>Contact</SectionHeader>
        <View style={styles.card}>
          <InfoRow label="Contact person" value={party.contactPerson ? hide.text(party.contactPerson) : null} />
          <InfoRow label="Phone" value={party.phone ? hide.text(party.phone) : null} onPress={party.phone && !hide.hidden ? () => void Linking.openURL(`tel:${party.phone}`) : undefined} />
          <InfoRow label="Email" value={party.email ? hide.text(party.email) : null} onPress={party.email && !hide.hidden ? () => void Linking.openURL(`mailto:${party.email}`) : undefined} />
        </View>
      </View>

      <View>
        <SectionHeader>GST</SectionHeader>
        <View style={styles.card}>
          <InfoRow label="GSTIN" value={gstinText(party)} />
          <InfoRow label="State" value={party.state} />
          {party.type === PARTY_TYPE.CUSTOMER ? <InfoRow label="Usual supply" value={SUPPLY_TYPE_LABEL[(party.supplyType as SupplyType) ?? SUPPLY_TYPE.B2B]} /> : null}
        </View>
      </View>

      <View>
        <SectionHeader>Addresses</SectionHeader>
        <View style={styles.card}>
          <InfoRow label="Billing address" value={hide.text([party.billToAddress, party.city, party.state, party.pincode].filter(Boolean).join(', ') || '') || null} />
          <InfoRow label="Delivery address" value={hide.text(party.shipToAddress) || null} />
          {places.map((a: PartyAddress) => (
            <View key={a.id} style={{ gap: 2 }}>
              <Text style={styles.label}>
                {a.label}
                {a.isBilling ? ' · Billing' : ''}
                {a.isShipping !== false ? ' · Delivery' : ''}
                {a.isDefault ? ' · Default' : ''}
              </Text>
              <Text style={styles.value}>{hide.text(addressLine(a))}</Text>
            </View>
          ))}
        </View>
      </View>

      {opening > 0 ? (
        <View>
          <SectionHeader>Opening balance</SectionHeader>
          <View style={styles.card}>
            <InfoRow
              label={party.openingBalanceType === OPENING_BALANCE_TYPE.RECEIVABLE ? PAYMENT_TYPE_LABEL[PAYMENT_TYPE.RECEIPT] : PAYMENT_TYPE_LABEL[PAYMENT_TYPE.PAYMENT]}
              value={hide.hidden ? hide.rupees(0) : formatMoney(opening)}
            />
            <InfoRow label="As of" value={party.openingBalanceDate ? formatDate(party.openingBalanceDate) : null} />
          </View>
        </View>
      ) : null}

      {canUpdate ? (
        <View style={{ gap: spacing.sm + spacing.xs }}>
          <Button title="Edit" onPress={() => router.push({ pathname: '/more/parties/edit', params: { id } })} />
          {party.isActive ? (
            <Button title="Deactivate" tone="danger" onPress={() => status.toggle(party)} busy={status.busy} />
          ) : (
            <Button title="Reactivate" tone="secondary" onPress={() => status.toggle(party)} busy={status.busy} />
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    name: { ...type.title1, color: c.ink },
    pills: { flexDirection: 'row', gap: spacing.sm },
    pill: { ...type.footnoteBold, color: c.muted, backgroundColor: c.track, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.md },
    label: { ...type.footnote, color: c.muted },
    value: { ...type.body, color: c.ink },
    balance: { ...type.title3 },
  });
