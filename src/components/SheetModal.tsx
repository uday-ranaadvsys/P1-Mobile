import type { ReactNode } from 'react';
import { Modal, Platform, View, type ModalProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/theme';

/**
 * A bottom sheet's window. On Android the phone's navigation bar is part of the screen, and a plain Modal stops above
 * it, so the screen behind (the tab bar) shows in a strip under the sheet. This one goes under the navigation bar and
 * fills that strip with the sheet's own colour, so the sheet reaches the bottom edge. Used like a Modal.
 */
export function SheetModal({ children, ...props }: ModalProps & { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const under = Platform.OS === 'android' ? insets.bottom : 0;
  return (
    <Modal {...props} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, paddingBottom: under }}>{children}</View>
      {under > 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: under, backgroundColor: colors.surface }} /> : null}
    </Modal>
  );
}
