import type { ReactNode } from 'react';
import { Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/theme';

/**
 * A whole-screen form opened over the one you are on (a part or customer made from inside a Quotation), so nothing
 * typed there is lost. The phone's back button closes it like Cancel does.
 */
export function FullScreenModal({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const colors = useColors();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>{children}</SafeAreaView>
    </Modal>
  );
}
