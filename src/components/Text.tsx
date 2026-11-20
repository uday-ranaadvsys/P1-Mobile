import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useThemed, type Colors } from '@/theme';

export function Title({ children }: { children: ReactNode }) {
  const styles = useThemed(makeStyles);
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  const styles = useThemed(makeStyles);
  return <Text style={styles.muted}>{children}</Text>;
}

export function ErrorText({ message }: { message: string | null }) {
  const styles = useThemed(makeStyles);
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    title: { fontSize: 24, fontWeight: '700', color: c.ink },
    muted: { color: c.muted, fontSize: 14 },
    error: { color: c.danger, fontSize: 14 },
  });
