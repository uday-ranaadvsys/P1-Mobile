import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { OVER_ORDER_CODE, QUANTITY_TEXT, TODAY_GROUP } from 'floman-shared/constants';
import { DOCUMENT_NAMES, type DocumentType } from 'floman-shared/documentTypes';
import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDocument, type DocumentLine } from '@/features/documents/api';
import { approveDocument, returnDocument, type OverOrderDetails } from '@/features/approvals/api';
import { ApiError } from '@/api/client';
import { Button } from '@/components/Button';
import { Centered } from '@/components/Screen';
import { ErrorText } from '@/components/Text';
import { ReturnSheet } from '@/features/approvals/components/ReturnSheet';
import { formatMoney, formatQty, formatDate } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useHide } from '@/lib/privacy';
import { since } from '@/features/today/text';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Review a document and approve it or send it back. The buttons show when it was opened from
 * "To approve"; the server still checks the permission and the document's state.
 */
export default function Review() {
  const p = useLocalSearchParams<{ kind: string; id: string; group: string; number: string; party: string; by: string; note: string; date: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const colors = useColors();
  const hide = useHide();
  const styles = useThemed(makeStyles);
  const canDecide = p.group === TODAY_GROUP.APPROVE;
  const returned = p.group === TODAY_GROUP.FIX;
  const label = DOCUMENT_NAMES[p.kind as DocumentType] ?? '';

  const [busy, setBusy] = useState<'approve' | 'return' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: [label, p.number].filter(Boolean).join(' ') });
  }, [navigation, label, p.number]);

  const { data: doc, error: loadError, isLoading, refetch } = useQuery({
    queryKey: ['document', p.kind, p.id],
    queryFn: () => getDocument(p.kind, p.id),
  });

  /** The lists change when a document is decided: refresh them, tell the user, go back. */
  function finished(message: string | null) {
    void queryClient.invalidateQueries({ queryKey: ['today'] });
    void queryClient.invalidateQueries({ queryKey: ['group'] });
    void queryClient.invalidateQueries({ queryKey: ['document', p.kind, p.id] });
    notify(message);
    router.back();
  }

  async function approve(confirmOverOrder = false) {
    setBusy('approve');
    setError(null);
    try {
      finished((await approveDocument(p.kind, p.id, confirmOverOrder)).message);
    } catch (e) {
      if (e instanceof ApiError && e.code === OVER_ORDER_CODE) {
        // More than ordered: show the lines, and send again if the user says "Approve anyway".
        const d = e.details as OverOrderDetails;
        Alert.alert(
          QUANTITY_TEXT.OVER_TITLE,
          d.lines.map((l) => QUANTITY_TEXT.overLine(l.partName, d.source, l.ordered, d.verb, l.total)).join('\n'),
          [
            { text: QUANTITY_TEXT.GO_BACK, style: 'cancel' },
            { text: QUANTITY_TEXT.APPROVE_ANYWAY, onPress: () => void approve(true) },
          ],
        );
      } else {
        setError(messageOf(e));
      }
    } finally {
      setBusy(null);
    }
  }

  async function sendBack(remarks: string) {
    setBusy('return');
    setError(null);
    try {
      const { message } = await returnDocument(p.kind, p.id, remarks);
      setReturning(false);
      finished(message);
    } catch (e) {
      setError(messageOf(e)); // shown in the sheet: the remarks may be too short
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (loadError || !doc) {
    return (
      <Centered>
        <ErrorText message={messageOf(loadError)} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const subtotal = doc.subtotal ?? doc.totalAmount;
  const lines = doc.items ?? [];
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        {/* A returned document: the approver's remarks come first, since they say what to fix. */}
        {returned && (doc.approvalRemarks || p.note) ? (
          <View style={[styles.card, { borderColor: colors.lateText }]}>
            <Text style={styles.heading}>Returned{p.by ? ` by ${p.by}` : ''}{p.date ? ` · ${since(p.date)}` : ''}</Text>
            <Text style={styles.body}>{doc.approvalRemarks || p.note}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.party}>{hide.text(doc.vendor?.name ?? p.party)}</Text>
          {!returned ? (
            <Text style={styles.small}>
              {[p.by && `From ${p.by}`, p.date && (canDecide ? since(p.date) : formatDate(p.date))].filter(Boolean).join(', ')}
            </Text>
          ) : null}
        </View>

        <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
          <Text style={[styles.heading, styles.pad]}>Items</Text>
          {lines.map((line) => <Line key={line.id} line={line} />)}
          {lines.length === 0 ? <Text style={[styles.small, styles.pad]}>No items.</Text> : null}
        </View>

        <View style={styles.card}>
          {subtotal != null ? <TotalRow label="Subtotal" value={subtotal} /> : null}
          {doc.taxAmount != null ? <TotalRow label="GST" value={doc.taxAmount} /> : null}
          {doc.grandTotal != null ? <TotalRow label="Total" value={doc.grandTotal} strong /> : null}
        </View>

        {doc.notes ? <TextCard title="Notes" text={doc.notes} /> : null}
        {doc.terms ? <TextCard title="Terms" text={doc.terms} /> : null}
        <ErrorText message={error} />
      </ScrollView>

      {canDecide ? (
        <View style={styles.bar}>
          <Button title="Return" tone="secondary" style={{ flex: 1 }} disabled={busy !== null} onPress={() => { setError(null); setReturning(true); }} />
          <Button
            title="Approve"
            tone="primary"
            style={{ flex: 1 }}
            busy={busy === 'approve'}
            disabled={busy !== null}
            onPress={() =>
              Alert.alert(`Approve ${p.number}?`, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => void approve() }])
            }
          />
        </View>
      ) : null}

      <ReturnSheet
        visible={returning}
        title={`Return ${p.number}`}
        busy={busy === 'return'}
        error={error}
        onClose={() => setReturning(false)}
        onSend={(remarks) => void sendBack(remarks)}
      />
    </SafeAreaView>
  );
}

function Line({ line }: { line: DocumentLine }) {
  const styles = useThemed(makeStyles);
  const hide = useHide();
  const money = (v: number | string) => (hide.hidden ? hide.rupees(0) : formatMoney(v));
  const discount = Number(line.discount) > 0 ? ` · ${formatQty(line.discount)}${line.discountType === 'percentage' ? '%' : ''} off` : '';
  return (
    <View style={styles.line}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.body}>{line.partName}</Text>
        {line.partDescription ? <Text style={styles.small} numberOfLines={2}>{line.partDescription}</Text> : null}
        <Text style={styles.small}>
          {formatQty(line.qty)} {line.uom} × {money(line.unitPrice)}{discount} · GST {formatQty(line.taxRate)}%
        </Text>
      </View>
      <Text style={styles.lineTotal}>{money(line.totalAmount)}</Text>
    </View>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: number | string; strong?: boolean }) {
  const styles = useThemed(makeStyles);
  const hide = useHide();
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.body, strong && { fontWeight: '700' }]}>{label}</Text>
      <Text style={[styles.body, strong && { fontWeight: '700' }]}>{hide.hidden ? hide.rupees(0) : formatMoney(value)}</Text>
    </View>
  );
}

function TextCard({ title, text }: { title: string; text: string }) {
  const styles = useThemed(makeStyles);
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    page: { padding: spacing.md, gap: spacing.md },
    card: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.sm },
    pad: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
    party: { fontSize: 18, fontWeight: '700', color: c.ink },
    heading: { fontSize: 14, fontWeight: '600', color: c.ink },
    body: { fontSize: 14, color: c.ink },
    small: { fontSize: 12, color: c.muted },
    line: {
      flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider, marginTop: spacing.sm,
    },
    lineTotal: { fontSize: 14, fontWeight: '600', color: c.ink },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
