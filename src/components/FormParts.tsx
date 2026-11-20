import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/AppText';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** A form section's small uppercase heading, like the web's ("WHO ARE THEY?"). */
export function SectionHeader({ children }: { children: ReactNode }) {
  const styles = useThemed(makeStyles);
  return <Text style={styles.header} accessibilityRole="header">{children}</Text>;
}

/** A group of fields on one card: the web's sections, as an inset grouped block. */
export function FormCard({ children }: { children: ReactNode }) {
  const styles = useThemed(makeStyles);
  return <View style={styles.card}>{children}</View>;
}

/** The error banner at the top of a form: what the server (or the form) refused, in its words. */
export function ErrorBanner({ message }: { message: string | null }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  if (!message) return null;
  return (
    <View style={[styles.banner, { borderColor: colors.danger }]} accessibilityRole="alert">
      <Text style={[styles.bannerText, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

/** A yes/no choice as a switch (the web's checkbox), with its label and an optional line of help. */
export function SwitchRow({ label, help, value, onChange, disabled }: {
  label: string; help?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        {help ? <Text style={styles.help}>{help}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.brand }}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** One choice out of a few, as pills (the web's Customer / Vendor and Receive / Pay buttons). Each is 44 pt tall. */
export function OptionPills<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T | ''; onChange: (value: T) => void; label?: string;
}) {
  const styles = useThemed(makeStyles);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.pills}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    header: { ...type.footnoteBold, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.sm, marginLeft: spacing.xs },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.md },
    banner: { borderWidth: 1, borderRadius: 12, padding: spacing.md },
    bannerText: { ...type.subhead },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
    switchLabel: { ...type.body, color: c.ink },
    help: { ...type.footnote, color: c.muted },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    pill: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: c.outline, backgroundColor: 'transparent', justifyContent: 'center' },
    pillActive: { borderColor: c.brandText, backgroundColor: c.brandTint },
    pillText: { ...type.subhead, fontWeight: '600', color: c.muted },
    pillTextActive: { color: c.ink },
  });
