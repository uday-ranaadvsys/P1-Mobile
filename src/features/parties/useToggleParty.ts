import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { notify } from '@/lib/notify';
import { setPartyActive, type Party } from './api';

/**
 * Deactivate or reactivate a party, asking first in the web's words. `onError` gets the server's message.
 * Used by the party's own screen and by the list's long-press menu.
 */
export function useToggleParty(onError?: (message: string) => void) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ party, active }: { party: Party; active: boolean }) => setPartyActive(party.id, active),
    onSuccess: (_data, { party, active }) => {
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      void queryClient.invalidateQueries({ queryKey: ['party', party.id] });
      notify(`${party.name} ${active ? 'reactivated' : 'deactivated'}.`);
    },
    onError: (e) => onError?.(e instanceof Error ? e.message : String(e)),
  });

  const toggle = (party: Party) => {
    const next = !party.isActive;
    Alert.alert(
      next ? 'Reactivate' : 'Deactivate',
      next
        ? `Reactivate ${party.name}? They show again when picking a party on documents.`
        : `Deactivate ${party.name}? They stop showing when picking a party on documents; documents already made keep them.`,
      [
        { text: 'Keep as it is', style: 'cancel' },
        { text: next ? 'Reactivate' : 'Deactivate', style: next ? 'default' : 'destructive', onPress: () => mutation.mutate({ party, active: next }) },
      ],
    );
  };

  return { toggle, busy: mutation.isPending };
}
