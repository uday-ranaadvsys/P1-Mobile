import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { Field } from '@/components/Field';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

type Project = { projectName: string; projectCode: string; clientName: string };

/** "Project details (optional)": folded away until wanted, and open by itself when one of them is filled in. */
export function ProjectFields({ value, onChange }: { value: Project; onChange: (patch: Partial<Project>) => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (value.projectName || value.projectCode || value.clientName) setOpen(true);
  }, [value.projectName, value.projectCode, value.clientName]);
  return (
    <>
      <Pressable onPress={() => setOpen((s) => !s)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.toggle}>
        <Ionicons name={open ? 'chevron-up' : 'add'} size={18} color={colors.ink} />
        <Text style={styles.toggleText}>Project details (optional)</Text>
      </Pressable>
      {open ? (
        <>
          <Field label="Project name" value={value.projectName} onChangeText={(projectName) => onChange({ projectName })} placeholder="e.g. 50MW Solar Substation Package" autoCapitalize="words" />
          <Field label="Project code" value={value.projectCode} onChangeText={(projectCode) => onChange({ projectCode })} placeholder="PRJ-2026-084" autoCapitalize="characters" />
          <Field label="Client / Principal" value={value.clientName} onChangeText={(clientName) => onChange({ clientName })} placeholder="e.g. NTPC / L&T Ltd" autoCapitalize="words" />
        </>
      ) : null}
    </>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
    toggleText: { ...type.subhead, fontWeight: '600', color: c.ink },
  });
