import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** A small box over the screen while something takes a few seconds ("Preparing the PDF…"). It can't be dismissed. */
export function BusyModal({ visible, text }: { visible: boolean; text: string }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.root}>
        <View style={styles.box} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.brandText} />
          <Text style={styles.text}>{text}</Text>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
    box: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    text: { ...type.body, color: c.ink },
  });
