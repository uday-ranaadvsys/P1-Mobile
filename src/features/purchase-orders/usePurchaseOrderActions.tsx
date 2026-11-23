import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { DOCUMENT_EDIT_TEXT, INDENT_LINES_ON_CANCEL, type IndentLinesOnCancel } from 'floman-shared/constants';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PO_STATUS, RECEIVABLE_PO_STATUSES, SPEND_PO_STATUSES } from 'floman-shared/statuses';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { Text } from '@/components/AppText';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { BusyModal } from '@/components/BusyModal';
import { IndentLinesChoice } from '@/components/IndentLinesChoice';
import { ReasonSheet } from '@/components/ReasonSheet';
import { useSession } from '@/features/auth/session';
import { getDocumentLock } from '@/features/company/api';
import { notify } from '@/lib/notify';
import { sharePdf } from '@/lib/sharePdf';
import { useColors } from '@/theme';
import { cancelPurchaseOrder, purchaseOrderEditCheck, restorePurchaseOrder, type PurchaseOrder } from './api';
import { liveGrns, pdfName } from './text';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * What a Purchase Order can do, as the web's ⋯ menu: Edit (a draft or returned one; an approved or received one after
 * the server's check), Duplicate, Share PDF, View history, Cancel (waits for its GRNs) and Restore (a cancelled one).
 * `open(order)` shows the menu; render `sheets` once on the screen. Cancel asks for a reason and what happens to the
 * items that came from indents; Restore asks for a reason (optional).
 * `onHistory`: where View history goes when the screen can show it itself (the detail's History tab).
 */
export function usePurchaseOrderActions(options: { onHistory?: (po: PurchaseOrder) => void } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const { can } = useSession();
  const [target, setTarget] = useState<PurchaseOrder | null>(null);
  const [menu, setMenu] = useState(false);
  const [cancelFor, setCancelFor] = useState<PurchaseOrder | null>(null);
  const [restoreFor, setRestoreFor] = useState<PurchaseOrder | null>(null);
  const [indentLines, setIndentLines] = useState<IndentLinesOnCancel>(INDENT_LINES_ON_CANCEL.RELEASE);
  const [error, setError] = useState<string | null>(null);

  // The company's "Lock Approved & Cancelled Docs": Edit (approved) and Restore wait while it is on.
  const lock = useQuery({ queryKey: ['document-lock'], queryFn: getDocumentLock, retry: false });
  const locked = lock.data === true;

  const canCreate = can(PERMISSIONS.PURCHASE_ORDERS.CREATE);
  const canUpdate = can(PERMISSIONS.PURCHASE_ORDERS.UPDATE);
  // The server lets only someone who may approve cancel an order.
  const canCancel = can(PERMISSIONS.PURCHASE_ORDERS.APPROVE);
  const canCreateGrn = can(PERMISSIONS.GRNS.CREATE);

  const changed = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
  };

  // Share PDF: the server makes it (the default print template), then the phone's share sheet opens (WhatsApp, email, save).
  const [preparing, setPreparing] = useState(false);
  const share = async (po: PurchaseOrder) => {
    setPreparing(true);
    try {
      await sharePdf(`/purchase-orders/${po.id}/pdf`, pdfName(po), `Purchase Order ${po.poNumber}`);
    } catch (e) {
      Alert.alert('Could not share the PDF', message(e));
    } finally {
      setPreparing(false);
    }
  };

  const edit = (po: PurchaseOrder) => router.push({ pathname: '/purchase/purchase-orders/edit', params: { id: po.id } });

  // An approved order: asked first what stops it; a block is told with its words.
  const editApproved = async (po: PurchaseOrder) => {
    try {
      const block = await purchaseOrderEditCheck(po.id);
      if (block) Alert.alert(DOCUMENT_EDIT_TEXT.blockedTitle('Purchase Order'), block.message, [{ text: DOCUMENT_EDIT_TEXT.OK }]);
      else edit(po);
    } catch (e) {
      Alert.alert(DOCUMENT_EDIT_TEXT.CHECK_FAILED('Purchase Order'), message(e));
    }
  };

  const cancel = useMutation({
    mutationFn: ({ po, reason }: { po: PurchaseOrder; reason: string }) => cancelPurchaseOrder(po.id, reason, indentLines),
    onSuccess: (_, { po }) => {
      changed(po.id);
      notify(`Purchase Order "${po.poNumber}" marked as CANCELLED.`);
      setCancelFor(null);
    },
    onError: (e) => setError(message(e)),
  });

  const restore = useMutation({
    mutationFn: ({ po, reason }: { po: PurchaseOrder; reason: string }) => restorePurchaseOrder(po.id, reason),
    onSuccess: ({ message: said }, { po }) => {
      changed(po.id);
      notify(said);
      setRestoreFor(null);
      // Back as a Draft: its form opens straight away.
      edit(po);
    },
    onError: (e) => setError(message(e)),
  });

  const actionsFor = (po: PurchaseOrder): SheetAction[] => {
    const list: SheetAction[] = [];
    const draftOrReturned = po.status === PO_STATUS.DRAFT || po.status === PO_STATUS.RETURNED;
    const approved = SPEND_PO_STATUSES.includes(po.status);
    const live = liveGrns(po);
    if (canUpdate && draftOrReturned) list.push({ label: 'Edit', onPress: () => edit(po) });
    if (canUpdate && approved) {
      list.push(
        locked
          ? { label: 'Edit', onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.lockedHint('Purchase Orders') }
          : { label: 'Edit', onPress: () => void editApproved(po) },
      );
    }
    if (canCreate && po.status !== PO_STATUS.DRAFT && po.status !== PO_STATUS.CANCELLED) {
      list.push({ label: 'Duplicate', onPress: () => router.push({ pathname: '/purchase/purchase-orders/edit', params: { duplicateFrom: po.id } }) });
    }
    list.push({ label: 'Share PDF', onPress: () => void share(po) });
    // Approved and not fully received: goods still to come (the web's Create GRN).
    if (canCreateGrn && RECEIVABLE_PO_STATUSES.includes(po.status)) {
      list.push({ label: 'Create GRN', onPress: () => router.push({ pathname: '/purchase/grns/edit', params: { fromPo: po.id } }) });
    }
    list.push({
      label: 'View history',
      onPress: () => (options.onHistory ? options.onHistory(po) : router.push({ pathname: '/purchase/purchase-orders/[id]', params: { id: po.id, tab: 'history' } })),
    });
    if (canCancel && po.status !== PO_STATUS.CANCELLED && po.status !== PO_STATUS.RECEIVED) {
      list.push(
        live.length
          ? { label: 'Cancel Purchase Order', onPress: () => undefined, destructive: true, disabled: true, hint: DOCUMENT_EDIT_TEXT.cancelFirst(live) }
          : { label: 'Cancel Purchase Order', destructive: true, onPress: () => { setError(null); setIndentLines(INDENT_LINES_ON_CANCEL.RELEASE); setCancelFor(po); } },
      );
    }
    // Cancelled: back as a Draft with the same number, once the company's lock is off.
    if (canUpdate && po.status === PO_STATUS.CANCELLED) {
      list.push(
        locked
          ? { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.RESTORE_LOCKED_HINT }
          : { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => { setError(null); setRestoreFor(po); } },
      );
    }
    return list;
  };

  // "Need to correct it? Edit keeps the same number." — in the Cancel box of an approved order.
  const editInstead =
    cancelFor && canUpdate && !locked && SPEND_PO_STATUSES.includes(cancelFor.status) ? (
      <Pressable
        onPress={() => {
          const po = cancelFor;
          setCancelFor(null);
          void editApproved(po);
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
      <BusyModal visible={preparing} text="Preparing the PDF…" />
      <ActionSheet visible={menu} title={target?.poNumber} actions={target ? actionsFor(target) : []} onClose={() => setMenu(false)} />
      <ReasonSheet
        visible={cancelFor !== null}
        title={cancelFor ? `Cancel Purchase Order "${cancelFor.poNumber}"` : 'Cancel Purchase Order'}
        description="Are you sure you want to cancel this Purchase Order? This will revoke pending deliveries and prevent subsequent billing."
        extra={
          <>
            {editInstead}
            <IndentLinesChoice value={indentLines} onChange={setIndentLines} disabled={cancel.isPending} />
          </>
        }
        label="Cancellation Reason"
        placeholder="Specify reason for cancelling this Purchase Order..."
        confirmText="Cancel Purchase Order"
        cancelText="Keep"
        tone="danger"
        required
        busy={cancel.isPending}
        error={error}
        onConfirm={(reason) => cancelFor && cancel.mutate({ po: cancelFor, reason })}
        onClose={() => setCancelFor(null)}
      />
      <ReasonSheet
        visible={restoreFor !== null}
        title={DOCUMENT_EDIT_TEXT.restoreTitle('Purchase Order')}
        description={restoreFor ? `Purchase Order ${restoreFor.poNumber} ${DOCUMENT_EDIT_TEXT.RESTORE_BODY}` : ''}
        label={DOCUMENT_EDIT_TEXT.REASON_LABEL}
        placeholder={DOCUMENT_EDIT_TEXT.REASON_PLACEHOLDER}
        suggestions={DOCUMENT_EDIT_TEXT.REASON_SUGGESTIONS}
        confirmText={DOCUMENT_EDIT_TEXT.RESTORE_CONFIRM}
        cancelText={DOCUMENT_EDIT_TEXT.KEEP_CANCELLED}
        busy={restore.isPending}
        error={error}
        onConfirm={(reason) => restoreFor && restore.mutate({ po: restoreFor, reason })}
        onClose={() => setRestoreFor(null)}
      />
    </>
  );

  return {
    open: (po: PurchaseOrder) => {
      setTarget(po);
      setMenu(true);
    },
    /** Makes the PDF and opens the share sheet (the detail screen's Share PDF button). */
    share,
    sharing: preparing,
    /** The menu and the Cancel and Restore boxes: render once on the screen. */
    sheets,
  };
}
