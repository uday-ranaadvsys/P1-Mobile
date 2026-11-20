import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, useThemed, type Colors } from '@/theme';

/** A page that scrolls and moves up with the keyboard. */
export function Screen({ children }: { children: ReactNode }) {
  const styles = useThemed(makeStyles);
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Content in the middle of an empty page: a spinner, a message, a retry button. */
export function Centered({ children }: { children: ReactNode }) {
  const styles = useThemed(makeStyles);
  return <View style={styles.centered}>{children}</View>;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: c.background },
  });
