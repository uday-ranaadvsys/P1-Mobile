import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/**
 * The top of a screen inside a tab: a back link that names where you came from ("‹ Masters"), the title in large
 * type, and an optional control at the right (refresh, add). The tab's own top bar stays above it.
 */
export function ScreenTitle({ back, title, right }: { back?: string; title?: string; right?: ReactNode }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      {back ? (
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={`Back to ${back}`} style={({ pressed }) => [styles.back, pressed && { opacity: 0.5 }]}>
          <Ionicons name="chevron-back" size={18} color={colors.muted} />
          <Text style={styles.backText}>{back}</Text>
        </Pressable>
      ) : null}
      {title ? (
        <View style={styles.row}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {right}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: { gap: 0 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, alignSelf: 'flex-start', marginLeft: -4 },
    backText: { ...type.subhead, color: c.muted },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    title: { ...type.title1, flex: 1, color: c.ink },
  });
