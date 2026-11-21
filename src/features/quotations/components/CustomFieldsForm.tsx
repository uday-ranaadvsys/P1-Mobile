import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { DateField } from '@/components/DateField';
import { Field } from '@/components/Field';
import { SwitchRow } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { spacing, type, useThemed, type Colors } from '@/theme';
import type { CustomFieldDefinition } from '../api';

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/**
 * The company's own fields on a document form (the web's "Additional Custom Fields"): text, number, date, dropdown,
 * a yes/no switch and a link, each as the company set it up. A required one is marked and checked on save.
 */
export function CustomFieldsForm({ fields, values, onChange, errors }: {
  fields: CustomFieldDefinition[]; values: Record<string, unknown>; onChange: (key: string, value: unknown) => void; errors?: Record<string, string>;
}) {
  const styles = useThemed(makeStyles);
  if (fields.length === 0) return null;
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.title}>Additional Custom Fields</Text>
      {fields.map((f) => {
        const label = f.isConfidential ? `${f.displayLabel} (confidential)` : f.displayLabel;
        const error = errors?.[f.fieldKey];
        const value = values[f.fieldKey];
        switch (f.fieldType) {
          case 'number':
            return (
              <Field key={f.id} label={label} required={f.isRequired} value={text(value)} onChangeText={(v) => onChange(f.fieldKey, v.replace(/[^0-9.-]/g, ''))} placeholder={f.defaultValue || '0.00'} keyboardType="numbers-and-punctuation" error={error} />
            );
          case 'date':
            return <DateField key={f.id} label={label} required={f.isRequired} value={text(value)} onChange={(iso) => onChange(f.fieldKey, iso)} onClear={() => onChange(f.fieldKey, '')} error={error} />;
          case 'dropdown':
            return (
              <PickerField
                key={f.id}
                label={label}
                required={f.isRequired}
                value={text(value)}
                placeholder={`Select ${f.displayLabel}`}
                options={[{ value: '', label: 'None' }, ...(Array.isArray(f.dropdownOptions) ? f.dropdownOptions : []).map((o) => ({ value: o, label: o }))]}
                onChange={(v) => onChange(f.fieldKey, v)}
                error={error}
              />
            );
          case 'checkbox':
            return <SwitchRow key={f.id} label={label} value={Boolean(value)} onChange={(v) => onChange(f.fieldKey, v)} />;
          case 'url':
            return <Field key={f.id} label={label} required={f.isRequired} value={text(value)} onChangeText={(v) => onChange(f.fieldKey, v)} placeholder={f.defaultValue || 'https://...'} keyboardType="url" error={error} />;
          default:
            return <Field key={f.id} label={label} required={f.isRequired} value={text(value)} onChangeText={(v) => onChange(f.fieldKey, v)} placeholder={f.defaultValue || `Enter ${f.displayLabel.toLowerCase()}...`} maxLength={f.maxLength || 255} autoCapitalize="sentences" error={error} />;
        }
      })}
    </View>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({ title: { ...type.headline, color: c.ink } });
