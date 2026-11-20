import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { notify } from '@/lib/notify';
import { setPartActive, type Part } from './api';

/**
 * Deactivate or reactivate a part, asking first in the web's words. `onError` gets the server's message.
 * Used by the part's own screen and by the list's long-press menu.
 */
export function useTogglePart(onError?: (message: string) => void) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ part, active }: { part: Part; active: boolean }) => setPartActive(part.id, active),
    onSuccess: (_data, { part, active }) => {
      void queryClient.invalidateQueries({ queryKey: ['parts'] });
      void queryClient.invalidateQueries({ queryKey: ['part', part.id] });
      notify(`${part.name} ${active ? 'reactivated' : 'deactivated'}.`);
    },
    onError: (e) => onError?.(e instanceof Error ? e.message : String(e)),
  });

  const toggle = (part: Part) => {
    const next = !part.isActive;
    Alert.alert(
      next ? 'Reactivate part' : 'Deactivate part',
      next
        ? `Reactivate ${part.name}? It shows again when picking parts on documents.`
        : `Deactivate ${part.name}? It stops showing when picking parts on documents; documents that already use it keep it.`,
      [
        { text: 'Keep as it is', style: 'cancel' },
        { text: next ? 'Reactivate' : 'Deactivate', style: next ? 'default' : 'destructive', onPress: () => mutation.mutate({ part, active: next }) },
      ],
    );
  };

  return { toggle, busy: mutation.isPending };
}
