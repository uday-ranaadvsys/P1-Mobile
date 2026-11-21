import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PARTY_TYPE } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { PERMISSIONS } from 'floman-shared/permissions';
import { SUPPLY_TYPE, SUPPLY_TYPE_LABEL } from 'floman-shared/gst';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { DateField } from '@/components/DateField';
import { Field } from '@/components/Field';
import { FormCard, SectionHeader } from '@/components/FormParts';
import { FullScreenModal } from '@/components/FullScreenModal';
import { PickerField } from '@/components/PickerField';
import { useSession } from '@/features/auth/session';
import { getCompany } from '@/features/company/api';
import { getParty, type Party } from '@/features/parties/api';
import { PartyForm } from '@/features/parties/components/PartyForm';
import { gstinText, placeLine } from '@/features/parties/text';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import { listTextTemplates, type TextTemplate } from '../api';
import { billingAddresses, defaultShipToId, deliveryAddresses, PRIMARY, placeChoice, validForDays, type HeaderErrors, type QuotationHeader } from '../form';
import { useCustomFieldDefs } from '../useCustomFieldDefs';
import { CustomerSheet } from './CustomerSheet';
import { CustomFieldsForm } from './CustomFieldsForm';

/** In the order the forms offer them. */
const SUPPLY_OPTIONS = [SUPPLY_TYPE.B2B, SUPPLY_TYPE.SEZWOP, SUPPLY_TYPE.SEZWP].map((value) => ({ value, label: SUPPLY_TYPE_LABEL[value] }));

const templateTitle = (t: TextTemplate) => `${t.title || t.name || 'Untitled'}${t.isDefault ? ' (Default)' : ''}`;

/**
 * The top of the Quotation form, as the web's Customer & dates, Project details and Notes & terms:
 * the customer and where it is billed and shipped, our own places, the series and number, the dates,
 * the supply type, and the notes and terms. `onChange` takes the changed fields only.
 */
export function HeaderSection({ value, onChange, errors, children, footer }: { value: QuotationHeader; onChange: (patch: Partial<QuotationHeader>) => void; errors: HeaderErrors; children?: ReactNode; footer?: ReactNode }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [customerSheet, setCustomerSheet] = useState(false);
  const [picking, setPicking] = useState(false);
  // A customer made or edited from here (the web's "New customer" / "Edit customer"); `id` set = the one chosen.
  const [quick, setQuick] = useState<{ id?: string } | null>(null);
  const queryClient = useQueryClient();
  const { can } = useSession();
  const canCreateParty = can(PERMISSIONS.VENDORS.CREATE);
  const canUpdateParty = can(PERMISSIONS.VENDORS.UPDATE);
  const [showProject, setShowProject] = useState(false);
  const [noteTemplateId, setNoteTemplateId] = useState('');
  const [termTemplateId, setTermTemplateId] = useState('');
  const { party } = value;
  const { fields: customFields } = useCustomFieldDefs();

  // ── What the pickers list ──
  const company = useQuery({ queryKey: ['company'], queryFn: getCompany });
  const locations = useMemo(() => (company.data?.locations ?? []).filter((l) => l.isActive), [company.data]);
  const notes = useQuery({ queryKey: ['templates', 'notes', DOCUMENT_TYPE.QUOTATION], queryFn: () => listTextTemplates('notes', DOCUMENT_TYPE.QUOTATION) });
  const terms = useQuery({ queryKey: ['templates', 'terms', DOCUMENT_TYPE.QUOTATION], queryFn: () => listTextTemplates('terms', DOCUMENT_TYPE.QUOTATION) });

  // Project details open by themselves when one is filled in.
  useEffect(() => {
    if (value.projectName || value.projectCode || value.clientName) setShowProject(true);
  }, [value.projectName, value.projectCode, value.clientName]);

  // A customer: its places come with it, and it starts from its own supply type and delivery address.
  const pickCustomer = async (picked: Party) => {
    setPicking(true);
    const full = await getParty(picked.id).catch(() => picked);
    setPicking(false);
    onChange({ party: full, supplyType: full.supplyType || SUPPLY_TYPE.B2B, billingAddressId: '', shipToId: defaultShipToId(full) });
  };

  // ── Where it is billed and shipped ──
  const billOthers = billingAddresses(party);
  const shipList = deliveryAddresses(party);
  const billOptions = [{ value: '', label: `Registered: ${(party?.billToAddress ?? '').slice(0, 40)}` }, ...billOthers.map((a) => ({ value: a.id, label: placeChoice(a) }))];
  const shipOptions = [
    { value: PRIMARY, label: `Primary: ${party?.shipToAddress ? `${party.shipToAddress.slice(0, 32)}…` : 'Registered Shipping'}` },
    ...shipList.map((a) => ({ value: a.id, label: `${placeChoice(a)}${a.isDefault ? ' ⭐' : ''}` })),
  ];
  const placeOptions = [{ value: '', label: 'Registered address' }, ...locations.map((l) => ({ value: l.id, label: l.name }))];
  const days = validForDays(value);

  // The web's order: (number and series, in the title), our places, Customer & dates, (the items), Notes & terms.
  // Our places: only once the company has locations besides its registered address. The number and series are in the
  // screen's title (they follow Bill from, which picks the series).
  const placesSection =
    locations.length > 0 ? (
      <FormCard>
        <PickerField
          label="Bill from"
          value={value.billingLocationId}
          options={placeOptions}
          onChange={(billingLocationId) =>
            // Dispatch from moves along while it was the same place.
            onChange({ billingLocationId, shippingLocationId: value.shippingLocationId === value.billingLocationId ? billingLocationId : value.shippingLocationId })
          }
        />
        <PickerField label="Dispatch from" value={value.shippingLocationId} options={placeOptions} onChange={(shippingLocationId) => onChange({ shippingLocationId })} />
      </FormCard>
    ) : null;

  return (
    <>
      {placesSection}
      <View>
        <SectionHeader>Customer & dates</SectionHeader>
        <FormCard>
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>
              Customer<Text style={{ color: colors.danger }}> *</Text>
            </Text>
            <Pressable
              onPress={() => setCustomerSheet(true)}
              accessibilityRole="button"
              accessibilityLabel={`Customer: ${party?.name ?? 'not chosen'}`}
              style={({ pressed }) => [styles.box, errors.party ? { borderColor: colors.danger } : null, pressed && { opacity: 0.7 }]}
            >
              {party ? (
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.value} numberOfLines={2}>{hide.text(party.name)}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{gstinText(party)} · {hide.text(placeLine(party))}</Text>
                </View>
              ) : (
                <Text style={[styles.value, { flex: 1, color: colors.placeholder }]}>Choose a customer</Text>
              )}
              {picking ? <ActivityIndicator color={colors.muted} /> : <Ionicons name="chevron-down" size={18} color={colors.muted} />}
            </Pressable>
            {errors.party ? <Text style={[styles.error, { color: colors.danger }]}>{errors.party}</Text> : null}
            {party && canUpdateParty ? (
              <Pressable onPress={() => setQuick({ id: party.id })} accessibilityRole="button" style={styles.toggle}>
                <Text style={[styles.toggleText, { color: colors.brandText }]}>Edit customer</Text>
              </Pressable>
            ) : null}
          </View>

          {party ? (
            billOthers.length > 0 ? (
              <PickerField label="Bill to" value={value.billingAddressId} options={billOptions} onChange={(billingAddressId) => onChange({ billingAddressId })} />
            ) : (
              <ReadOnlyBox label="Bill to" text={hide.text(party.billToAddress)} />
            )
          ) : (
            <ReadOnlyBox label="Bill to" text="Fills in after you pick a customer" empty />
          )}

          {party ? (
            shipList.length > 0 ? (
              <PickerField label="Ship to" value={value.shipToId} options={shipOptions} onChange={(shipToId) => onChange({ shipToId })} />
            ) : (
              <ReadOnlyBox label="Ship to" text={hide.text(party.shipToAddress || party.billToAddress)} />
            )
          ) : (
            <ReadOnlyBox label="Ship to" text="Fills in after you pick a customer" empty />
          )}

          <DateField label="Issue date" required value={value.issueDate} onChange={(issueDate) => onChange({ issueDate })} error={errors.issueDate} />
          <DateField
            label={days !== null ? `Valid until · ${days === 1 ? '1 day' : `${days} days`}` : 'Valid until'}
            required
            value={value.validityDate}
            onChange={(validityDate) => onChange({ validityDate })}
            error={errors.validityDate}
          />
          <Field label="Reference" value={value.reference} onChangeText={(reference) => onChange({ reference })} placeholder="e.g. REF-2026-001" maxLength={100} />
          <PickerField label="Supply type" value={value.supplyType} options={SUPPLY_OPTIONS} onChange={(supplyType) => onChange({ supplyType })} />

          <Pressable onPress={() => setShowProject((s) => !s)} accessibilityRole="button" accessibilityState={{ expanded: showProject }} style={styles.toggle}>
            <Ionicons name={showProject ? 'chevron-up' : 'add'} size={18} color={colors.ink} />
            <Text style={styles.toggleText}>Project details (optional)</Text>
          </Pressable>
          {showProject ? (
            <>
              <Field label="Project name" value={value.projectName} onChangeText={(projectName) => onChange({ projectName })} placeholder="e.g. 50MW Solar Substation Package" autoCapitalize="words" />
              <Field label="Project code" value={value.projectCode} onChangeText={(projectCode) => onChange({ projectCode })} placeholder="PRJ-2026-084" autoCapitalize="characters" />
              <Field label="Client / Principal" value={value.clientName} onChangeText={(clientName) => onChange({ clientName })} placeholder="e.g. NTPC / L&T Ltd" autoCapitalize="words" />
            </>
          ) : null}

          <CustomFieldsForm fields={customFields} values={value.customFields} onChange={(key, v) => onChange({ customFields: { ...value.customFields, [key]: v } })} errors={errors.custom} />
        </FormCard>
      </View>

      {/* The Items and the TDS / TCS card go here, between Customer & dates and Notes & terms, as on the web. */}
      {children}

      <View>
        <SectionHeader>Notes & terms</SectionHeader>
        <FormCard>
          <PickerField
            label="Saved note"
            value={noteTemplateId}
            placeholder={notes.data?.length === 0 ? 'No saved notes yet' : 'Pick a saved note…'}
            options={(notes.data ?? []).map((t) => ({ value: t.id, label: templateTitle(t) }))}
            onChange={(id) => {
              setNoteTemplateId(id);
              onChange({ notes: notes.data?.find((t) => t.id === id)?.content ?? '' });
            }}
          />
          <Field label="Notes" value={value.notes} onChangeText={(n) => onChange({ notes: n })} placeholder="Add a note for the customer" multiline maxLength={2000} autoCapitalize="sentences" />
          <PickerField
            label="Saved terms"
            value={termTemplateId}
            placeholder={terms.data?.length === 0 ? 'No saved terms yet' : 'Pick saved terms…'}
            options={(terms.data ?? []).map((t) => ({ value: t.id, label: templateTitle(t) }))}
            onChange={(id) => {
              setTermTemplateId(id);
              const found = terms.data?.find((t) => t.id === id);
              onChange({ terms: found?.termsAndConditions || found?.content || '' });
            }}
          />
          <Field label="Terms & Conditions" value={value.terms} onChangeText={(t) => onChange({ terms: t })} placeholder="Your terms and conditions" multiline maxLength={4000} autoCapitalize="sentences" />
        </FormCard>
      </View>

      {/* The Summary goes after Notes & terms. */}
      {footer}

      <CustomerSheet
        visible={customerSheet}
        selectedId={party?.id}
        onPick={(p) => void pickCustomer(p)}
        // The full-screen form opens once the sheet has closed (a phone can't show two at once).
        onNew={canCreateParty ? () => setTimeout(() => setQuick({}), 400) : undefined}
        onClose={() => setCustomerSheet(false)}
      />

      <FullScreenModal visible={quick !== null} onClose={() => setQuick(null)}>
        {quick ? (
          <PartyForm
            key={quick.id ?? 'new'}
            id={quick.id}
            lockKind={PARTY_TYPE.CUSTOMER}
            back="Quotation"
            onCancel={() => setQuick(null)}
            onDone={(saved) => {
              void queryClient.invalidateQueries({ queryKey: ['quotation-customers'] });
              setQuick(null);
              // A new customer is chosen for the Quotation; an edited one is read again, keeping the places picked.
              if (quick.id) void getParty(saved.id).then((full) => onChange({ party: full })).catch(() => undefined);
              else void pickCustomer(saved);
            }}
          />
        ) : null}
      </FullScreenModal>
    </>
  );
}

/** An address shown as a plain box (the customer has only its registered one, or none is chosen yet). */
function ReadOnlyBox({ label, text, empty }: { label: string; text: string; empty?: boolean }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, { backgroundColor: colors.background }]}>
        <Text style={[styles.value, { flex: 1 }, empty && { color: colors.placeholder }]} numberOfLines={3}>{text}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    box: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    value: { ...type.body, color: c.ink },
    sub: { ...type.footnote, color: c.muted },
    error: { ...type.footnote },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
    toggleText: { ...type.subhead, fontWeight: '600', color: c.ink },
  });
