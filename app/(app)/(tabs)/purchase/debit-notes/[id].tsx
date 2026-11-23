import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { DISCOUNT_TYPE } from 'floman-shared/constants';
import { gstinOrUnregistered } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { NOTE_STATUS } from 'floman-shared/statuses';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { getDebitNote } from '@/features/debit-notes/api';
import { StatusPill } from '@/features/debit-notes/components/DebitNoteRow';
import { EDITABLE, sourceText } from '@/features/debit-notes/text';
import { useDebitNoteActions } from '@/features/debit-notes/useDebitNoteActions';
import { HistoryTimeline } from '@/features/quotations/components/HistoryTimeline';
import { money, personName } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const TAB = { ITEMS: 'items', DETAILS: 'details', LINKED: 'linked', HISTORY: 'history' } as const;
type Tab = (typeof TAB)[keyof typeof TAB];

/**
 * One Debit Note, as the web's side panel: the total and what is left of it, what to do next, then Items, Details, Linked
 * documents and History. Review opens the Approve / Return screen; the ⋯ menu has Edit, Share PDF, Cancel and Restore.
 */
export default function DebitNoteDetail() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [tab, setTab] = useState<Tab>(tabParam === TAB.HISTORY ? TAB.HISTORY : TAB.ITEMS);
  const actions = useDebitNoteActions({ onHistory: () => setTab(TAB.HISTORY) });

  const { data: note, error, isLoading, refetch } = useQuery({ queryKey: ['debit-note', id], queryFn: () => getDebitNote(id!) });
  // Back from the form or the review screen: show what changed.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (error || !note) {
    return (
      <Centered>
        <ErrorText message={error instanceof Error ? error.message : 'Debit Note not found'} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const items = note.items ?? [];
  const amount = (v: number | string | null | undefined) => (hide.hidden ? hide.rupees(0) : money(v));
  const editable = can(PERMISSIONS.DEBIT_NOTES.UPDATE) && EDITABLE.includes(note.status);
  const editApproved = can(PERMISSIONS.DEBIT_NOTES.UPDATE) && note.status === NOTE_STATUS.APPROVED;
  const reviewable = actions.approvable(note) && note.status === NOTE_STATUS.PENDING_APPROVAL;
  const issued = note.status === NOTE_STATUS.APPROVED;
  const left = Number(note.unappliedAmount) || 0;

  // What to do now, and what was said about it (the web's "next step" card).
  const nextStep = ((): { title: string; body: string } | null => {
    const said = (text?: string | null) => (text ? `“${text}”\n` : '');
    switch (note.status) {
      case NOTE_STATUS.DRAFT:
        return { title: 'Finish it and send it for approval', body: 'Open it, check the lines, then send it.' };
      case NOTE_STATUS.PENDING_APPROVAL:
        return can(PERMISSIONS.DEBIT_NOTES.APPROVE)
          ? { title: 'Your decision', body: 'Review the lines, then approve it or return it with a remark.' }
          : { title: 'Waiting for approval', body: 'An approver will approve it or return it with a remark.' };
      case NOTE_STATUS.RETURNED:
        return { title: 'Returned for changes', body: `${said(note.approvalRemarks)}${note.returnedAt ? `Returned on ${formatDate(note.returnedAt)}. ` : ''}Edit it and send it again.` };
      case NOTE_STATUS.APPROVED:
        return { title: 'Approved', body: left > 0 ? `${money(left)} is still unused: it can be linked to a GRN or received back from the vendor on the web.` : 'Its whole amount is used.' };
      case NOTE_STATUS.CANCELLED:
        return { title: 'Cancelled', body: `${said(note.cancellationReason)}${note.cancelledAt ? `Cancelled on ${formatDate(note.cancelledAt)}${note.cancelledBy ? ` by ${personName(note.cancelledBy)}` : ''}.` : ''}` };
      default:
        return null;
    }
  })();

  const links = note.allocations ?? [];
  const refunds = note.refunds ?? [];
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: TAB.ITEMS, label: 'Items', count: items.length },
    { key: TAB.DETAILS, label: 'Details' },
    { key: TAB.LINKED, label: 'Linked documents', count: (note.grn ? 1 : 0) + links.filter((l) => l.grnId !== note.grnId).length + refunds.length },
    { key: TAB.HISTORY, label: 'History' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenTitle back="Debit Notes" />

        <View style={{ gap: spacing.xs }}>
          <View style={styles.numberRow}>
            <Text style={[styles.number, { flex: 1 }]} accessibilityRole="header">{note.noteNumber}</Text>
            <Pressable onPress={() => actions.open(note)} accessibilityRole="button" accessibilityLabel="Actions" style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <StatusPill status={note.status} edited={Boolean(note.editedAt)} />
          <Text style={styles.sub}>Dated {formatDate(note.noteDate)}{note.grn ? ` · ${sourceText(note)}` : ''}</Text>
          {note.vendor ? <Text style={styles.sub}>{hide.text(note.vendor.name)}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.totalLabel}>Debit Total</Text>
          <Text style={styles.total}>{amount(note.grandTotal)}</Text>
          <Text style={styles.sub}>{Number(note.taxAmount) === 0 ? 'No GST' : `Taxable ${amount(note.subtotal)} + GST ${amount(note.taxAmount)}`}</Text>
          {issued ? (
            <View style={{ gap: 2, marginTop: spacing.xs }}>
              <Text style={styles.small}>Adjusted on GRNs {amount(note.appliedAmount)} · Received back {amount(note.refundedAmount)}</Text>
              <Text style={[styles.small, left > 0 && { color: colors.warnText, fontWeight: '600' }]}>Debit left (vendor owes us) {amount(left)}</Text>
            </View>
          ) : null}
        </View>

        {nextStep ? (
          <View style={styles.card}>
            <Text style={styles.nextTitle}>{nextStep.title}</Text>
            {nextStep.body ? <Text style={styles.sub}>{nextStep.body}</Text> : null}
          </View>
        ) : null}

        {note.grn ? <Button title={`Open ${note.grn.grnNumber}`} tone="secondary" onPress={() => router.push({ pathname: '/purchase/grns/[id]', params: { id: note.grn!.id } })} /> : null}
        <Button title="Share PDF" tone="secondary" onPress={() => void actions.share(note)} busy={actions.sharing} />
        {editable ? <Button title="Edit" tone={reviewable ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/purchase/debit-notes/edit', params: { id: note.id } })} /> : null}
        {editApproved && !actions.locked ? <Button title="Edit" tone="secondary" onPress={() => void actions.editApproved(note)} /> : null}
        {reviewable ? <Button title="Review" onPress={() => actions.review(note)} /> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}>
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.chipText}>
                  {t.label}
                  {t.count !== undefined ? <Text style={{ color: colors.muted, fontWeight: '400' }}> {t.count}</Text> : null}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab === TAB.ITEMS ? (
          <View style={[styles.card, { padding: 0 }]}>
            {items.map((item, i) => (
              <View key={item.id ?? i} style={[styles.line, i > 0 && styles.lineDivider]}>
                <View style={styles.lineTop}>
                  <Text style={styles.lineNo}>{i + 1}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.lineName}>{item.partName}</Text>
                    {item.partCode || item.hsn ? <Text style={styles.small}>{[item.partCode, item.hsn && `HSN ${item.hsn}`].filter(Boolean).join(' · ')}</Text> : null}
                  </View>
                  <Text style={styles.lineTotal}>{amount(item.totalAmount)}</Text>
                </View>
                <Text style={styles.small}>
                  {Number(item.qty)} {item.uom} × {amount(item.unitPrice)}
                  {Number(item.discount) ? ` · Disc ${Number(item.discount)}${item.discountType === DISCOUNT_TYPE.AMOUNT ? '' : '%'}` : ''} · GST {Number(item.taxRate)}%
                </Text>
              </View>
            ))}
            {items.length === 0 ? <Text style={[styles.sub, { padding: spacing.md }]}>No items.</Text> : null}
          </View>
        ) : null}

        {tab === TAB.DETAILS ? (
          <View style={{ gap: spacing.lg }}>
            <View>
              <SectionHeader>Vendor</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="Name" value={note.vendor ? hide.text(note.vendor.name) : null} />
                <InfoRow label="GSTIN" value={note.vendor ? hide.text(gstinOrUnregistered(note.vendor.gstin)) : null} />
                <InfoRow label="City" value={note.vendor?.city ? hide.text(note.vendor.city) : null} />
              </View>
            </View>
            <View>
              <SectionHeader>Debit Note</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="GRN" value={note.grn?.grnNumber ?? null} />
                <InfoRow label="Vendor Bill No" value={note.grn?.vendorInvoiceNumber ?? null} />
                <InfoRow label="Bill Date" value={note.grn?.vendorInvoiceDate ? formatDate(note.grn.vendorInvoiceDate) : null} />
                <InfoRow label="Received Date" value={note.grn?.grnDate ? formatDate(note.grn.grnDate) : null} />
                <InfoRow label="Reason" value={note.reason} />
                <InfoRow label="Vendor Credit Note No" value={note.partyNoteNumber ?? null} />
                <InfoRow label="Vendor Credit Note Date" value={note.partyNoteDate ? formatDate(note.partyNoteDate) : null} />
                <InfoRow label="Raised by" value={note.createdBy ? `${personName(note.createdBy)} · ${formatDate(note.createdAt)}` : null} />
                <InfoRow label="Approved by" value={note.approvedBy && note.approvedAt ? `${personName(note.approvedBy)} · ${formatDate(note.approvedAt)}` : null} />
              </View>
            </View>
            {note.notes ? (
              <View>
                <SectionHeader>Notes</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{note.notes}</Text></View>
              </View>
            ) : null}
            {note.terms ? (
              <View>
                <SectionHeader>Terms & Conditions</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{note.terms}</Text></View>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === TAB.LINKED ? (
          <View style={[styles.card, { padding: 0 }]}>
            {note.grn ? (
              <Pressable onPress={() => router.push({ pathname: '/purchase/grns/[id]', params: { id: note.grn!.id } })} accessibilityRole="button" style={({ pressed }) => [styles.linked, pressed && { opacity: 0.6 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.lineName}>{note.grn.grnNumber}</Text>
                  <Text style={styles.small}>GRN it is against</Text>
                </View>
                <Text style={styles.lineTotal}>{amount(note.grn.grandTotal)}</Text>
              </Pressable>
            ) : null}
            {links.filter((l) => l.grnId !== note.grnId).map((l) => (
              <Pressable key={l.id} onPress={() => l.grn && router.push({ pathname: '/purchase/grns/[id]', params: { id: l.grn.id } })} accessibilityRole="button" style={({ pressed }) => [styles.linked, styles.lineDivider, pressed && { opacity: 0.6 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.lineName}>{l.grn?.grnNumber ?? 'GRN'}</Text>
                  <Text style={styles.small}>Debit adjusted here</Text>
                </View>
                <Text style={styles.lineTotal}>{amount(l.amount)}</Text>
              </Pressable>
            ))}
            {refunds.map((r) => (
              <View key={r.id} style={[styles.linked, styles.lineDivider]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.lineName}>Received back</Text>
                  <Text style={styles.small}>{[formatDate(r.payment.paymentDate), r.payment.mode, r.payment.referenceNo].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={styles.lineTotal}>{amount(r.amount)}</Text>
              </View>
            ))}
            {!note.grn && links.length === 0 && refunds.length === 0 ? <Text style={[styles.sub, { padding: spacing.md }]}>Nothing linked yet.</Text> : null}
          </View>
        ) : null}

        {tab === TAB.HISTORY ? <HistoryTimeline entries={note.auditLogs ?? []} /> : null}
      </ScrollView>
      {actions.sheets}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    number: { ...type.title1, color: c.ink },
    numberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    more: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    sub: { ...type.subhead, color: c.muted },
    body: { ...type.body, color: c.ink },
    small: { ...type.footnote, color: c.muted },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.xs },
    totalLabel: { ...type.footnote, color: c.muted },
    total: { ...type.title1, color: c.ink },
    nextTitle: { ...type.headline, color: c.ink },
    tabs: { marginHorizontal: -spacing.md, flexGrow: 0 },
    chip: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, justifyContent: 'center' },
    chipActive: { borderColor: c.brandText, backgroundColor: c.brandTint },
    chipText: { ...type.subhead, fontWeight: '600', color: c.ink },
    line: { padding: spacing.md, gap: spacing.xs },
    lineDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    lineTop: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    lineNo: { ...type.footnote, color: c.faint, width: 18 },
    lineName: { ...type.headline, color: c.ink },
    lineTotal: { ...type.headline, color: c.ink },
    linked: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  });
