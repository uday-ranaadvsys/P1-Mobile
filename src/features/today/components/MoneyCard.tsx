import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { monthName } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useThemed, type Colors } from '@/theme';
import type { MoneyPulse } from '../api';

/**
 * The web's Money card: only the figures the user may see (the server leaves out the rest). Two columns,
 * a label over a figure over a note, in the web's order and words.
 */
export function MoneyCard({ money }: { money: MoneyPulse }) {
  const styles = useThemed(makeStyles);
  const hide = useHide();
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const net = money.netRevenue;
  const change = net && net.lastMonth > 0 ? ((net.month - net.lastMonth) / net.lastMonth) * 100 : null;

  const figures = [
    money.collectedToday !== undefined && { key: 'collected', label: 'Collected today', value: money.collectedToday },
    net && {
      key: 'net',
      label: `Net Revenue, ${monthName(now).slice(0, 3)}`,
      value: net.month,
      // No line when last month had nothing over the same days: nothing to compare with.
      note: change !== null ? { tone: change >= 0 ? 'up' : 'down', text: `${change >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(change))}% on ${monthName(lastMonth).slice(0, 3)}, same days` } : null,
    },
    money.receivable && { key: 'receive', label: 'Receive from Customer', value: money.receivable.total, note: { tone: money.receivable.overdue > 0 ? 'late' : 'plain', text: `${hide.rupees(money.receivable.overdue)} overdue` } },
    money.payable && { key: 'pay', label: 'Pay to Vendor', value: money.payable.total, note: { tone: money.payable.overdue > 0 ? 'late' : 'plain', text: `${hide.rupees(money.payable.overdue)} overdue` } },
  ].filter(Boolean) as { key: string; label: string; value: number; note?: { tone: string; text: string } | null }[];

  if (figures.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Money</Text>
      <View style={styles.grid}>
        {figures.map((f) => (
          <View key={f.key} style={styles.cell}>
            <Text style={styles.label}>{f.label}</Text>
            <Text style={styles.value}>{hide.rupees(f.value)}</Text>
            {f.note ? (
              <Text style={[styles.note, f.note.tone === 'late' && styles.late, f.note.tone === 'up' && styles.up, f.note.tone === 'down' && styles.down]}>
                {f.note.text}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.md },
    title: { ...type.headline, color: c.ink },
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, columnGap: spacing.md },
    cell: { width: '47%', gap: 2 },
    label: { ...type.footnote, color: c.muted },
    value: { ...type.title3, color: c.ink },
    note: { ...type.footnote, color: c.muted },
    late: { color: c.lateText },
    up: { color: c.receive },
    down: { color: c.danger },
  });
