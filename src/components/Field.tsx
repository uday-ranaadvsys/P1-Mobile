import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from '@/components/AppText';
import { radius, spacing, type, useColors, useThemed, type Colors } from '@/theme';

type FieldProps = TextInputProps & {
  label: string;
  /** Adds Show / Hide for passwords. */
  secure?: boolean;
  /** A red star after the label, as on the web. */
  required?: boolean;
  /** What is wrong with it, under the box (the server's words, or the form's own check). */
  error?: string | null;
  /** A sign before the text, such as ₹. */
  prefix?: string;
  /** A sign after the text, such as a unit (Nos) or %. */
  suffix?: string;
};

/** A labelled input with an error line. The box is 48 pt tall (44 minimum). */
export function Field({ label, secure, required, error, prefix, suffix, ...input }: FieldProps) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      <View style={[styles.row, error ? { borderColor: colors.danger } : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          {...input}
          style={[styles.input, input.multiline && { minHeight: 88, textAlignVertical: 'top' }]}
          secureTextEntry={secure && !shown}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={label}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        {secure ? (
          <Pressable onPress={() => setShown((s) => !s)} hitSlop={8} accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'}>
            <Text style={styles.toggle}>{shown ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    row: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderWidth: 1,
      borderColor: c.outline, borderRadius: radius, paddingHorizontal: spacing.md, minHeight: 48,
    },
    prefix: { ...type.body, color: c.muted, marginRight: spacing.xs },
    suffix: { ...type.subhead, fontWeight: '600', color: c.muted, marginLeft: spacing.xs },
    input: { flex: 1, paddingVertical: 12, ...type.body, color: c.ink, fontFamily: 'Inter_400Regular' },
    toggle: { ...type.subhead, fontWeight: '600', color: c.brandText },
    error: { ...type.footnote },
  });
