import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { INDENT_LINES_ON_CANCEL, TODAY_GROUP, type IndentLinesOnCancel } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PURCHASE_INDENT_STATUS } from 'floman-shared/statuses';
import { useState } from 'react';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { IndentLinesChoice } from '@/components/IndentLinesChoice';
import { ReasonSheet } from '@/components/ReasonSheet';
import { useSession } from '@/features/auth/session';
import { notify } from '@/lib/notify';
import { cancelPurchaseIndent, type PurchaseIndent } from './api';
import { CANCELLABLE, EDITABLE } from './text';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * What a Purchase Indent can do, as the web's ⋯ menu: Edit (draft, returned or waiting), Duplicate, Approve & create PO
 * and Return for changes (open its Review screen), View history and Cancel (with what happens to its Indent lines).
 * `open(pr)` shows the menu; render `sheets` once on the screen. `review(pr)` opens the Approve / Return screen.
 * `onHistory`: where View history goes when the screen can show it itself (the detail's History tab).
 */
export function usePurchaseIndentActions(options: { onHistory?: (pr: PurchaseIndent) => void } = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can, user } = useSession();
  const [target, setTarget] = useState<PurchaseIndent | null>(null);
  const [menu, setMenu] = useState(false);
  const [cancelFor, setCancelFor] = useState<PurchaseIndent | null>(null);
  // The purchaser usually cancels the Indent lines too: the indenter raises a new Indent if it is still needed.
  const [indentLines, setIndentLines] = useState<IndentLinesOnCancel>(INDENT_LINES_ON_CANCEL.CANCEL);
  const [error, setError] = useState<string | null>(null);

  const canCreate = can(PERMISSIONS.PURCHASE_INDENTS.CREATE);
  const canApprove = can(PERMISSIONS.PURCHASE_INDENTS.APPROVE);
  const isAdmin = can(PERMISSIONS.ALL);

  /** Waiting for approval, and this user may approve it (not their own, unless they are the Admin). */
  const approvable = (pr: PurchaseIndent) => pr.status === PURCHASE_INDENT_STATUS.PENDING_APPROVAL && canApprove && (isAdmin || !pr.createdBy?.id || pr.createdBy.id !== user?.id);
  const returnable = (pr: PurchaseIndent) => pr.status === PURCHASE_INDENT_STATUS.PENDING_APPROVAL && canApprove;

  const changed = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-indents'] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-indent', id] });
    void queryClient.invalidateQueries({ queryKey: ['pending-indent-items'] });
  };

  const edit = (pr: PurchaseIndent) => router.push({ pathname: '/purchase/purchase-indents/edit', params: { id: pr.id } });
  /** The same Approve / Return screen as Today: Approve makes the Purchase Order. */
  const review = (pr: PurchaseIndent) =>
    router.push({
      pathname: '/document/[kind]/[id]',
      params: { kind: DOCUMENT_TYPE.PURCHASE_INDENT, id: pr.id, group: TODAY_GROUP.APPROVE, number: pr.prNumber, party: pr.vendor?.name ?? '', date: pr.createdAt },
    });

  const cancel = useMutation({
    mutationFn: ({ pr, reason }: { pr: PurchaseIndent; reason: string }) => cancelPurchaseIndent(pr.id, reason, indentLines),
    onSuccess: ({ message: said }, { pr }) => {
      changed(pr.id);
      notify(said || `Purchase Indent "${pr.prNumber}" cancelled.`);
      setCancelFor(null);
    },
    onError: (e) => setError(message(e)),
  });

  const actionsFor = (pr: PurchaseIndent): SheetAction[] => {
    const list: SheetAction[] = [];
    if (canCreate && EDITABLE.includes(pr.status)) list.push({ label: 'Edit', onPress: () => edit(pr) });
    if (canCreate) list.push({ label: 'Duplicate', onPress: () => router.push({ pathname: '/purchase/purchase-indents/edit', params: { duplicateFrom: pr.id } }) });
    if (approvable(pr)) list.push({ label: 'Approve & create PO', onPress: () => review(pr) });
    if (returnable(pr)) list.push({ label: 'Return for changes', onPress: () => review(pr) });
    list.push({
      label: 'View history',
      onPress: () => (options.onHistory ? options.onHistory(pr) : router.push({ pathname: '/purchase/purchase-indents/[id]', params: { id: pr.id, tab: 'history' } })),
    });
    if (canCreate && CANCELLABLE.includes(pr.status)) {
      list.push({ label: 'Cancel', destructive: true, onPress: () => { setError(null); setIndentLines(INDENT_LINES_ON_CANCEL.CANCEL); setCancelFor(pr); } });
    }
    return list;
  };

  const sheets = (
    <>
      <ActionSheet visible={menu} title={target?.prNumber} actions={target ? actionsFor(target) : []} onClose={() => setMenu(false)} />
      <ReasonSheet
        visible={cancelFor !== null}
        title={cancelFor ? `Cancel Purchase Indent "${cancelFor.prNumber}"` : 'Cancel Purchase Indent'}
        description="Are you sure you want to cancel this Purchase Indent? It will not be turned into a Purchase Order."
        extra={<IndentLinesChoice value={indentLines} onChange={setIndentLines} disabled={cancel.isPending} />}
        label="Cancellation Reason"
        placeholder="e.g. Vendor changed, raised twice…"
        confirmText="Cancel Purchase Indent"
        cancelText="Keep"
        tone="danger"
        required
        busy={cancel.isPending}
        error={error}
        onConfirm={(reason) => cancelFor && cancel.mutate({ pr: cancelFor, reason })}
        onClose={() => setCancelFor(null)}
      />
    </>
  );

  return {
    open: (pr: PurchaseIndent) => {
      setTarget(pr);
      setMenu(true);
    },
    review,
    approvable,
    returnable,
    /** The menu and the Cancel box: render once on the screen. */
    sheets,
  };
}
