import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/FormParts';
import { ScreenTitle } from '@/components/ScreenTitle';
import { HeaderSection } from '@/features/quotations/components/HeaderSection';
import { headerErrors, newHeader, type HeaderErrors, type QuotationHeader } from '@/features/quotations/form';
import { notify } from '@/lib/notify';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

/**
 * New Quotation. Step 2 of the build: the header (customer, places, series and number, dates, supply type, notes
 * and terms). The server needs at least one item to save, so Save Draft only checks the header for now; the items
 * and totals come in the next step.
 */
export default function QuotationForm() {
  const router = useRouter();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [header, setHeader] = useState<QuotationHeader>(newHeader);
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [banner] = useState<string | null>(null);

  const change = (patch: Partial<QuotationHeader>) => {
    setHeader((h) => ({ ...h, ...patch }));
    // A field you have changed is no longer marked.
    setErrors((e) => ({
      ...e,
      ...(patch.party && { party: undefined }),
      ...(patch.issueDate && { issueDate: undefined }),
      ...(patch.validityDate && { validityDate: undefined }),
    }));
  };

  const saveDraft = () => {
    const next = headerErrors(header);
    setErrors(next);
    if (Object.keys(next).length === 0) notify('The top of the form is complete. Items come in the next step, then you can save.');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle back="Quotations" title="New Quotation" />
        <ErrorBanner message={banner} />
        <HeaderSection value={header} onChange={change} errors={errors} />
      </ScrollView>
      <View style={styles.bar}>
        <Button title="Cancel" tone="secondary" style={{ flex: 1 }} onPress={() => router.back()} />
        <Button title="Save Draft" style={{ flex: 1 }} onPress={saveDraft} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
