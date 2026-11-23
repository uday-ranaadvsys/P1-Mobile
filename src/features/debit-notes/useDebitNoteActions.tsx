import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { DOCUMENT_EDIT_TEXT, TODAY_GROUP } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { PERMISSIONS } from 'floman-shared/permissions';
import { NOTE_STATUS } from 'floman-shared/statuses';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { BusyModal } from '@/components/BusyModal';
import { ReasonSheet } from '@/components/ReasonSheet';
import { useSession } from '@/features/auth/session';
import { getDocumentLock } from '@/features/company/api';
import { notify } from '@/lib/notify';
import { sharePdf } from '@/lib/sharePdf';
import { cancelDebitNote, debitNoteEditCheck, restoreDebitNote, type DebitNote } from './api';
import { EDITABLE, pdfName } from './text';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * What a Debit Note can do, as the web's ⋯ menu: Edit (before it is approved; an approved one after the server's check),
 * Approve and Return for changes (open its Review screen), Share PDF, View history, Cancel and Restore.
 * `open(note)` shows the menu; render `sheets` once on the screen. `onHistory`: where View history goes when the screen
 * can show it itself (the detail's History tab).
 */
export function useDebitNoteActions(options: { onHistory?: (note: DebitNote) => void } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const [target, setTarget] = useState<DebitNote | null>(null);
  const [menu, setMenu] = useState(false);
  const [cancelFor, setCancelFor] = useState<DebitNote | null>(null);
  const [restoreFor, setRestoreFor] = useState<DebitNote | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The company's "Lock Approved & Cancelled Docs": Edit (approved) and Restore wait while it is on.
  const lock = useQuery({ queryKey: ['document-lock'], queryFn: getDocumentLock, retry: false });
  const locked = lock.data === true;

  const canUpdate = can(PERMISSIONS.DEBIT_NOTES.UPDATE);
  const canApprove = can(PERMISSIONS.DEBIT_NOTES.APPROVE);

  const changed = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['debit-notes'] });
    void queryClient.invalidateQueries({ queryKey: ['debit-note', id] });
    void queryClient.invalidateQueries({ queryKey: ['grns'] });
    void queryClient.invalidateQueries({ queryKey: ['grn'] });
  };

  // Share PDF: the server makes it, then the phone's share sheet opens (WhatsApp, email, save).
  const [preparing, setPreparing] = useState(false);
  const share = async (note: DebitNote) => {
    setPreparing(true);
    try {
      await sharePdf(`/debit-notes/${note.id}/pdf`, pdfName(note), `Debit Note ${note.noteNumber}`);
    } catch (e) {
      Alert.alert('Could not share the PDF', message(e));
    } finally {
      setPreparing(false);
    }
  };

  const edit = (note: DebitNote) => router.push({ pathname: '/purchase/debit-notes/edit', params: { id: note.id } });

  // An approved note: asked first what stops it (the lock, or money refunded from it); a block is told with its words.
  const editApproved = async (note: DebitNote) => {
    try {
      const block = await debitNoteEditCheck(note.id);
      if (block) Alert.alert(DOCUMENT_EDIT_TEXT.blockedTitle('Debit Note'), block.message, [{ text: DOCUMENT_EDIT_TEXT.OK }]);
      else edit(note);
    } catch (e) {
      Alert.alert(DOCUMENT_EDIT_TEXT.CHECK_FAILED('Debit Note'), message(e));
    }
  };

  /** The same Approve / Return screen as Today. */
  const review = (note: DebitNote) =>
    router.push({
      pathname: '/document/[kind]/[id]',
      params: { kind: DOCUMENT_TYPE.DEBIT_NOTE, id: note.id, group: TODAY_GROUP.APPROVE, number: note.noteNumber, party: note.vendor?.name ?? '', date: note.createdAt },
    });

  const cancel = useMutation({
    mutationFn: ({ note, reason }: { note: DebitNote; reason: string }) => cancelDebitNote(note.id, reason),
    onSuccess: ({ message: said }, { note }) => {
      changed(note.id);
      notify(said);
      setCancelFor(null);
    },
    onError: (e) => setError(message(e)),
  });

  const restore = useMutation({
    mutationFn: ({ note, reason }: { note: DebitNote; reason: string }) => restoreDebitNote(note.id, reason),
    onSuccess: ({ message: said }, { note }) => {
      changed(note.id);
      notify(said);
      setRestoreFor(null);
      // Back as a Draft: its form opens straight away.
      edit(note);
    },
    onError: (e) => setError(message(e)),
  });

  /** Waiting for approval or a draft, and this user may approve; return only while it waits. */
  const approvable = (note: DebitNote) => canApprove && (note.status === NOTE_STATUS.DRAFT || note.status === NOTE_STATUS.PENDING_APPROVAL);
  const returnable = (note: DebitNote) => canApprove && note.status === NOTE_STATUS.PENDING_APPROVAL;

  const actionsFor = (note: DebitNote): SheetAction[] => {
    const list: SheetAction[] = [];
    if (canUpdate && EDITABLE.includes(note.status)) list.push({ label: 'Edit', onPress: () => edit(note) });
    if (canUpdate && note.status === NOTE_STATUS.APPROVED) {
      list.push(
        locked
          ? { label: 'Edit', onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.lockedHint('Debit Notes') }
          : { label: 'Edit', onPress: () => void editApproved(note) },
      );
    }
    if (approvable(note) && note.status === NOTE_STATUS.PENDING_APPROVAL) list.push({ label: 'Approve', onPress: () => review(note) });
    if (returnable(note)) list.push({ label: 'Return for changes', onPress: () => review(note) });
    list.push({ label: 'Share PDF', onPress: () => void share(note) });
    list.push({
      label: 'View history',
      onPress: () => (options.onHistory ? options.onHistory(note) : router.push({ pathname: '/purchase/debit-notes/[id]', params: { id: note.id, tab: 'history' } })),
    });
    if (canApprove && note.status !== NOTE_STATUS.CANCELLED) list.push({ label: 'Cancel', destructive: true, onPress: () => { setError(null); setCancelFor(note); } });
    // Cancelled: back as a Draft with the same number, once the company's lock is off.
    if (canUpdate && note.status === NOTE_STATUS.CANCELLED) {
      list.push(
        locked
          ? { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.RESTORE_LOCKED_HINT }
          : { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => { setError(null); setRestoreFor(note); } },
      );
    }
    return list;
  };

  const sheets = (
    <>
      <BusyModal visible={preparing} text="Preparing the PDF…" />
      <ActionSheet visible={menu} title={target?.noteNumber} actions={target ? actionsFor(target) : []} onClose={() => setMenu(false)} />
      <ReasonSheet
        visible={cancelFor !== null}
        title={cancelFor ? `Cancel Debit Note "${cancelFor.noteNumber}"` : 'Cancel Debit Note'}
        description="Are you sure you want to cancel this Debit Note? What it took off the GRN is put back."
        label="Cancellation Reason"
        placeholder="Specify reason for cancelling this Debit Note..."
        confirmText="Cancel Debit Note"
        cancelText="Keep"
        tone="danger"
        required
        busy={cancel.isPending}
        error={error}
        onConfirm={(reason) => cancelFor && cancel.mutate({ note: cancelFor, reason })}
        onClose={() => setCancelFor(null)}
      />
      <ReasonSheet
        visible={restoreFor !== null}
        title={DOCUMENT_EDIT_TEXT.restoreTitle('Debit Note')}
        description={restoreFor ? `Debit Note ${restoreFor.noteNumber} ${DOCUMENT_EDIT_TEXT.RESTORE_BODY}` : ''}
        label={DOCUMENT_EDIT_TEXT.REASON_LABEL}
        placeholder={DOCUMENT_EDIT_TEXT.REASON_PLACEHOLDER}
        suggestions={DOCUMENT_EDIT_TEXT.REASON_SUGGESTIONS}
        confirmText={DOCUMENT_EDIT_TEXT.RESTORE_CONFIRM}
        cancelText={DOCUMENT_EDIT_TEXT.KEEP_CANCELLED}
        busy={restore.isPending}
        error={error}
        onConfirm={(reason) => restoreFor && restore.mutate({ note: restoreFor, reason })}
        onClose={() => setRestoreFor(null)}
      />
    </>
  );

  return {
    open: (note: DebitNote) => {
      setTarget(note);
      setMenu(true);
    },
    review,
    share,
    sharing: preparing,
    approvable,
    returnable,
    editApproved,
    locked,
    /** The menu and the Cancel and Restore boxes: render once on the screen. */
    sheets,
  };
}
