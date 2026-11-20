import { StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { Centered } from '@/components/Screen';
import { COMING_SOON } from '@/lib/notify';
import { useThemed, type Colors } from '@/theme';

/** A page for a screen that isn't built yet. */
export function ComingSoon({ title }: { title: string }) {
  const styles = useThemed(makeStyles);
  return (
    <Centered>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{COMING_SOON}</Text>
    </Centered>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    title: { fontSize: 22, fontWeight: '700', color: c.ink },
    text: { fontSize: 15, color: c.muted },
  });
