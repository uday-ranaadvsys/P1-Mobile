import { VALIDATION_REGEX } from 'floman-shared/constants';
import { GST_STATES, billingGstinProblem, stateByName, stateOfGstin } from 'floman-shared/gst';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ErrorBanner, FormCard, SectionHeader, SwitchRow } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import { lookupGstin, type PartyAddress, type PartyAddressInput } from '../api';

const STATE_OPTIONS = GST_STATES.map((s) => ({ value: s.name, label: s.name }));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Form = {
  label: string;
  isBilling: boolean;
  isShipping: boolean;
  gstin: string;
  consigneeName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  isDefault: boolean;
};

/** What the sheet needs to know about the party it belongs to. */
export type AddressParty = { gstin: string; name: string; city: string; state: string; pincode: string; hasPlaces: boolean };

const empty = (party: AddressParty): Form => ({
  label: '', isBilling: false, isShipping: true, gstin: '', consigneeName: '', addressLine1: '', addressLine2: '',
  city: party.city, state: party.state, pincode: party.pincode, contactPerson: '', contactPhone: '', contactEmail: '', isDefault: !party.hasPlaces,
});

const fromAddress = (a: PartyAddress): Form => ({
  label: a.label, isBilling: Boolean(a.isBilling), isShipping: a.isShipping !== false, gstin: a.isBilling ? '' : a.gstin ?? '',
  consigneeName: a.consigneeName ?? '', addressLine1: a.addressLine1, addressLine2: a.addressLine2 ?? '', city: a.city, state: a.state ?? '',
  pincode: a.pincode ?? '', contactPerson: a.contactPerson ?? '', contactPhone: a.contactPhone ?? '', contactEmail: a.contactEmail ?? '', isDefault: a.isDefault,
});

/**
 * Another address of a party: a billing place (under its GSTIN, so in its state), a delivery place (anywhere, with
 * its own GSTIN if it has one), or both. The rules are the web's; the server checks them again and its words are shown.
 * `onSave` returns the reason it was refused, or null when it was saved.
 */
export function AddressSheet({ visible, party, editing, onSave, onClose }: {
  visible: boolean; party: AddressParty; editing: PartyAddress | null; onSave: (input: PartyAddressInput) => Promise<string | null>; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [form, setForm] = useState<Form>(empty(party));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);

  // Each time the sheet opens it starts from the address being edited, or from the party's own place.
  useEffect(() => {
    if (!visible) return;
    setForm(editing ? fromAddress(editing) : empty(party));
    setErrors({});
    setBanner(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editing]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const registered = stateOfGstin(party.gstin);

  // A billing address is in the GSTIN's state: shown as soon as Billing is ticked.
  useEffect(() => {
    if (form.isBilling && registered) setForm((f) => (f.state === registered.name ? f : { ...f, state: registered.name }));
  }, [form.isBilling, registered?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const ownGstin = form.gstin.trim().toUpperCase();
  const billingProblem = form.isBilling && ownGstin ? billingGstinProblem(ownGstin, { gstin: party.gstin, name: party.name }) : null;

  // Look Up fills in the name and address registered for the place's own GSTIN.
  const lookUp = async () => {
    setLooking(true);
    setBanner(null);
    try {
      const info = await lookupGstin(ownGstin);
      set({
        consigneeName: info.legalName || info.tradeName || form.consigneeName,
        addressLine1: info.street || info.address || form.addressLine1,
        city: info.city || form.city,
        state: stateByName(info.state)?.name || info.state || form.state,
        pincode: info.pincode || form.pincode,
      });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Couldn't look up the GSTIN.");
    } finally {
      setLooking(false);
    }
  };

  const save = async () => {
    const next: Partial<Record<keyof Form, string>> = {};
    if (form.label.trim().length < 2) next.label = 'Name of the place is required.';
    if (!form.isBilling && !form.isShipping) next.isShipping = 'Pick Billing, Delivery or both.';
    if (form.addressLine1.trim().length < 3) next.addressLine1 = 'Address line is required.';
    if (form.city.trim().length < 2) next.city = 'City is required.';
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) next.pincode = 'Enter a valid 6-digit PIN Code.';
    if (form.contactPhone && !VALIDATION_REGEX.PHONE.test(form.contactPhone)) next.contactPhone = 'Enter a valid 10-digit phone number.';
    if (form.contactEmail && !EMAIL.test(form.contactEmail)) next.contactEmail = 'Invalid email address format.';
    if (ownGstin && !VALIDATION_REGEX.GSTIN.test(ownGstin)) next.gstin = 'Invalid GSTIN format (e.g. 29AABCS0701F1ZT).';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // A billing address is a place of business under the party's GSTIN: in its state, with its GSTIN (the server checks the same).
    let state = form.state;
    if (form.isBilling && party.gstin) {
      if (!registered) return setBanner("Add the party's GSTIN before adding a billing address.");
      if (billingProblem) return setBanner(billingProblem);
      if (state && stateByName(state)?.code !== registered.code) {
        return setBanner(`A billing address is a place of business under this party's GSTIN, so it must be in ${registered.name}. Untick Billing for a delivery address elsewhere.`);
      }
      state = registered.name;
    }
    setBusy(true);
    setBanner(null);
    const message = await onSave({
      label: form.label.trim(),
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim() || null,
      city: form.city.trim(),
      state: state || null,
      pincode: form.pincode || null,
      contactPerson: form.contactPerson.trim() || null,
      contactPhone: form.contactPhone || null,
      contactEmail: form.contactEmail || null,
      isDefault: form.isShipping && form.isDefault,
      isBilling: form.isBilling,
      isShipping: form.isShipping,
      gstin: ownGstin || null,
      consigneeName: form.consigneeName.trim() || null,
    });
    setBusy(false);
    if (message) setBanner(message);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.head}>
          <Text style={styles.title}>{editing ? 'Edit Address' : 'New Address'}</Text>
          <Button title="Cancel" tone="secondary" onPress={onClose} disabled={busy} style={styles.headButton} />
        </View>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <ErrorBanner message={banner} />

          <View>
            <SectionHeader>Place</SectionHeader>
            <FormCard>
              <Field label="Name of the place" required value={form.label} onChangeText={(label) => set({ label })} placeholder="e.g. Chakan Plant 2" autoCapitalize="words" error={errors.label} />
              <SwitchRow label="Billing (Bill To)" value={form.isBilling} onChange={(isBilling) => set({ isBilling })} />
              <SwitchRow label="Delivery (Ship To)" value={form.isShipping} onChange={(isShipping) => set({ isShipping })} />
              {errors.isShipping ? <Text style={[styles.error, { color: colors.danger }]}>{errors.isShipping}</Text> : null}
              <Text style={styles.help}>
                {form.isBilling
                  ? `Billing: a place of business under ${party.gstin || "the party's GSTIN"}, so in ${registered?.name || 'its state'}.`
                  : 'Delivery: goods can go anywhere. A place in another state has its own GSTIN.'}
              </Text>
            </FormCard>
          </View>

          {/* A delivery-only place: its own GSTIN (Look Up fills the rest) and consignee. Kept in view when Billing is ticked on a place that has a GSTIN, to say why it can't be billing. */}
          {!form.isBilling || ownGstin ? (
            <View>
              <SectionHeader>GST (optional)</SectionHeader>
              <FormCard>
                <Field
                  label="GSTIN of this place"
                  value={form.gstin}
                  onChangeText={(gstin) => set({ gstin: gstin.replace(/\s+/g, '').toUpperCase() })}
                  placeholder="e.g. 29AABCS0701F1ZT"
                  autoCapitalize="characters"
                  maxLength={15}
                  error={errors.gstin}
                />
                {billingProblem ? <Text style={[styles.help, { color: colors.lateText }]}>{billingProblem}</Text> : <Text style={styles.help}>Look Up fills in the name and address registered for it.</Text>}
                <Button title="Look Up" tone="secondary" busy={looking} disabled={!VALIDATION_REGEX.GSTIN.test(ownGstin)} onPress={() => void lookUp()} />
                <Field label="Consignee name" value={form.consigneeName} onChangeText={(consigneeName) => set({ consigneeName })} placeholder="Printed on Ship To instead of the party's name" autoCapitalize="words" />
              </FormCard>
            </View>
          ) : null}

          <View>
            <SectionHeader>Address</SectionHeader>
            <FormCard>
              <Field label="Address line" required value={form.addressLine1} onChangeText={(addressLine1) => set({ addressLine1 })} placeholder="Building, street, area" multiline autoCapitalize="sentences" error={errors.addressLine1} />
              <Field label="Landmark" value={form.addressLine2} onChangeText={(addressLine2) => set({ addressLine2 })} placeholder="Optional" autoCapitalize="sentences" />
              <Field label="City" required value={form.city} onChangeText={(city) => set({ city })} autoCapitalize="words" error={errors.city} />
              <PickerField label="State" value={form.state} options={STATE_OPTIONS} onChange={(state) => set({ state })} disabled={form.isBilling && Boolean(registered)} searchable />
              <Field label="PIN" value={form.pincode} onChangeText={(pincode) => set({ pincode: pincode.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={6} error={errors.pincode} />
            </FormCard>
          </View>

          <View>
            <SectionHeader>Contact (optional)</SectionHeader>
            <FormCard>
              <Field label="Contact person" value={form.contactPerson} onChangeText={(contactPerson) => set({ contactPerson })} autoCapitalize="words" />
              <Field label="Phone" value={form.contactPhone} onChangeText={(contactPhone) => set({ contactPhone })} keyboardType="phone-pad" error={errors.contactPhone} />
              <Field label="Email" value={form.contactEmail} onChangeText={(contactEmail) => set({ contactEmail })} keyboardType="email-address" error={errors.contactEmail} />
            </FormCard>
          </View>

          {form.isShipping ? <SwitchRow label="Default delivery address" value={form.isDefault} onChange={(isDefault) => set({ isDefault })} /> : null}
        </ScrollView>
        <View style={styles.bar}>
          <Button title="Save" onPress={() => void save()} busy={busy} style={{ flex: 1 }} />
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
    error: { ...type.footnote },
    bar: { flexDirection: 'row', padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
