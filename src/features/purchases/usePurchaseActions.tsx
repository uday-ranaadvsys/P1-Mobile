import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { DOCUMENT_EDIT_TEXT, INDENT_LINES_ON_CANCEL, TODAY_GROUP, type IndentLinesOnCancel } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PURCHASE_STATUS, RECEIVABLE_PURCHASE_STATUSES, SPEND_PURCHASE_STATUSES } from 'floman-shared/statuses';
import { useState } from 'react';
import { Alert, Linking, Pressable } from 'react-native';
import { mediaSource } from '@/api/client';
import { Text } from '@/components/AppText';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { IndentLinesChoice } from '@/components/IndentLinesChoice';
import { ReasonSheet } from '@/components/ReasonSheet';
import { useSession } from '@/features/auth/session';
import { getDocumentLock } from '@/features/company/api';
import { notify } from '@/lib/notify';
import { useColors } from '@/theme';
import { cancelPurchase, purchaseEditCheck, restorePurchase, type Purchase } from './api';
import { liveGrns } from './text';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The scanned bill's address, as the phone can open it. */
const billLink = (p: Pick<Purchase, 'billAttachmentUrl' | 'attachmentPaths'>) => {
  const first = p.attachmentPaths?.[0];
  const url = first?.url || first?.path || p.billAttachmentUrl;
  return url ? mediaSource(url)?.uri ?? url : null;
};

/**
 * What a Purchase can do, as the web's ⋯ menu: Edit (a draft, waiting or returned one; an approved or received one
 * after the server's check), Duplicate, Review & approve, Receive goods (GRN), View Scanned Bill, View history, Cancel
 * (waits for its GRNs) and Restore (a cancelled one). `open(purchase)` shows the menu; render `sheets` once on the
 * screen. Cancel asks for a reason and what happens to the items that came from indents; Restore asks for a reason
 * (optional). `onHistory`: where View history goes when the screen can show it itself (the detail's History tab).
 */
export function usePurchaseActions(options: { onHistory?: (purchase: Purchase) => void } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const { can } = useSession();
  const [target, setTarget] = useState<Purchase | null>(null);
  const [menu, setMenu] = useState(false);
  const [cancelFor, setCancelFor] = useState<Purchase | null>(null);
  const [restoreFor, setRestoreFor] = useState<Purchase | null>(null);
  const [indentLines, setIndentLines] = useState<IndentLinesOnCancel>(INDENT_LINES_ON_CANCEL.RELEASE);
  const [error, setError] = useState<string | null>(null);

  // The company's "Lock Approved & Cancelled Docs": Edit (approved) and Restore wait while it is on.
  const lock = useQuery({ queryKey: ['document-lock'], queryFn: getDocumentLock, retry: false });
  const locked = lock.data === true;

  const canCreate = can(PERMISSIONS.PURCHASES.CREATE);
  const canUpdate = can(PERMISSIONS.PURCHASES.UPDATE);
  const canApprove = can(PERMISSIONS.PURCHASES.APPROVE);
  const canReceive = can(PERMISSIONS.GRNS.CREATE);

  const changed = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['purchases'] });
    void queryClient.invalidateQueries({ queryKey: ['purchase', id] });
  };

  const edit = (p: Purchase) => router.push({ pathname: '/purchase/purchases/edit', params: { id: p.id } });

  // An approved Purchase: asked first what stops it (only the lock); a block is told with its words.
  const editApproved = async (p: Purchase) => {
    try {
      const block = await purchaseEditCheck(p.id);
      if (block) Alert.alert(DOCUMENT_EDIT_TEXT.blockedTitle('Purchase'), block.message, [{ text: DOCUMENT_EDIT_TEXT.OK }]);
      else edit(p);
    } catch (e) {
      Alert.alert(DOCUMENT_EDIT_TEXT.CHECK_FAILED('Purchase'), message(e));
    }
  };

  const cancel = useMutation({
    mutationFn: ({ p, reason }: { p: Purchase; reason: string }) => cancelPurchase(p.id, reason, indentLines),
    onSuccess: (_, { p }) => {
      changed(p.id);
      notify(`Purchase "${p.purchaseNumber}" cancelled.`);
      setCancelFor(null);
    },
    onError: (e) => setError(message(e)),
  });

  const restore = useMutation({
    mutationFn: ({ p, reason }: { p: Purchase; reason: string }) => restorePurchase(p.id, reason),
    onSuccess: ({ message: said }, { p }) => {
      changed(p.id);
      notify(said);
      setRestoreFor(null);
      // Back as a Draft: its form opens straight away.
      edit(p);
    },
    onError: (e) => setError(message(e)),
  });

  const actionsFor = (p: Purchase): SheetAction[] => {
    const list: SheetAction[] = [];
    const editable = ([PURCHASE_STATUS.DRAFT, PURCHASE_STATUS.PENDING_APPROVAL, PURCHASE_STATUS.RETURNED] as string[]).includes(p.status);
    const approved = SPEND_PURCHASE_STATUSES.includes(p.status);
    const reviewable = canApprove && (p.status === PURCHASE_STATUS.PENDING_APPROVAL || p.status === PURCHASE_STATUS.RETURNED);
    const live = liveGrns(p);
    const bill = billLink(p);
    if (canUpdate && editable) list.push({ label: 'Edit', onPress: () => edit(p) });
    if (canUpdate && approved) {
      list.push(
        locked
          ? { label: 'Edit', onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.lockedHint('Purchases') }
          : { label: 'Edit', onPress: () => void editApproved(p) },
      );
    }
    if (canCreate) list.push({ label: 'Duplicate', onPress: () => router.push({ pathname: '/purchase/purchases/edit', params: { duplicateFrom: p.id } }) });
    if (reviewable) {
      list.push({
        label: 'Review & approve',
        onPress: () =>
          router.push({
            pathname: '/document/[kind]/[id]',
            params: { kind: DOCUMENT_TYPE.PURCHASE, id: p.id, group: TODAY_GROUP.APPROVE, number: p.purchaseNumber, party: p.vendor?.name ?? '', date: p.createdAt ?? '' },
          }),
      });
    }
    // Approved and not fully received: goods still to come.
    if (canReceive && RECEIVABLE_PURCHASE_STATUSES.includes(p.status)) {
      list.push({ label: 'Receive goods (GRN)', onPress: () => router.push({ pathname: '/purchase/grns/edit', params: { fromPurchase: p.id } }) });
    }
    if (bill) list.push({ label: 'View Scanned Bill', onPress: () => void Linking.openURL(bill) });
    list.push({
      label: 'View history',
      onPress: () => (options.onHistory ? options.onHistory(p) : router.push({ pathname: '/purchase/purchases/[id]', params: { id: p.id, tab: 'history' } })),
    });
    if (canApprove && p.status !== PURCHASE_STATUS.CANCELLED) {
      list.push(
        live.length
          ? { label: 'Cancel Purchase', onPress: () => undefined, destructive: true, disabled: true, hint: DOCUMENT_EDIT_TEXT.cancelFirst(live) }
          : { label: 'Cancel Purchase', destructive: true, onPress: () => { setError(null); setIndentLines(INDENT_LINES_ON_CANCEL.RELEASE); setCancelFor(p); } },
      );
    }
    // Cancelled: back as a Draft with the same number, once the company's lock is off.
    if (canUpdate && p.status === PURCHASE_STATUS.CANCELLED) {
      list.push(
        locked
          ? { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.RESTORE_LOCKED_HINT }
          : { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => { setError(null); setRestoreFor(p); } },
      );
    }
    return list;
  };

  // "Need to correct it? Edit keeps the same number." — in the Cancel box of an approved Purchase.
  const editInstead =
    cancelFor && canUpdate && !locked && SPEND_PURCHASE_STATUSES.includes(cancelFor.status) ? (
      <Pressable
        onPress={() => {
          const p = cancelFor;
          setCancelFor(null);
          void editApproved(p);
        }}
        accessibilityRole="button"
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.ink }}>
          {DOCUMENT_EDIT_TEXT.CANCEL_HINT} <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }}>{DOCUMENT_EDIT_TEXT.EDIT_INSTEAD}</Text>
        </Text>
      </Pressable>
    ) : null;

  const sheets = (
    <>
      <ActionSheet visible={menu} title={target?.purchaseNumber} actions={target ? actionsFor(target) : []} onClose={() => setMenu(false)} />
      <ReasonSheet
        visible={cancelFor !== null}
        title={cancelFor ? `Cancel Purchase "${cancelFor.purchaseNumber}"` : 'Cancel Purchase'}
        description="Are you sure you want to cancel this Purchase?"
        extra={
          <>
            {editInstead}
            <IndentLinesChoice value={indentLines} onChange={setIndentLines} disabled={cancel.isPending} />
          </>
        }
        label="Cancellation Reason (optional)"
        placeholder="Specify reason for cancelling this Purchase..."
        confirmText="Cancel Purchase"
        cancelText="Keep"
        tone="danger"
        busy={cancel.isPending}
        error={error}
        onConfirm={(reason) => cancelFor && cancel.mutate({ p: cancelFor, reason })}
        onClose={() => setCancelFor(null)}
      />
      <ReasonSheet
        visible={restoreFor !== null}
        title={DOCUMENT_EDIT_TEXT.restoreTitle('Purchase')}
        description={restoreFor ? `Purchase ${restoreFor.purchaseNumber} ${DOCUMENT_EDIT_TEXT.RESTORE_BODY}` : ''}
        label={DOCUMENT_EDIT_TEXT.REASON_LABEL}
        placeholder={DOCUMENT_EDIT_TEXT.REASON_PLACEHOLDER}
        suggestions={DOCUMENT_EDIT_TEXT.REASON_SUGGESTIONS}
        confirmText={DOCUMENT_EDIT_TEXT.RESTORE_CONFIRM}
        cancelText={DOCUMENT_EDIT_TEXT.KEEP_CANCELLED}
        busy={restore.isPending}
        error={error}
        onConfirm={(reason) => restoreFor && restore.mutate({ p: restoreFor, reason })}
        onClose={() => setRestoreFor(null)}
      />
    </>
  );

  return {
    open: (p: Purchase) => {
      setTarget(p);
      setMenu(true);
    },
    /** The menu and the Cancel and Restore boxes: render once on the screen. */
    sheets,
  };
}
