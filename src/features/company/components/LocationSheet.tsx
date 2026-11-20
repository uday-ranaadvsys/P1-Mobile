import { VALIDATION_REGEX } from 'floman-shared/constants';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ErrorBanner, FormCard, SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import { addLocation, updateLocation, type CompanyLocation } from '../api';

type Errors = Partial<Record<'name' | 'addressLine1' | 'city' | 'pincode' | 'contactPhone', string>>;

/**
 * Add or change a location: a plant, warehouse or branch under the GSTIN, listed on the GST certificate. Its state
 * is always the company's, so it is shown and not asked. Saved straight away; `onSaved` gets the server's message.
 */
export function LocationSheet({ visible, companyId, state, location, onSaved, onClose }: {
  visible: boolean; companyId: string; state: string | null; location: CompanyLocation | null; onSaved: (message: string) => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [name, setName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(location?.name ?? '');
    // One address box, as on the party form: a line 2 saved earlier is joined into it.
    setAddressLine1(location ? [location.addressLine1, location.addressLine2].filter(Boolean).join(', ') : '');
    setCity(location?.city ?? '');
    setPincode(location?.pincode ?? '');
    setContactPerson(location?.contactPerson ?? '');
    setContactPhone(location?.contactPhone ?? '');
    setErrors({});
    setBanner(null);
  }, [visible, location]);

  const save = async () => {
    const next: Errors = {};
    if (name.trim().length < 2) next.name = 'Give the location a name (e.g. Peenya Plant).';
    else if (name.trim().length > 60) next.name = 'Name cannot exceed 60 characters';
    if (addressLine1.trim().length < 3) next.addressLine1 = 'Enter the address.';
    else if (addressLine1.trim().length > 300) next.addressLine1 = 'Address cannot exceed 300 characters';
    if (city.trim().length < 2) next.city = 'Enter the city.';
    if (!VALIDATION_REGEX.PINCODE.test(pincode.trim())) next.pincode = 'Enter a 6-digit PIN code.';
    if (contactPhone.trim() && !VALIDATION_REGEX.PHONE.test(contactPhone.trim())) next.contactPhone = 'Enter a 10-digit phone number.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    setBanner(null);
    const input = { name: name.trim(), addressLine1: addressLine1.trim(), addressLine2: '', city: city.trim(), pincode: pincode.trim(), contactPerson: contactPerson.trim(), contactPhone: contactPhone.trim() };
    try {
      const { message } = location ? await updateLocation(companyId, location.id, input) : await addLocation(companyId, input);
      onSaved(message ?? 'Location saved.');
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.head}>
          <Text style={styles.title}>{location ? 'Edit Location' : 'Add Location'}</Text>
          <Button title="Cancel" tone="secondary" onPress={onClose} disabled={busy} style={styles.headButton} />
        </View>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <Text style={styles.help}>A plant, warehouse or branch under your GSTIN. It must be listed on your GST certificate.</Text>
          <ErrorBanner message={banner} />
          <View>
            <SectionHeader>Location</SectionHeader>
            <FormCard>
              <Field label="Name" required value={name} onChangeText={setName} placeholder="e.g. Peenya Plant" autoCapitalize="words" error={errors.name} />
              <Text style={styles.help}>Shown when you pick where a document is billed or dispatched from.</Text>
            </FormCard>
          </View>
          <View>
            <SectionHeader>Address</SectionHeader>
            <FormCard>
              <Field label="Address line" required value={addressLine1} onChangeText={setAddressLine1} placeholder="Building, street, area" multiline autoCapitalize="sentences" error={errors.addressLine1} />
              <Field label="City" required value={city} onChangeText={setCity} placeholder="e.g. Bengaluru" autoCapitalize="words" error={errors.city} />
              <Field label="PIN code" required value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, ''))} placeholder="e.g. 560058" keyboardType="number-pad" maxLength={6} error={errors.pincode} />
              <InfoRow label="State" value={state} />
              <Text style={styles.help}>The same as your GSTIN's.</Text>
            </FormCard>
          </View>
          <View>
            <SectionHeader>Contact</SectionHeader>
            <FormCard>
              <Field label="Contact person" value={contactPerson} onChangeText={setContactPerson} placeholder="Optional" autoCapitalize="words" />
              <Field label="Phone" value={contactPhone} onChangeText={setContactPhone} placeholder="Optional" keyboardType="phone-pad" error={errors.contactPhone} />
            </FormCard>
          </View>
        </ScrollView>
        <View style={styles.bar}>
          <Button title={location ? 'Save changes' : 'Save'} onPress={() => void save()} busy={busy} style={{ flex: 1 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.lg + spacing.sm, paddingBottom: spacing.sm, backgroundColor: c.surface },
    title: { ...type.title3, color: c.ink },
    headButton: { minHeight: 44, paddingHorizontal: spacing.md },
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    help: { ...type.footnote, color: c.muted },
    bar: { flexDirection: 'row', padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
