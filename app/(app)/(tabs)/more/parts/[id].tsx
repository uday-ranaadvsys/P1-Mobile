import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PERMISSIONS } from 'floman-shared/permissions';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ErrorBanner, SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { getPart } from '@/features/parts/api';
import { gstRate, groupText, isLow, isProduct, PART_TYPE_LABEL, qtyText } from '@/features/parts/text';
import { useTogglePart } from '@/features/parts/useTogglePart';
import { formatMoney } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** One part in full: what it is, its code and GST, its stock, its prices (for those who may see them) and notes. */
export default function PartDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const canUpdate = can(PERMISSIONS.PARTS.UPDATE);
  const [error, setError] = useState<string | null>(null);
  const toggle = useTogglePart(setError);

  const { data: part, error: loadError, isLoading, refetch } = useQuery({ queryKey: ['part', id], queryFn: () => getPart(id) });

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (loadError || !part) {
    return (
      <Centered>
        <ErrorText message={loadError instanceof Error ? loadError.message : null} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const product = isProduct(part);
  const money = (value: number | null | undefined) => (value === undefined || value === null ? null : hide.hidden ? hide.rupees(0) : formatMoney(value));
  const hasPrices = part.sellingPriceWithoutTax !== undefined || part.purchasePriceWithoutTax !== undefined;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <ScreenTitle back="Part Master" />
      <ErrorBanner message={error} />

      <View style={{ gap: spacing.xs }}>
        <Text style={styles.name} accessibilityRole="header">{part.name}</Text>
        <View style={styles.pills}>
          <Text style={styles.pill}>{PART_TYPE_LABEL[part.partType] ?? part.partType}</Text>
          <Text style={styles.pill}>{part.isActive ? 'Active' : 'Inactive'}</Text>
        </View>
      </View>

      <View>
        <SectionHeader>Basics</SectionHeader>
        <View style={styles.card}>
          <InfoRow label="Unit" value={part.uom} />
          <InfoRow label="Group" value={groupText(part)} />
          <InfoRow label={product ? 'HSN code' : 'SAC code'} value={part.hsn} />
          <InfoRow label="GST rate" value={`${gstRate(part)}%`} />
        </View>
      </View>

      {product ? (
        <View>
          <SectionHeader>Stock</SectionHeader>
          <View style={styles.card}>
            <InfoRow label="Stock in hand" value={qtyText(part.inStock, part.uom)} />
            <InfoRow label="Minimum stock" value={part.minStock !== null && part.minStock !== undefined ? qtyText(part.minStock, part.uom) : null} />
            {isLow(part) ? <Text style={[styles.warn, { color: colors.warnText }]}>Below the minimum</Text> : null}
          </View>
        </View>
      ) : null}

      {hasPrices ? (
        <View>
          <SectionHeader>Prices</SectionHeader>
          <View style={styles.card}>
            <InfoRow label="Selling price (before GST)" value={money(part.sellingPriceWithoutTax)} />
            <InfoRow label="Selling price (with GST)" value={money(part.sellingPriceWithTax)} />
            <InfoRow label="Purchase price (before GST)" value={money(part.purchasePriceWithoutTax)} />
            <InfoRow label="Purchase price (with GST)" value={money(part.purchasePriceWithTax)} />
          </View>
        </View>
      ) : null}

      {part.description ? (
        <View>
          <SectionHeader>Notes</SectionHeader>
          <View style={styles.card}>
            <Text style={styles.value}>{part.description}</Text>
          </View>
        </View>
      ) : null}

      {canUpdate ? (
        <View style={{ gap: spacing.sm + spacing.xs }}>
          <Button title="Edit" onPress={() => router.push({ pathname: '/more/parts/edit', params: { id } })} />
          {part.isActive ? (
            <Button title="Deactivate" tone="danger" onPress={() => toggle.toggle(part)} busy={toggle.busy} />
          ) : (
            <Button title="Reactivate" tone="secondary" onPress={() => toggle.toggle(part)} busy={toggle.busy} />
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
    value: { ...type.body, color: c.ink },
    warn: { ...type.subhead, fontWeight: '600' },
  });
