import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from '@/components/AppText';
import { radius, spacing, useColors, useThemed, type Colors } from '@/theme';

type FieldProps = TextInputProps & { label: string; secure?: boolean };

/** A labelled input. `secure` adds Show / Hide for passwords. */
export function Field({ label, secure, ...input }: FieldProps) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          {...input}
          style={[styles.input, input.multiline && { minHeight: 90, textAlignVertical: 'top' }]}
          secureTextEntry={secure && !shown}
          placeholderTextColor={colors.placeholder}
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

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { fontSize: 14, fontWeight: '600', color: c.ink },
    row: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderWidth: 1,
      borderColor: c.outline, borderRadius: radius, paddingHorizontal: spacing.md,
    },
    input: { flex: 1, paddingVertical: 12, fontSize: 16, color: c.ink, fontFamily: 'Inter_400Regular' },
    toggle: { color: c.brandText, fontWeight: '600' },
  });
