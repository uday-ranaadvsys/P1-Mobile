import { PARTY_TYPE } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { SUPPLY_TYPE, SUPPLY_TYPE_LABEL } from 'floman-shared/gst';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DateField } from '@/components/DateField';
import { ScrollAnchor } from '@/components/FormScroll';
import { Field } from '@/components/Field';
import { FoldCard, type Folds } from '@/components/FoldCard';
import { FormCard, ReadOnlyField, SectionHeader } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { CustomFieldsForm } from '@/features/documents/components/CustomFieldsForm';
import { NotesTermsSection } from '@/features/documents/components/NotesTermsSection';
import { OurPlacesCard } from '@/features/documents/components/OurPlacesCard';
import { ProjectFields } from '@/features/documents/components/ProjectFields';
import { useCustomFieldDefs } from '@/features/documents/useCustomFieldDefs';
import { PartyField } from '@/features/parties/components/PartyField';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { billingAddresses, defaultShipToId, deliveryAddresses, PRIMARY, placeChoice, validForDays, type HeaderErrors, type QuotationHeader } from '../form';

/** In the order the forms offer them. */
const SUPPLY_OPTIONS = [SUPPLY_TYPE.B2B, SUPPLY_TYPE.SEZWOP, SUPPLY_TYPE.SEZWP].map((value) => ({ value, label: SUPPLY_TYPE_LABEL[value] }));

/**
 * The top of the Quotation form, as the web's Customer & dates, Project details and Notes & terms:
 * the customer and where it is billed and shipped, our own places, the dates, the supply type, the custom fields, and
 * the notes and terms. `onChange` takes the changed fields only.
 */
export function HeaderSection({ value, onChange, errors, children, footer, customerLock, billingLocked, folds, itemsSummary, taxCard, taxSummary }: {
  value: QuotationHeader; onChange: (patch: Partial<QuotationHeader>) => void; errors: HeaderErrors; children?: ReactNode; footer?: ReactNode;
  /** Which sections are open; the Items' one-line summary while they are folded. */
  folds: Folds; itemsSummary: string;
  /** The TDS / TCS card: a folding section of its own after the Items, with its one-line summary. */
  taxCard?: ReactNode;
  taxSummary?: string;
  /** Why the customer can't be changed (documents were made from this Quotation); none = it can. */
  customerLock?: string | null;
  /** Bill from is fixed once the Quotation has its number (the number is that place's series). */
  billingLocked?: boolean;
}) {
  const hide = useHide();
  const { party } = value;
  const { fields: customFields } = useCustomFieldDefs(DOCUMENT_TYPE.QUOTATION);

  // ── Where it is billed and shipped ──
  const billOthers = billingAddresses(party);
  const shipList = deliveryAddresses(party);
  const billOptions = [{ value: '', label: `Registered: ${(party?.billToAddress ?? '').slice(0, 40)}` }, ...billOthers.map((a) => ({ value: a.id, label: placeChoice(a) }))];
  const shipOptions = [
    { value: PRIMARY, label: `Primary: ${party?.shipToAddress ? `${party.shipToAddress.slice(0, 32)}…` : 'Registered Shipping'}` },
    ...shipList.map((a) => ({ value: a.id, label: `${placeChoice(a)}${a.isDefault ? ' ⭐' : ''}` })),
  ];
  const days = validForDays(value);

  // The web's order: (number and series, in the title), our places, Customer & dates, (the items), Notes & terms.
  return (
    <>
      <OurPlacesCard side="sales" billingLocationId={value.billingLocationId} shippingLocationId={value.shippingLocationId} billingLocked={billingLocked} onChange={onChange} />
      <FoldCard title="Customer & dates" summary={[party && hide.text(party.name), value.issueDate && formatDate(value.issueDate)].filter(Boolean).join(' · ') || 'Not filled in yet'} open={folds.open.vendor} onToggle={() => folds.toggle('vendor')}>
          <PartyField
            label="Customer"
            kind={PARTY_TYPE.CUSTOMER}
            back="Quotation"
            party={party}
            error={errors.party}
            lock={customerLock}
            // A customer: its places come with it, and it starts from its own supply type and delivery address.
            onPick={(full) => onChange({ party: full, supplyType: full.supplyType || SUPPLY_TYPE.B2B, billingAddressId: '', shipToId: defaultShipToId(full) })}
            onRefresh={(full) => onChange({ party: full })}
          />

          {party ? (
            billOthers.length > 0 ? (
              <PickerField label="Bill to" value={value.billingAddressId} options={billOptions} onChange={(billingAddressId) => onChange({ billingAddressId })} />
            ) : (
              <ReadOnlyField label="Bill to" text={hide.text(party.billToAddress)} />
            )
          ) : (
            <ReadOnlyField label="Bill to" text="Fills in after you pick a customer" empty />
          )}

          {party ? (
            shipList.length > 0 ? (
              <PickerField label="Ship to" value={value.shipToId} options={shipOptions} onChange={(shipToId) => onChange({ shipToId })} />
            ) : (
              <ReadOnlyField label="Ship to" text={hide.text(party.shipToAddress || party.billToAddress)} />
            )
          ) : (
            <ReadOnlyField label="Ship to" text="Fills in after you pick a customer" empty />
          )}

          <ScrollAnchor name="issueDate"><DateField label="Issue date" required value={value.issueDate} onChange={(issueDate) => onChange({ issueDate })} error={errors.issueDate} /></ScrollAnchor>
          <ScrollAnchor name="validityDate"><DateField
            label={days !== null ? `Valid until · ${days === 1 ? '1 day' : `${days} days`}` : 'Valid until'}
            required
            value={value.validityDate}
            onChange={(validityDate) => onChange({ validityDate })}
            error={errors.validityDate}
          /></ScrollAnchor>
          <Field label="Reference" value={value.reference} onChangeText={(reference) => onChange({ reference })} placeholder="e.g. REF-2026-001" maxLength={100} />
          <PickerField label="Supply type" value={value.supplyType} options={SUPPLY_OPTIONS} onChange={(supplyType) => onChange({ supplyType })} />

          <ProjectFields value={value} onChange={onChange} />

          <CustomFieldsForm fields={customFields} values={value.customFields} onChange={(key, v) => onChange({ customFields: { ...value.customFields, [key]: v } })} errors={errors.custom} />
      </FoldCard>

      {/* The Items and the TDS / TCS card go here, between Customer & dates and Notes & terms, as on the web. */}
      <FoldCard title="Items" summary={itemsSummary} open={folds.open.items} onToggle={() => folds.toggle('items')}>
        {children}
      </FoldCard>
      {taxCard ? (
        <FoldCard title="TDS / TCS" summary={taxSummary} open={folds.open.tax} onToggle={() => folds.toggle('tax')}>
          {taxCard}
        </FoldCard>
      ) : null}

      <NotesTermsSection
        fold={{ open: folds.open.notes, onToggle: () => folds.toggle('notes') }}
        documentType={DOCUMENT_TYPE.QUOTATION}
        notes={value.notes}
        terms={value.terms}
        notesPlaceholder="Add a note for the customer"
        termsPlaceholder="Your terms and conditions"
        onChange={onChange}
      />

      {/* The Summary goes after Notes & terms. */}
      {footer}
    </>
  );
}
