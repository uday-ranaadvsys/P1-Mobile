import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { DOCUMENT_EDIT_TEXT } from 'floman-shared/constants';
import { PERMISSIONS } from 'floman-shared/permissions';
import { INDENT_STATUS } from 'floman-shared/statuses';
import { useState } from 'react';
import { Alert } from 'react-native';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { ReasonSheet } from '@/components/ReasonSheet';
import { useSession } from '@/features/auth/session';
import { getDocumentLock } from '@/features/company/api';
import { notify } from '@/lib/notify';
import { cancelIndent, restoreIndent, returnIndent, submitIndent, type Indent } from './api';
import { hasOrders, WAITING_STATUSES, WITH_REQUESTER } from './text';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * What an Indent can do, as the web's ⋯ menu: Edit and Submit (a draft; Edit also on a returned one), Duplicate, Order
 * in Manage Indents, Return for changes, View history, Cancel (waits while its lines are ordered) and Restore.
 * `open(indent)` shows the menu; render `sheets` once on the screen. `submit(indent)` is also used by the detail's button.
 * `onHistory`: where View history goes when the screen can show it itself (the detail's History tab).
 */
export function useIndentActions(options: { onHistory?: (indent: Indent) => void } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const [target, setTarget] = useState<Indent | null>(null);
  const [menu, setMenu] = useState(false);
  const [cancelFor, setCancelFor] = useState<Indent | null>(null);
  const [returnFor, setReturnFor] = useState<Indent | null>(null);
  const [restoreFor, setRestoreFor] = useState<Indent | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The company's "Lock Approved & Cancelled Docs": Restore waits while it is on.
  const lock = useQuery({ queryKey: ['document-lock'], queryFn: getDocumentLock, retry: false });
  const locked = lock.data === true;

  const canCreate = can(PERMISSIONS.INDENTS.CREATE);
  const canUpdate = can(PERMISSIONS.INDENTS.UPDATE);
  // The server lets only someone who may approve return or cancel an Indent.
  const canReturn = can(PERMISSIONS.INDENTS.APPROVE);
  const canOrder = can(PERMISSIONS.PURCHASE_INDENTS.CREATE) || can(PERMISSIONS.PURCHASE_ORDERS.CREATE) || can(PERMISSIONS.PURCHASES.CREATE);

  const changed = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['indents'] });
    void queryClient.invalidateQueries({ queryKey: ['indent', id] });
    void queryClient.invalidateQueries({ queryKey: ['pending-indent-items'] });
  };

  const edit = (indent: Indent) => router.push({ pathname: '/purchase/indents/edit', params: { id: indent.id } });
  const orderIn = (indent: Indent) => router.push({ pathname: '/purchase/manage-indents', params: { search: indent.indentNumber } });

  const submit = useMutation({
    mutationFn: (indent: Indent) => submitIndent(indent.id),
    onSuccess: (_, indent) => {
      changed(indent.id);
      notify('Indent submitted for procurement successfully!');
    },
    onError: (e) => Alert.alert('Could not submit the Indent', message(e)),
  });

  const returning = useMutation({
    mutationFn: ({ indent, reason }: { indent: Indent; reason: string }) => returnIndent(indent.id, reason),
    onSuccess: (_, { indent }) => {
      changed(indent.id);
      notify('Indent returned to requester for revision.');
      setReturnFor(null);
    },
    onError: (e) => setError(message(e)),
  });

  const cancel = useMutation({
    mutationFn: ({ indent, reason }: { indent: Indent; reason: string }) => cancelIndent(indent.id, reason),
    onSuccess: (_, { indent }) => {
      changed(indent.id);
      notify('Indent cancelled successfully.');
      setCancelFor(null);
    },
    onError: (e) => setError(message(e)),
  });

  const restore = useMutation({
    mutationFn: ({ indent, reason }: { indent: Indent; reason: string }) => restoreIndent(indent.id, reason),
    onSuccess: ({ message: said }, { indent }) => {
      changed(indent.id);
      notify(said);
      setRestoreFor(null);
      // Back as a Draft: its form opens straight away.
      edit(indent);
    },
    onError: (e) => setError(message(e)),
  });

  const actionsFor = (indent: Indent): SheetAction[] => {
    const list: SheetAction[] = [];
    if (canUpdate && WITH_REQUESTER.includes(indent.status)) list.push({ label: 'Edit', onPress: () => edit(indent) });
    if (canCreate && indent.status === INDENT_STATUS.DRAFT) list.push({ label: 'Submit Indent', onPress: () => submit.mutate(indent) });
    if (canCreate && indent.status !== INDENT_STATUS.DRAFT && indent.status !== INDENT_STATUS.CANCELLED) {
      list.push({ label: 'Duplicate', onPress: () => router.push({ pathname: '/purchase/indents/edit', params: { duplicateFrom: indent.id } }) });
    }
    if (canOrder && WAITING_STATUSES.includes(indent.status)) list.push({ label: 'Order in Manage Indents', onPress: () => orderIn(indent) });
    if (canReturn && indent.status === INDENT_STATUS.SUBMITTED) list.push({ label: 'Return for changes', onPress: () => { setError(null); setReturnFor(indent); } });
    list.push({
      label: 'View history',
      onPress: () => (options.onHistory ? options.onHistory(indent) : router.push({ pathname: '/purchase/indents/[id]', params: { id: indent.id, tab: 'history' } })),
    });
    if (canReturn && indent.status !== INDENT_STATUS.CANCELLED) {
      list.push(
        hasOrders(indent)
          ? { label: 'Cancel', onPress: () => undefined, destructive: true, disabled: true, hint: DOCUMENT_EDIT_TEXT.CANCEL_ORDERS_FIRST }
          : { label: 'Cancel', destructive: true, onPress: () => { setError(null); setCancelFor(indent); } },
      );
    }
    // Cancelled: back as a Draft with the same number, once the company's lock is off.
    if (canUpdate && indent.status === INDENT_STATUS.CANCELLED) {
      list.push(
        locked
          ? { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => undefined, disabled: true, hint: DOCUMENT_EDIT_TEXT.RESTORE_LOCKED_HINT }
          : { label: DOCUMENT_EDIT_TEXT.RESTORE, onPress: () => { setError(null); setRestoreFor(indent); } },
      );
    }
    return list;
  };

  const sheets = (
    <>
      <ActionSheet visible={menu} title={target?.indentNumber} actions={target ? actionsFor(target) : []} onClose={() => setMenu(false)} />
      <ReasonSheet
        visible={returnFor !== null}
        title={returnFor ? `Return Indent "${returnFor.indentNumber}"` : 'Return Indent'}
        description="The requester gets it back to correct, then submits it again."
        label="Remarks"
        placeholder="What quantities, specs or items need correcting…"
        confirmText="Return for Changes"
        cancelText="Keep"
        required
        busy={returning.isPending}
        error={error}
        onConfirm={(reason) => returnFor && returning.mutate({ indent: returnFor, reason })}
        onClose={() => setReturnFor(null)}
      />
      <ReasonSheet
        visible={cancelFor !== null}
        title="Cancel Indent"
        description={cancelFor ? `Are you sure you want to cancel indent ${cancelFor.indentNumber}? Its lines won't be ordered.` : ''}
        label="Cancellation Reason"
        placeholder="e.g. No longer needed, raised twice…"
        confirmText="Yes, Cancel Indent"
        cancelText="Keep Active"
        tone="danger"
        required
        busy={cancel.isPending}
        error={error}
        onConfirm={(reason) => cancelFor && cancel.mutate({ indent: cancelFor, reason })}
        onClose={() => setCancelFor(null)}
      />
      <ReasonSheet
        visible={restoreFor !== null}
        title={DOCUMENT_EDIT_TEXT.restoreTitle('Indent')}
        description={restoreFor ? `Indent ${restoreFor.indentNumber} ${DOCUMENT_EDIT_TEXT.RESTORE_BODY}` : ''}
        label={DOCUMENT_EDIT_TEXT.REASON_LABEL}
        placeholder={DOCUMENT_EDIT_TEXT.REASON_PLACEHOLDER}
        suggestions={DOCUMENT_EDIT_TEXT.REASON_SUGGESTIONS}
        confirmText={DOCUMENT_EDIT_TEXT.RESTORE_CONFIRM}
        cancelText={DOCUMENT_EDIT_TEXT.KEEP_CANCELLED}
        busy={restore.isPending}
        error={error}
        onConfirm={(reason) => restoreFor && restore.mutate({ indent: restoreFor, reason })}
        onClose={() => setRestoreFor(null)}
      />
    </>
  );

  return {
    open: (indent: Indent) => {
      setTarget(indent);
      setMenu(true);
    },
    submit: (indent: Indent) => submit.mutate(indent),
    submitting: submit.isPending,
    /** The menu and the Return, Cancel and Restore boxes: render once on the screen. */
    sheets,
  };
}
