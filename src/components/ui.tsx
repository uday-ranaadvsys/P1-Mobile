import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme';

/** A page that scrolls and moves up with the keyboard. */
export function Screen({ children }: { children: ReactNode }) {
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

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

type FieldProps = TextInputProps & { label: string; secure?: boolean };

/** A labelled input. `secure` adds Show / Hide for passwords. */
export function Field({ label, secure, ...input }: FieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          {...input}
          style={styles.input}
          secureTextEntry={secure && !shown}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted}
        />
        {secure ? (
          <Pressable onPress={() => setShown((s) => !s)} hitSlop={8}>
            <Text style={styles.toggle}>{shown ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Button({ title, onPress, busy, disabled, tone = 'brand' }: {
  title: string; onPress: () => void; busy?: boolean; disabled?: boolean; tone?: 'brand' | 'plain';
}) {
  const off = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={[styles.button, tone === 'plain' ? styles.buttonPlain : { backgroundColor: colors.brand }, off && { opacity: 0.6 }]}
    >
      {busy ? <ActivityIndicator color={tone === 'plain' ? colors.brand : '#fff'} /> : (
        <Text style={[styles.buttonText, tone === 'plain' && { color: colors.brand }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  error: { color: colors.danger, fontSize: 14 },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.outline, borderRadius: radius, paddingHorizontal: spacing.md,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.ink },
  toggle: { color: colors.brand, fontWeight: '600' },
  button: { borderRadius: radius, paddingVertical: 14, alignItems: 'center' },
  buttonPlain: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.brand },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.background },
});
