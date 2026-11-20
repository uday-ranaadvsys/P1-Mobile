import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COMING_SOON, notify } from '@/lib/notify';
import { usePrivacy } from '@/lib/privacy';
import { spacing, toggleTheme, useColors, useIsDark, useThemed, type Colors } from '@/theme';

/** The FLOman mark: white "FLO" and red "man". Placeholder until the logo file is supplied. */
export function Logo() {
  return (
    <View style={logo.row} accessibilityRole="image" accessibilityLabel="floman">
      <Text style={[logo.part, logo.flo]}>FLO</Text>
      <Text style={[logo.part, logo.man]}>man</Text>
    </View>
  );
}

type IconButtonProps = { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label: string; onPress: () => void };

/** An icon-only button: a 44 pt hit area, a press state, and a label for the screen reader. */
function IconButton({ icon, color, label, onPress }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [iconStyles.button, pressed && { opacity: 0.5 }]}
    >
      <Ionicons name={icon} size={26} color={color} />
    </Pressable>
  );
}

/** The top bar: the logo, then search, privacy (eye), the light/dark sun, and the bell (notifications come later). */
export function AppHeader() {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const dark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hidden, toggle } = usePrivacy();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <Logo />
      <View style={styles.icons}>
        <IconButton icon="search-outline" color={colors.ink} label="Search" onPress={() => router.push('/search')} />
        <IconButton
          icon={hidden ? 'eye-off-outline' : 'eye-outline'}
          color={hidden ? colors.brandText : colors.ink}
          label={hidden ? 'Show amounts and names' : 'Hide amounts and names'}
          onPress={toggle}
        />
        <IconButton
          icon={dark ? 'sunny' : 'moon'}
          color={dark ? '#FBBF24' : colors.ink}
          label={dark ? 'Switch to light' : 'Switch to dark'}
          onPress={toggleTheme}
        />
        <IconButton icon="notifications-outline" color={colors.ink} label="Notifications" onPress={() => notify(COMING_SOON)} />
      </View>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

const logo = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 5, overflow: 'hidden', borderWidth: 1.5, borderColor: '#8A171A' },
  part: { fontSize: 22, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 1 },
  flo: { backgroundColor: '#FFFFFF', color: '#8A171A' },
  man: { backgroundColor: '#8A171A', color: '#FFFFFF' },
});

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md,
      paddingBottom: 6, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.divider,
    },
    // Four 44 pt buttons with a little space between them (accessibility.md: spacing matters as much as size).
    icons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  });
