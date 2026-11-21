import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { DOCUMENT_EDIT_TEXT } from 'floman-shared/constants';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PROFORMA_STATUS, QUOTATION_STATUS, QUOTED_QUOTATION_STATUSES, SO_STATUS } from 'floman-shared/statuses';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { Text } from '@/components/AppText';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ReasonSheet } from '@/components/ReasonSheet';
import { useSession } from '@/features/auth/session';
import { getDocumentLock } from '@/features/company/api';
import { notify } from '@/lib/notify';
import { useColors } from '@/theme';
import { cancelQuotation, quotationEditCheck, restoreQuotation, type Quotation } from './api';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Sales Orders and Proformas made from it that are not cancelled: its Cancel waits for them. */
export const liveMadeFrom = (q: Pick<Quotation, 'salesOrders' | 'proformaInvoices'>): string[] => [
  ...(q.salesOrders ?? []).filter((so) => so.status !== SO_STATUS.CANCELLED).map((so) => so.soNumber),
  ...(q.proformaInvoices ?? []).filter((pi) => pi.status !== PROFORMA_STATUS.CANCELLED).map((pi) => pi.proformaNumber),
];

/**
 * What a Quotation can do, as the web's ⋯ menu: Edit (a draft or returned one; an approved one after the server's
 * check), Duplicate, View history, Cancel (waits for the documents made from it) and Restore (a cancelled one).
 * `open(quotation)` shows the menu; render `sheets` once on the screen. Cancel and Restore ask for a reason.
 * `onHistory`: where View history goes when the screen can show it itself (the detail's History tab).
 */
export function useQuotationActions(options: { onHistory?: (q: Quotation) => void } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const { can } = useSession();
  const [target, setTarget] = useState<Quotation | null>(null);
  const [menu, setMenu] = useState(false);
  const [cancelFor, setCancelFor] = useState<Quotation | null>(null);
  const [restoreFor, setRestoreFor] = useState<Quotation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The company's "Lock Approved & Cancelled Docs": Edit (approved) and Restore wait while it is on.
  const lock = useQuery({ queryKey: ['document-lock'], queryFn: getDocumentLock, retry: false });
  const locked = lock.data === true;

  const canCreate = can(PERMISSIONS.QUOTATIONS.CREATE);
  const canUpdate = can(PERMISSIONS.QUOTATIONS.UPDATE);
  // The server lets only someone who may approve cancel a Quotation.
  const canCancel = can(PERMISSIONS.QUOTATIONS.APPROVE);

  const changed = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['quotations'] });
    void queryClient.invalidateQueries({ queryKey: ['quotation', id] });
  };

  const edit = (q: Quotation) => router.push({ pathname: '/sales/quotations/edit', params: { id: q.id } });

  // An approved Quotation: asked first what stops it; a block is told with its words.
  const editApproved = async (q: Quotation) => {
    try {
      const block = await quotationEditCheck(q.id);
      if (block) Alert.alert(DOCUMENT_EDIT_TEXT.blockedTitle('Quotation'), block.message, [{ text: DOCUMENT_EDIT_TEXT.OK }]);
      else edit(q);
    } catch (e) {
      Alert.alert(DOCUMENT_EDIT_TEXT.CHECK_FAILED('Quotation'), message(e));
    }
  };

  const cancel = useMutation({
    mutationFn: ({ q, reason }: { q: Quotation; reason: string }) => cancelQuotation(q.id, reason),
    onSuccess: (_, { q }) => {
      changed(q.id);
      notify(`Quotation "${q.quotationNumber}" marked as CANCELLED.`);
      setCancelFor(null);
    },
    onError: (e) => setError(message(e)),
  });

  const restore = useMutation({
    mutationFn: ({ q, reason }: { q: Quotation; reason: string }) => restoreQuotation(q.id, reason),
    onSuccess: ({ message: said }, { q }) => {
      changed(q.id);
      notify(said);
      setRestoreFor(null);
      // Back as a Draft: its form opens straight away.
      edit(q);
    },
    onError: (e) => setError(message(e)),
  });

  const actionsFor = (q: Quotation): SheetAction[] => {
    const list: SheetAction[] = [];
    const draftOrReturned = q.status === QUOTATION_STATUS.DRAFT || q.status === QUOTATION_STATUS.APPROVER_RETURNED;
    const approved = QUOTED_QUOTATION_STATUSES.includes(q.status);
    const live = liveMadeFrom(q);
    if (canUpdate && draftOrReturned) list.push({ label: 'Edit', onPress: () => edit(q) });
    if (canUpdate && approved) {
      list.push(
        locked
          ? { label: 'Edit', onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.lockedHint('quotations') }
          : { label: 'Edit', onPress: () => void editApproved(q) },
      );
    }
    if (canCreate && q.status !== QUOTATION_STATUS.DRAFT && q.status !== QUOTATION_STATUS.CANCELLED) {
      list.push({ label: 'Duplicate', onPress: () => router.push({ pathname: '/sales/quotations/edit', params: { duplicateFrom: q.id } }) });
    }
    list.push({
      label: 'View history',
      onPress: () => (options.onHistory ? options.onHistory(q) : router.push({ pathname: '/sales/quotations/[id]', params: { id: q.id, tab: 'history' } })),
    });
    if (canCancel && q.status !== QUOTATION_STATUS.CANCELLED) {
      list.push(
        live.length
          ? { label: 'Cancel Quotation', onPress: () => undefined, destructive: true, disabled: true, hint: DOCUMENT_EDIT_TEXT.cancelFirst(live) }
          : { label: 'Cancel Quotation', destructive: true, onPress: () => { setError(null); setCancelFor(q); } },
      );
    }
    // Cancelled: back as a Draft with the same number, once the company's lock is off.
    if (canUpdate && q.status === QUOTATION_STATUS.CANCELLED) {
      list.push(
        locked
          ? { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.RESTORE_LOCKED_HINT }
          : { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => { setError(null); setRestoreFor(q); } },
      );
    }
    return list;
  };

  // "Need to correct it? Edit keeps the same number." — in the Cancel box of an approved Quotation.
  const editInstead =
    cancelFor && canUpdate && !locked && QUOTED_QUOTATION_STATUSES.includes(cancelFor.status) ? (
      <Pressable
        onPress={() => {
          const q = cancelFor;
          setCancelFor(null);
          void editApproved(q);
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
      <ActionSheet visible={menu} title={target?.quotationNumber} actions={target ? actionsFor(target) : []} onClose={() => setMenu(false)} />
      <ReasonSheet
        visible={cancelFor !== null}
        title="Cancel Quotation"
        description={cancelFor ? `Are you sure you want to mark Quotation ${cancelFor.quotationNumber} as CANCELLED? This will void this quotation request.` : ''}
        extra={editInstead}
        label="Cancellation Reason (optional)"
        placeholder="e.g. Project cancelled, pricing expired, vendor changed..."
        confirmText="Yes, Cancel Quotation"
        cancelText="Keep Active"
        tone="danger"
        busy={cancel.isPending}
        error={error}
        onConfirm={(reason) => cancelFor && cancel.mutate({ q: cancelFor, reason })}
        onClose={() => setCancelFor(null)}
      />
      <ReasonSheet
        visible={restoreFor !== null}
        title={DOCUMENT_EDIT_TEXT.restoreTitle('Quotation')}
        description={restoreFor ? `Quotation ${restoreFor.quotationNumber} ${DOCUMENT_EDIT_TEXT.RESTORE_BODY}` : ''}
        label={DOCUMENT_EDIT_TEXT.REASON_LABEL}
        placeholder={DOCUMENT_EDIT_TEXT.REASON_PLACEHOLDER}
        suggestions={DOCUMENT_EDIT_TEXT.REASON_SUGGESTIONS}
        confirmText={DOCUMENT_EDIT_TEXT.RESTORE_CONFIRM}
        cancelText={DOCUMENT_EDIT_TEXT.KEEP_CANCELLED}
        busy={restore.isPending}
        error={error}
        onConfirm={(reason) => restoreFor && restore.mutate({ q: restoreFor, reason })}
        onClose={() => setRestoreFor(null)}
      />
    </>
  );

  return {
    open: (q: Quotation) => {
      setTarget(q);
      setMenu(true);
    },
    /** The menu and the Cancel and Restore boxes: render once on the screen. */
    sheets,
  };
}
