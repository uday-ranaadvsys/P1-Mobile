import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { initials } from '@/lib/format';
import { useIsDark } from '@/theme';

type Tone = { bg: string; fg: string };

// Letters are lighter on dark and darker on light, so they read (4.5:1) in both.
const TONES: { dark: Tone; light: Tone }[] = [
  { dark: { bg: 'rgba(248,113,113,0.16)', fg: '#F87171' }, light: { bg: 'rgba(220,38,38,0.10)', fg: '#B91C1C' } },
  { dark: { bg: 'rgba(245,158,11,0.16)', fg: '#F59E0B' }, light: { bg: 'rgba(217,119,6,0.12)', fg: '#92400E' } },
  { dark: { bg: 'rgba(59,130,246,0.16)', fg: '#60A5FA' }, light: { bg: 'rgba(37,99,235,0.10)', fg: '#1D4ED8' } },
  { dark: { bg: 'rgba(16,185,129,0.16)', fg: '#34D399' }, light: { bg: 'rgba(5,150,105,0.10)', fg: '#047857' } },
  { dark: { bg: 'rgba(168,85,247,0.16)', fg: '#C084FC' }, light: { bg: 'rgba(126,34,206,0.10)', fg: '#7E22CE' } },
  { dark: { bg: 'rgba(148,163,184,0.16)', fg: '#94A3B8' }, light: { bg: 'rgba(71,85,105,0.10)', fg: '#475569' } },
];

/** The same name always gets the same colour. */
const toneOf = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
};

/** A rounded square with a name's first letters (AC for "AIM Cutting Tools"). `hidden` shows dots instead (privacy mode). */
export function Avatar({ name, size = 48, hidden }: { name: string; size?: number; hidden?: boolean }) {
  const dark = useIsDark();
  const tone = toneOf(name)[dark ? 'dark' : 'light'];
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size / 3, backgroundColor: tone.bg }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[styles.text, { color: tone.fg, fontSize: Math.round(size * 0.36) }]} maxFontSizeMultiplier={1.2}>{hidden ? '••' : initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '800' },
});
