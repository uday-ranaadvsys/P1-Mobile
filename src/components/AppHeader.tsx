import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrivacy } from '@/lib/privacy';
import { spacing, toggleTheme, useColors, useIsDark, useThemed, type Colors } from '@/theme';

/** The FLOman mark: white "FLO" and red "man". */
export function Logo() {
  return (
    <View style={logo.row}>
      <Text style={[logo.part, logo.flo]}>FLO</Text>
      <Text style={[logo.part, logo.man]}>man</Text>
    </View>
  );
}

/** The top bar of Today: the logo, the privacy eye and the light/dark sun. */
export function AppHeader() {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const { hidden, toggle } = usePrivacy();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
      <Logo />
      <View style={styles.icons}>
        <Pressable onPress={toggle} hitSlop={10} accessibilityLabel={hidden ? 'Show amounts and names' : 'Hide amounts and names'}>
          <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={24} color={colors.ink} />
        </Pressable>
        <Pressable onPress={toggleTheme} hitSlop={10} accessibilityLabel={dark ? 'Switch to light' : 'Switch to dark'}>
          <Ionicons name={dark ? 'sunny' : 'moon'} size={24} color={dark ? '#FBBF24' : colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const logo = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 4, overflow: 'hidden', borderWidth: 1.5, borderColor: '#8A171A' },
  part: { fontSize: 20, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 1 },
  flo: { backgroundColor: '#FFFFFF', color: '#8A171A' },
  man: { backgroundColor: '#8A171A', color: '#FFFFFF' },
});

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md,
      paddingBottom: 12, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.divider,
    },
    icons: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  });
