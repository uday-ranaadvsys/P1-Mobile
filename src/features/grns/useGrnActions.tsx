import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { DOCUMENT_EDIT_TEXT, TODAY_GROUP } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { PERMISSIONS } from 'floman-shared/permissions';
import { GRN_STATUS, PAYABLE_GRN_STATUSES } from 'floman-shared/statuses';
import { useState } from 'react';
import { Alert, Linking, Pressable } from 'react-native';
import { Text } from '@/components/AppText';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { BusyModal } from '@/components/BusyModal';
import { ReasonSheet } from '@/components/ReasonSheet';
import { mediaSource } from '@/api/client';
import { useSession } from '@/features/auth/session';
import { getDocumentLock } from '@/features/company/api';
import { notify } from '@/lib/notify';
import { sharePdf } from '@/lib/sharePdf';
import { useColors } from '@/theme';
import { cancelGrn, grnEditCheck, restoreGrn, type Grn } from './api';
import { billFiles, pdfName } from './text';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * What a GRN can do, as the web's ⋯ menu: Edit (a draft, waiting or returned one; an approved or received one after
 * the server's check), Duplicate, Share PDF, Review & approve, View Scanned Bill, View history, Cancel and Restore (a
 * cancelled one). `open(grn)` shows the menu; render `sheets` once on the screen. Cancel asks for a reason (stock is
 * taken back out); Restore asks for a reason (optional).
 * `onHistory`: where View history goes when the screen can show it itself (the detail's History tab).
 */
export function useGrnActions(options: { onHistory?: (grn: Grn) => void } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const { can } = useSession();
  const [target, setTarget] = useState<Grn | null>(null);
  const [menu, setMenu] = useState(false);
  const [cancelFor, setCancelFor] = useState<Grn | null>(null);
  const [restoreFor, setRestoreFor] = useState<Grn | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The company's "Lock Approved & Cancelled Docs": Edit (approved) and Restore wait while it is on.
  const lock = useQuery({ queryKey: ['document-lock'], queryFn: getDocumentLock, retry: false });
  const locked = lock.data === true;

  const canCreate = can(PERMISSIONS.GRNS.CREATE);
  const canUpdate = can(PERMISSIONS.GRNS.UPDATE);
  const canApprove = can(PERMISSIONS.GRNS.APPROVE);

  const changed = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['grns'] });
    void queryClient.invalidateQueries({ queryKey: ['grn', id] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-order'] });
  };

  const edit = (grn: Grn) => router.push({ pathname: '/purchase/grns/edit', params: { id: grn.id } });

  // Share PDF: the server makes it (the default print template), then the phone's share sheet opens (WhatsApp, email, save).
  const [preparing, setPreparing] = useState(false);
  const share = async (grn: Grn) => {
    setPreparing(true);
    try {
      await sharePdf(`/grns/${grn.id}/pdf`, pdfName(grn), `GRN ${grn.grnNumber}`);
    } catch (e) {
      Alert.alert('Could not share the PDF', message(e));
    } finally {
      setPreparing(false);
    }
  };

  // An approved GRN: asked first what stops it (the lock, or a live Debit Note); a block is told with its words.
  const editApproved = async (grn: Grn) => {
    try {
      const block = await grnEditCheck(grn.id);
      if (block) Alert.alert(DOCUMENT_EDIT_TEXT.blockedTitle('GRN'), block.message, [{ text: DOCUMENT_EDIT_TEXT.OK }]);
      else edit(grn);
    } catch (e) {
      Alert.alert(DOCUMENT_EDIT_TEXT.CHECK_FAILED('GRN'), message(e));
    }
  };

  const cancel = useMutation({
    mutationFn: ({ grn, reason }: { grn: Grn; reason: string }) => cancelGrn(grn.id, reason),
    onSuccess: (_, { grn }) => {
      changed(grn.id);
      notify(`GRN "${grn.grnNumber}" cancelled and stock reverted.`);
      setCancelFor(null);
    },
    onError: (e) => setError(message(e)),
  });

  const restore = useMutation({
    mutationFn: ({ grn, reason }: { grn: Grn; reason: string }) => restoreGrn(grn.id, reason),
    onSuccess: ({ message: said }, { grn }) => {
      changed(grn.id);
      notify(said);
      setRestoreFor(null);
      // Back as a Draft: its form opens straight away.
      edit(grn);
    },
    onError: (e) => setError(message(e)),
  });

  const actionsFor = (grn: Grn): SheetAction[] => {
    const list: SheetAction[] = [];
    const draftOrWaiting = ([GRN_STATUS.DRAFT, GRN_STATUS.PENDING_APPROVAL, GRN_STATUS.RETURNED] as string[]).includes(grn.status);
    const approved = PAYABLE_GRN_STATUSES.includes(grn.status);
    const reviewable = canApprove && (grn.status === GRN_STATUS.PENDING_APPROVAL || grn.status === GRN_STATUS.RETURNED);
    const firstBill = billFiles(grn)[0];
    if (canUpdate && draftOrWaiting) list.push({ label: 'Edit', onPress: () => edit(grn) });
    if (canUpdate && approved) {
      list.push(
        locked
          ? { label: 'Edit', onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.lockedHint('GRNs') }
          : { label: 'Edit', onPress: () => void editApproved(grn) },
      );
    }
    if (canCreate) list.push({ label: 'Duplicate', onPress: () => router.push({ pathname: '/purchase/grns/edit', params: { duplicateFrom: grn.id } }) });
    list.push({ label: 'Share PDF', onPress: () => void share(grn) });
    // An approved GRN: money claimed back from the vendor for goods returned or a price change.
    if (can(PERMISSIONS.DEBIT_NOTES.CREATE) && approved) list.push({ label: 'Create Debit Note', onPress: () => router.push({ pathname: '/purchase/debit-notes/edit', params: { sourceId: grn.id } }) });
    if (reviewable) {
      list.push({
        label: 'Review & approve',
        onPress: () =>
          router.push({
            pathname: '/document/[kind]/[id]',
            params: { kind: DOCUMENT_TYPE.GRN, id: grn.id, group: TODAY_GROUP.APPROVE, number: grn.grnNumber, party: grn.vendor?.name ?? '', date: grn.createdAt },
          }),
      });
    }
    if (firstBill?.url) list.push({ label: 'View Scanned Bill', onPress: () => void Linking.openURL(mediaSource(firstBill.url)?.uri ?? firstBill.url) });
    list.push({
      label: 'View history',
      onPress: () => (options.onHistory ? options.onHistory(grn) : router.push({ pathname: '/purchase/grns/[id]', params: { id: grn.id, tab: 'history' } })),
    });
    if (canApprove && grn.status !== GRN_STATUS.CANCELLED) {
      list.push({ label: 'Cancel GRN', destructive: true, onPress: () => { setError(null); setCancelFor(grn); } });
    }
    // Cancelled: back as a Draft with the same number, once the company's lock is off.
    if (canUpdate && grn.status === GRN_STATUS.CANCELLED) {
      list.push(
        locked
          ? { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.RESTORE_LOCKED_HINT }
          : { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => { setError(null); setRestoreFor(grn); } },
      );
    }
    return list;
  };

  // "Need to correct it? Edit keeps the same number." — in the Cancel box of an approved GRN.
  const editInstead =
    cancelFor && canUpdate && !locked && PAYABLE_GRN_STATUSES.includes(cancelFor.status) ? (
      <Pressable
        onPress={() => {
          const grn = cancelFor;
          setCancelFor(null);
          void editApproved(grn);
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
      <ActionSheet visible={menu} title={target?.grnNumber} actions={target ? actionsFor(target) : []} onClose={() => setMenu(false)} />
      <ReasonSheet
        visible={cancelFor !== null}
        title={cancelFor ? `Cancel GRN ${cancelFor.grnNumber}` : 'Cancel GRN'}
        description={cancelFor ? `Are you sure you want to cancel GRN ${cancelFor.grnNumber}? Its received quantities are taken back out of stock.` : ''}
        extra={editInstead}
        label="Cancellation Reason"
        placeholder="State the reason for cancelling this bill (reverts inventory)..."
        confirmText="Confirm Cancellation"
        cancelText="Keep Active"
        tone="danger"
        required
        busy={cancel.isPending}
        error={error}
        onConfirm={(reason) => cancelFor && cancel.mutate({ grn: cancelFor, reason })}
        onClose={() => setCancelFor(null)}
      />
      <ReasonSheet
        visible={restoreFor !== null}
        title={DOCUMENT_EDIT_TEXT.restoreTitle('GRN')}
        description={restoreFor ? `GRN ${restoreFor.grnNumber} ${DOCUMENT_EDIT_TEXT.RESTORE_BODY}` : ''}
        label={DOCUMENT_EDIT_TEXT.REASON_LABEL}
        placeholder={DOCUMENT_EDIT_TEXT.REASON_PLACEHOLDER}
        suggestions={DOCUMENT_EDIT_TEXT.REASON_SUGGESTIONS}
        confirmText={DOCUMENT_EDIT_TEXT.RESTORE_CONFIRM}
        cancelText={DOCUMENT_EDIT_TEXT.KEEP_CANCELLED}
        busy={restore.isPending}
        error={error}
        onConfirm={(reason) => restoreFor && restore.mutate({ grn: restoreFor, reason })}
        onClose={() => setRestoreFor(null)}
      />
    </>
  );

  return {
    open: (grn: Grn) => {
      setTarget(grn);
      setMenu(true);
    },
    /** Makes the PDF and opens the share sheet (the detail screen's Share PDF button). */
    share,
    sharing: preparing,
    /** The menu and the Cancel and Restore boxes: render once on the screen. */
    sheets,
  };
}
