import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OPENING_BALANCE_TYPE, PARTY_TYPE, PAYMENT_TYPE, PAYMENT_TYPE_LABEL, VALIDATION_REGEX } from 'floman-shared/constants';
import { GST_STATES, GSTIN_PROBLEM_MESSAGES, SUPPLY_TYPE, SUPPLY_TYPE_LABEL, SUPPLY_TYPES, gstinProblem, gstinStateMismatch, stateByName, type SupplyType } from 'floman-shared/gst';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Field } from '@/components/Field';
import { ErrorBanner, FormCard, OptionPills, SectionHeader, SwitchRow } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import {
  addAddress, createParty, deactivateAddress, getParty, lookupGstin, updateAddress, updateParty,
  type Party, type PartyAddress, type PartyAddressInput, type PartyInput,
} from '@/features/parties/api';
import { AddressSheet } from '@/features/parties/components/AddressSheet';
import { addressLine, PARTY_TYPE_LABEL } from '@/features/parties/text';
import { notify } from '@/lib/notify';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const STATE_OPTIONS = GST_STATES.map((s) => ({ value: s.name, label: s.name }));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Errors = Partial<Record<'type' | 'name' | 'gstin' | 'email' | 'phone' | 'city' | 'state' | 'pincode' | 'billToAddress' | 'shipToAddress' | 'openingBalance' | 'openingBalanceType' | 'openingBalanceDate', string>>;

/**
 * Add or edit a vendor or customer: the web's form (client features/vendors/forms/VendorForm.tsx) for a phone. Who they
 * are (with the GSTIN Look Up), the billing and delivery address, more addresses, the opening balance, and for a
 * customer its usual supply. The server decides what is allowed (one party per GSTIN, a customer needs a GSTIN, the
 * places and states) and its words are shown at the top.
 *
 * Used by the Vendors & Customers screens and, in a full-screen sheet, by the Quotation's customer (the web's
 * "New customer" / "Edit customer"): `back` names where Cancel and the back link go, `onDone` gets the saved party,
 * `onCancel` leaves, and `lockKind` fixes the type (a Quotation's party is always a Customer).
 */
export function PartyForm({ id, back, onDone, onCancel, lockKind }: { id?: string; back: string; onDone: (saved: Party) => void; onCancel: () => void; lockKind?: string }) {
  const editing = Boolean(id);
  const queryClient = useQueryClient();
  const styles = useThemed(makeStyles);
  const colors = useColors();

  // A new party starts with no type chosen, as on the web: Customer or Vendor must be picked before it can be saved.
  const [kind, setKind] = useState<string>(lockKind ?? '');
  const [noGstin, setNoGstin] = useState(false);
  const [gstin, setGstin] = useState('');
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [billTo, setBillTo] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [sameDelivery, setSameDelivery] = useState(true);
  const [shipTo, setShipTo] = useState('');
  const [supplyType, setSupplyType] = useState<SupplyType>(SUPPLY_TYPE.B2B);
  const [opening, setOpening] = useState('');
  const [openingType, setOpeningType] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [addresses, setAddresses] = useState<PartyAddress[]>([]);
  const [active, setActive] = useState(true);
  const [gstinLocked, setGstinLocked] = useState(false);
  const [originalGstin, setOriginalGstin] = useState('');

  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; address: PartyAddress | null }>({ open: false, address: null });

  // An existing party fills the form once, when it arrives.
  const loaded = useRef(false);
  const { data: party, error: loadError, isLoading, refetch } = useQuery({ queryKey: ['party', id], queryFn: () => getParty(id!), enabled: editing });
  useEffect(() => {
    if (!party || loaded.current) return;
    loaded.current = true;
    setKind(party.type);
    setNoGstin(party.type === PARTY_TYPE.VENDOR && !party.gstin);
    setGstin(party.gstin ?? '');
    setOriginalGstin(party.gstin ?? '');
    setName(party.name);
    setContactPerson(party.contactPerson ?? '');
    setEmail(party.email ?? '');
    setPhone(party.phone ?? '');
    setBillTo(party.billToAddress ?? '');
    setCity(party.city);
    setState(party.state ?? '');
    setPincode(party.pincode ?? '');
    setSameDelivery((party.shipToAddress ?? '') === (party.billToAddress ?? ''));
    setShipTo(party.shipToAddress ?? '');
    setSupplyType((party.supplyType as SupplyType) || SUPPLY_TYPE.B2B);
    const amount = Number(party.openingBalance ?? 0);
    setOpening(amount > 0 ? String(amount) : '');
    setOpeningType(amount > 0 ? party.openingBalanceType ?? '' : '');
    setOpeningDate(amount > 0 && party.openingBalanceDate ? party.openingBalanceDate.slice(0, 10) : '');
    setAddresses(party.addresses ?? []);
    setActive(party.isActive);
    setGstinLocked(Boolean(party.gstinLocked));
  }, [party]);

  const gstinNow = noGstin ? '' : gstin.trim().toUpperCase();
  const gstinOk = VALIDATION_REGEX.GSTIN.test(gstinNow);
  const mismatch = gstinNow ? gstinStateMismatch(gstinNow, state) : null;
  const problem = !noGstin && gstinOk && gstinNow !== originalGstin ? gstinProblem(gstinNow) : null;

  // Only a vendor can be without a GSTIN: switching to Customer brings the GSTIN box back.
  const chooseKind = (next: string) => {
    setKind(next);
    if (next !== PARTY_TYPE.VENDOR) setNoGstin(false);
  };

  // Look Up: fills in the details registered for the GSTIN (asks again each time, e.g. when the address changed).
  const lookUp = async () => {
    setLooking(true);
    setBanner(null);
    try {
      const info = await lookupGstin(gstinNow);
      setFound(true);
      // An existing party keeps the name it was saved with; a new one takes the registered name.
      if (!editing && (info.tradeName || info.legalName)) setName(info.tradeName || info.legalName);
      if (info.city) setCity(info.city);
      if (info.state) setState(stateByName(info.state)?.name || info.state);
      if (info.pincode) setPincode(info.pincode);
      if (info.address) {
        setBillTo(info.address);
        if (!shipTo.trim()) setShipTo(info.address);
      }
      // GSTN says SEZ: SEZ with LUT to start with (changed here if they are supplied with IGST).
      if (info.isSez) setSupplyType(SUPPLY_TYPE.SEZWOP);
    } catch (e) {
      setFound(false);
      setBanner(message(e));
    } finally {
      setLooking(false);
    }
  };

  // ── Addresses: a new party keeps them here and sends them with it; an existing one changes them on the server at once. ──
  const saveAddress = async (input: PartyAddressInput): Promise<string | null> => {
    const current = sheet.address;
    try {
      if (!editing) {
        const local: PartyAddress = { ...input, id: current?.id ?? `local_${Date.now()}`, isActive: true };
        setAddresses((prev) => {
          const others = input.isDefault ? prev.map((a) => ({ ...a, isDefault: false })) : prev;
          return current ? others.map((a) => (a.id === current.id ? local : a)) : [...others, local];
        });
      } else if (current && !current.id.startsWith('local_')) {
        const saved = await updateAddress(id!, current.id, input);
        setAddresses((prev) => prev.map((a) => (a.id === current.id ? saved : input.isDefault ? { ...a, isDefault: false } : a)));
      } else {
        const saved = await addAddress(id!, input);
        setAddresses((prev) => [...(input.isDefault ? prev.map((a) => ({ ...a, isDefault: false })) : prev), saved]);
      }
      setSheet({ open: false, address: null });
      return null;
    } catch (e) {
      return message(e);
    }
  };

  const removeAddress = async (a: PartyAddress) => {
    if (!editing || a.id.startsWith('local_')) return setAddresses((prev) => prev.filter((x) => x.id !== a.id));
    try {
      await deactivateAddress(id!, a.id);
      setAddresses((prev) => prev.map((x) => (x.id === a.id ? { ...x, isActive: false, isDefault: false } : x)));
    } catch (e) {
      setBanner(message(e));
    }
  };

  const reactivateAddress = async (a: PartyAddress) => {
    try {
      await updateAddress(id!, a.id, { isActive: true });
      setAddresses((prev) => prev.map((x) => (x.id === a.id ? { ...x, isActive: true } : x)));
    } catch (e) {
      setBanner(message(e));
    }
  };

  const makeDefault = async (a: PartyAddress) => {
    if (editing && !a.id.startsWith('local_')) {
      try {
        await updateAddress(id!, a.id, { isDefault: true });
      } catch (e) {
        return setBanner(message(e));
      }
    }
    setAddresses((prev) => prev.map((x) => ({ ...x, isDefault: x.id === a.id })));
  };

  // ── Saving ──
  const save = useMutation({
    mutationFn: async () => {
      const amount = Number(opening) || 0;
      const input: PartyInput = {
        type: kind,
        name: name.trim(),
        gstin: noGstin ? null : gstinNow,
        city: city.trim(),
        state,
        pincode: pincode || null,
        contactPerson: contactPerson.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        billToAddress: billTo.trim(),
        shipToAddress: sameDelivery ? billTo.trim() : shipTo.trim(),
        supplyType,
        // No amount means no opening balance: its direction and date go as empty.
        openingBalance: amount,
        openingBalanceType: amount > 0 ? openingType : null,
        openingBalanceDate: amount > 0 ? openingDate : null,
        isActive: active,
      };
      if (editing) return updateParty(id!, input);
      return createParty({
        ...input,
        addresses: addresses.map(({ id: _id, isActive: _isActive, ...rest }) => ({ ...rest, isBilling: Boolean(rest.isBilling), isShipping: rest.isShipping !== false, gstin: rest.gstin || null, consigneeName: rest.consigneeName || null })),
      });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['parties'] });
      if (id) void queryClient.invalidateQueries({ queryKey: ['party', id] });
      notify(`${name.trim()} ${editing ? 'saved' : 'added'}.`);
      onDone(saved);
    },
    onError: (e) => setBanner(message(e)),
  });

  // The web form's own checks, in its words; the server checks the rest.
  const submit = () => {
    const next: Errors = {};
    if (kind !== PARTY_TYPE.CUSTOMER && kind !== PARTY_TYPE.VENDOR) next.type = 'Please select a Party Type (Vendor or Customer)';
    if (name.trim().length < 2) next.name = 'Legal / Business name must be at least 2 characters';
    if (city.trim().length < 2) next.city = 'City is required';
    if (!state) next.state = 'State is required for GST tax calculation';
    if (email.trim() && !EMAIL.test(email.trim())) next.email = 'Invalid email address format (e.g. name@domain.com)';
    if (phone.trim() && !VALIDATION_REGEX.PHONE.test(phone.trim())) next.phone = 'Enter a valid 10-digit phone number';
    if (pincode && !/^\d{6}$/.test(pincode)) next.pincode = 'Enter a valid 6-digit PIN Code';
    if (!noGstin) {
      if (!gstinOk) next.gstin = 'Invalid GSTIN format (e.g. 27AABCP1234F1Z5)';
      if (billTo.trim().length < 3) next.billToAddress = 'Registered billing address is required';
      if (!sameDelivery && shipTo.trim().length < 3) next.shipToAddress = 'Delivery / shipping address is required';
    }
    const amount = Number(opening);
    if (opening && Number.isNaN(amount)) next.openingBalance = 'Enter a valid amount';
    else if (amount < 0) next.openingBalance = 'Opening balance cannot be negative';
    if (amount > 0 && !openingType) next.openingBalanceType = 'Pick whether it is receivable or payable';
    if (amount > 0 && !openingDate) next.openingBalanceDate = 'Enter the date the balance is as of';
    setErrors(next);
    setBanner(null);
    if (Object.keys(next).length === 0) save.mutate();
  };

  if (editing && isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (editing && (loadError || !party)) {
    return (
      <Centered>
        <ErrorText message={message(loadError)} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const hasOpening = Number(opening) > 0;
  const places = [...addresses].sort((a, b) => Number(b.isActive !== false) - Number(a.isActive !== false) || Number(b.isDefault) - Number(a.isDefault));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle back={back} onBack={onCancel} title={lockKind ? `${editing ? 'Edit' : 'New'} ${PARTY_TYPE_LABEL[lockKind] ?? lockKind}` : editing ? 'Edit Vendor / Customer' : 'New Vendor / Customer'} />
        <ErrorBanner message={banner} />

        <View>
          <SectionHeader>Who are they?</SectionHeader>
          <FormCard>
            {lockKind ? null : (
              <>
                <OptionPills
                  label="Customer or vendor"
                  value={kind}
                  onChange={(next) => {
                    chooseKind(next);
                    setErrors((e) => ({ ...e, type: undefined }));
                  }}
                  options={[PARTY_TYPE.CUSTOMER, PARTY_TYPE.VENDOR].map((t) => ({ value: t, label: PARTY_TYPE_LABEL[t]! }))}
                />
                {errors.type ? <Text style={[styles.error, { color: colors.danger }]}>{errors.type}</Text> : null}
              </>
            )}
            {/* A local vendor for cash purchases may have no GSTIN; a customer always has one. */}
            {kind === PARTY_TYPE.VENDOR && !gstinLocked ? (
              <SwitchRow
                label="No GSTIN (local / unregistered vendor)"
                help="Purchases from this vendor start at 0% GST. Add the GSTIN here later if they register."
                value={noGstin}
                onChange={(on) => {
                  setNoGstin(on);
                  if (on) setGstin('');
                }}
              />
            ) : null}
            {!noGstin ? (
              <View style={{ gap: spacing.sm }}>
                <Field
                  label="GSTIN"
                  required
                  value={gstin}
                  onChangeText={(v) => setGstin(v.replace(/\s+/g, '').toUpperCase())}
                  placeholder="e.g. 27AABCP1234F1Z5"
                  autoCapitalize="characters"
                  maxLength={15}
                  editable={!gstinLocked}
                  error={errors.gstin ?? (problem ? GSTIN_PROBLEM_MESSAGES[problem] : null)}
                />
                <Text style={styles.help}>
                  {gstinLocked
                    ? 'Fixed: documents have been made for this party. Look Up fetches its registered address again.'
                    : found
                      ? 'Found. The details below are filled in.'
                      : 'Type the GSTIN and tap Look Up to fill in the rest.'}
                </Text>
                <Button title="Look Up" tone="secondary" busy={looking} disabled={!gstinOk} onPress={() => void lookUp()} />
              </View>
            ) : null}
            <Field label="Business name" required value={name} onChangeText={setName} placeholder={noGstin ? 'e.g. Sharma Traders' : 'As registered for GST'} autoCapitalize="words" error={errors.name} />
            <Field label="Contact person" value={contactPerson} onChangeText={setContactPerson} placeholder="e.g. Rajesh Sharma" autoCapitalize="words" />
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="accounts@company.com" keyboardType="email-address" error={errors.email} />
            <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" keyboardType="phone-pad" error={errors.phone} />
          </FormCard>
        </View>

        <View>
          <SectionHeader>Billing address</SectionHeader>
          <FormCard>
            <Field label="Address line" required={!noGstin} value={billTo} onChangeText={setBillTo} placeholder="Building, street, area" multiline autoCapitalize="sentences" error={errors.billToAddress} />
            <Field label="City" required value={city} onChangeText={setCity} placeholder="e.g. Mumbai" autoCapitalize="words" error={errors.city} />
            <PickerField label="State" required value={state} options={STATE_OPTIONS} onChange={setState} error={errors.state} searchable />
            <Field label="PIN" value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, ''))} placeholder="e.g. 400093" keyboardType="number-pad" maxLength={6} error={errors.pincode} />
            {mismatch ? (
              <Text style={[styles.help, { color: colors.lateText }]}>GSTIN starts with {String(mismatch.code).padStart(2, '0')} ({mismatch.name}), but the state is {state}.</Text>
            ) : null}
            <SwitchRow label="Deliver to the same address" value={sameDelivery} onChange={setSameDelivery} />
            {!sameDelivery ? (
              <Field label="Delivery address" required={!noGstin} value={shipTo} onChangeText={setShipTo} placeholder="Where goods are delivered" multiline autoCapitalize="sentences" error={errors.shipToAddress} />
            ) : null}
          </FormCard>
        </View>

        <View>
          <SectionHeader>More addresses</SectionHeader>
          <FormCard>
            {places.length === 0 ? <Text style={styles.help}>Billing places under the GSTIN, and delivery places anywhere.</Text> : null}
            {places.map((a) => (
              <View key={a.id} style={[styles.place, a.isActive === false && { opacity: 0.6 }]}>
                <Pressable
                  onPress={() => (a.isActive === false ? undefined : setSheet({ open: true, address: a }))}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${a.label}`}
                  style={{ flex: 1, gap: 2 }}
                >
                  <Text style={styles.placeTitle} numberOfLines={1}>
                    {a.label}
                    {a.isActive === false ? ' · Deactivated' : ''}
                    {a.isBilling ? ' · Billing' : ''}
                    {a.isShipping !== false ? ' · Delivery' : ''}
                    {a.isDefault ? ' · Default' : ''}
                  </Text>
                  <Text style={styles.help} numberOfLines={2}>{addressLine(a)}</Text>
                </Pressable>
                {a.isActive === false ? (
                  <IconAction icon="refresh" label="Reactivate" onPress={() => void reactivateAddress(a)} />
                ) : (
                  <>
                    {!a.isDefault && a.isShipping !== false ? <IconAction icon="star-outline" label="Make default" onPress={() => void makeDefault(a)} /> : null}
                    <IconAction icon={a.id.startsWith('local_') ? 'trash-outline' : 'ban-outline'} label={a.id.startsWith('local_') ? 'Remove' : 'Deactivate'} onPress={() => void removeAddress(a)} />
                  </>
                )}
              </View>
            ))}
            <Button title="Add another address" tone="secondary" onPress={() => setSheet({ open: true, address: null })} />
          </FormCard>
        </View>

        <View>
          <SectionHeader>Opening balance (optional)</SectionHeader>
          <FormCard>
            <Field label="Amount" prefix="₹" value={opening} onChangeText={(v) => setOpening(v.replace(/[^0-9.]/g, ''))} placeholder="0.00" keyboardType="decimal-pad" error={errors.openingBalance} />
            <OptionPills
              label="Opening balance side"
              value={openingType}
              onChange={setOpeningType}
              options={[
                { value: OPENING_BALANCE_TYPE.RECEIVABLE, label: PAYMENT_TYPE_LABEL[PAYMENT_TYPE.RECEIPT] },
                { value: OPENING_BALANCE_TYPE.PAYABLE, label: PAYMENT_TYPE_LABEL[PAYMENT_TYPE.PAYMENT] },
              ]}
            />
            {errors.openingBalanceType ? <Text style={[styles.error, { color: colors.danger }]}>{errors.openingBalanceType}</Text> : null}
            {hasOpening ? <DateField label="As of" required value={openingDate} onChange={setOpeningDate} error={errors.openingBalanceDate} /> : null}
            <Text style={styles.help}>Receive: they owed you before you started here. Pay: you owed them.</Text>
          </FormCard>
        </View>

        {/* Sales only: a customer's usual supply type (Quotation, Sales Order, Proforma and Invoice start from it). */}
        {kind === PARTY_TYPE.CUSTOMER ? (
          <View>
            <SectionHeader>Usual supply</SectionHeader>
            <FormCard>
              <OptionPills label="Usual supply" value={supplyType} onChange={setSupplyType} options={SUPPLY_TYPES.map((t) => ({ value: t, label: SUPPLY_TYPE_LABEL[t] }))} />
            </FormCard>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bar}>
        <Button title="Cancel" tone="secondary" style={{ flex: 1 }} onPress={onCancel} disabled={save.isPending} />
        <Button title={editing ? 'Save' : 'Add'} style={{ flex: 1 }} onPress={submit} busy={save.isPending} />
      </View>

      <AddressSheet
        visible={sheet.open}
        party={{ gstin: gstinNow, name, city, state, pincode, hasPlaces: addresses.some((a) => a.isActive !== false) }}
        editing={sheet.address}
        onSave={saveAddress}
        onClose={() => setSheet({ open: false, address: null })}
      />
    </KeyboardAvoidingView>
  );
}

/** A small icon button on an address row: 44 pt, labelled for screen readers. */
function IconAction({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={22} color={colors.muted} />
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    help: { ...type.footnote, color: c.muted },
    error: { ...type.footnote },
    place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
    placeTitle: { ...type.headline, color: c.ink },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
