import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { gstinStateMismatch } from 'floman-shared/gst';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Field } from '@/components/Field';
import { ErrorBanner, FormCard, SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { getCompany, updateCompany } from '@/features/company/api';
import { notify } from '@/lib/notify';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

type Errors = Partial<Record<'name' | 'address' | 'pincode', string>>;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Edit the company: the web's form (client features/settings/forms/CompanyForm.tsx). Business name, address, city and
 * PIN, and the export LUT. The GSTIN and state are set when the account is made, so they are shown and never sent;
 * the logo is changed on the web. The server's words appear at the top.
 */
export default function EditCompany() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const styles = useThemed(makeStyles);
  const colors = useColors();

  const { data: company, error: loadError, isLoading, refetch } = useQuery({ queryKey: ['company'], queryFn: getCompany });
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [lutNo, setLutNo] = useState('');
  const [lutFiled, setLutFiled] = useState('');
  const [lutEnd, setLutEnd] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);

  // The company fills the form once, when it arrives.
  const loaded = useRef(false);
  useEffect(() => {
    if (!company || loaded.current) return;
    loaded.current = true;
    setName(company.name);
    setAddress(company.address);
    setCity(company.city ?? '');
    setPincode(company.pincode ?? '');
    setLutNo(company.lutNo ?? '');
    setLutFiled(company.lutFiledDate ? company.lutFiledDate.slice(0, 10) : '');
    setLutEnd(company.lutEndDate ? company.lutEndDate.slice(0, 10) : '');
  }, [company]);

  const save = useMutation({
    mutationFn: () =>
      updateCompany(company!.id, {
        name: name.trim(),
        address: address.trim(),
        city: city.trim() || null,
        pincode: pincode.trim() || null,
        lutNo: lutNo.trim().toUpperCase() || null,
        lutFiledDate: lutFiled ? new Date(lutFiled).toISOString() : null,
        lutEndDate: lutEnd ? new Date(lutEnd).toISOString() : null,
        // The logo is not changed here: it goes back as it was.
        logoUrl: company!.logoUrl,
        logoHeight: company!.logoHeight ?? 80,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company'] });
      notify(`Company "${name.trim()}" updated successfully.`);
      router.back();
    },
    onError: (e) => setBanner(message(e)),
  });

  // The web form's own checks, in its words; the server checks the rest.
  const submit = () => {
    const next: Errors = {};
    if (name.trim().length < 2) next.name = 'Company name must be at least 2 characters';
    else if (name.trim().length > 255) next.name = 'Company name cannot exceed 255 characters';
    if (address.trim().length < 5) next.address = 'Registered corporate address must be at least 5 characters';
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) next.pincode = 'Enter a valid 6-digit PIN Code';
    setErrors(next);
    setBanner(null);
    if (Object.keys(next).length === 0) save.mutate();
  };

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (loadError || !company) {
    return (
      <Centered>
        <ErrorText message={message(loadError)} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }
  const mismatch = gstinStateMismatch(company.gstin, company.state);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle back="My Company" title="Edit Company" />
        <ErrorBanner message={banner} />

        <View>
          <SectionHeader>Business details</SectionHeader>
          <FormCard>
            <InfoRow label="GSTIN" value={company.gstin} />
            <Text style={styles.help}>Set when your account was created. It can't be changed here.</Text>
            <Field label="Legal name" required value={name} onChangeText={setName} placeholder="As registered for GST" autoCapitalize="words" error={errors.name} />
          </FormCard>
        </View>

        <View>
          <SectionHeader>Address</SectionHeader>
          <FormCard>
            <Field label="Address line" required value={address} onChangeText={setAddress} placeholder="Building, street, area" multiline autoCapitalize="sentences" error={errors.address} />
            <Field label="City" value={city} onChangeText={setCity} placeholder="e.g. Pune" autoCapitalize="words" />
            <InfoRow label="State" value={company.state} />
            <Field label="PIN" value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, ''))} placeholder="e.g. 411026" keyboardType="number-pad" maxLength={6} error={errors.pincode} />
            {mismatch ? (
              <Text style={[styles.help, { color: colors.warnText }]}>
                GSTIN starts with {String(mismatch.code).padStart(2, '0')} ({mismatch.name}), but the address is in {company.state}.
              </Text>
            ) : null}
          </FormCard>
        </View>

        <View>
          <SectionHeader>Export LUT (optional)</SectionHeader>
          <FormCard>
            <Field label="ARN" value={lutNo} onChangeText={(v) => setLutNo(v.toUpperCase())} placeholder="e.g. AD270324001234F" autoCapitalize="characters" />
            <DateField label="Filed on" value={lutFiled} onChange={setLutFiled} onClear={() => setLutFiled('')} />
            <DateField label="Valid until" value={lutEnd} onChange={setLutEnd} onClear={() => setLutEnd('')} />
            <Text style={styles.help}>Needed to export without paying IGST.</Text>
          </FormCard>
        </View>

        <Text style={styles.help}>To change the logo, use My Company on the web.</Text>
      </ScrollView>

      <View style={styles.bar}>
        <Button title="Cancel" tone="secondary" style={{ flex: 1 }} onPress={() => router.back()} disabled={save.isPending} />
        <Button title="Save" style={{ flex: 1 }} onPress={submit} busy={save.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    help: { ...type.footnote, color: c.muted },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
