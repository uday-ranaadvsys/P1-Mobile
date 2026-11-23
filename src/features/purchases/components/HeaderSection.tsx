import { PARTY_TYPE } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { PERMISSIONS } from 'floman-shared/permissions';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DateField } from '@/components/DateField';
import { Field } from '@/components/Field';
import { FoldCard, type Folds } from '@/components/FoldCard';
import { FormCard, ReadOnlyField, SectionHeader } from '@/components/FormParts';
import { ScrollAnchor } from '@/components/FormScroll';
import { PickerField } from '@/components/PickerField';
import { useSession } from '@/features/auth/session';
import { BillAttachment } from '@/features/documents/components/BillAttachment';
import { CustomFieldsForm } from '@/features/documents/components/CustomFieldsForm';
import { NotesTermsSection } from '@/features/documents/components/NotesTermsSection';
import { OurPlacesCard } from '@/features/documents/components/OurPlacesCard';
import { ProjectFields } from '@/features/documents/components/ProjectFields';
import type { BillAttachmentState } from '@/features/documents/useBillAttachment';
import { useCustomFieldDefs } from '@/features/documents/useCustomFieldDefs';
import { PartyField } from '@/features/parties/components/PartyField';
import { billingAddresses, defaultShipToId, deliveryAddresses, PRIMARY, placeChoice } from '@/features/parties/places';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import type { HeaderErrors, PurchaseHeader } from '../form';

/**
 * The top of the Purchase form, as the web's Vendor & bill, Project details and Notes & terms: the vendor and where
 * goods come from, our own places, the Purchase date, the vendor's bill (number, date, photo), the payment terms, the
 * custom fields, and the notes and terms. `onChange` takes the changed fields only. The items and the TDS / TCS card go
 * in `children`, the Summary in `footer`.
 */
export function HeaderSection({ value, onChange, errors, children, footer, vendorLock, billingLocked, billOptional, billClash, onBillBlur, bill, folds, itemsSummary, taxCard, taxSummary }: {
  value: PurchaseHeader; onChange: (patch: Partial<PurchaseHeader>) => void; errors: HeaderErrors; children?: ReactNode; footer?: ReactNode;
  /** Which sections are open; the Items' one-line summary while they are folded. */
  folds: Folds; itemsSummary: string;
  /** The TDS / TCS card: a folding section of its own after the Items, with its one-line summary. */
  taxCard?: ReactNode;
  taxSummary?: string;
  /** Why the vendor can't be changed (a GRN was made from the Purchase); none = it can. */
  vendorLock?: string | null;
  /** Bill to is fixed once the Purchase has its number (the number is that place's series). */
  billingLocked?: boolean;
  /** A vendor with no GSTIN (cash purchase): the bill number and date are optional. */
  billOptional?: boolean;
  /** The server's message when the vendor's bill number is already on another Purchase or GRN. */
  billClash?: string | null;
  /** The bill number was left: the screen checks it with the server. */
  onBillBlur: () => void;
  bill: BillAttachmentState;
}) {
  const hide = useHide();
  const { can } = useSession();
  const { party } = value;
  const { fields: customFields } = useCustomFieldDefs(DOCUMENT_TYPE.PURCHASE);
  // As the web: an Admin (all permissions) lists vendors and customers, everyone else only vendors.
  const listType = can(PERMISSIONS.ALL) ? undefined : PARTY_TYPE.VENDOR;

  // ── Where goods come from: the vendor's billing and dispatch places ──
  const billOthers = billingAddresses(party);
  const dispatchList = deliveryAddresses(party);
  const billOptions = [{ value: '', label: `Registered: ${(party?.billToAddress ?? '').slice(0, 40)}` }, ...billOthers.map((a) => ({ value: a.id, label: placeChoice(a) }))];
  const dispatchOptions = [
    { value: PRIMARY, label: `Primary: ${party?.shipToAddress ? `${party.shipToAddress.slice(0, 32)}…` : 'Registered shipping'}` },
    ...dispatchList.map((a) => ({ value: a.id, label: `${placeChoice(a)}${a.isDefault ? ' (Default)' : ''}` })),
  ];

  // The web's order: (number and series, in the title), our places, Vendor & bill, Items, Notes & terms.
  return (
    <>
      <OurPlacesCard side="purchase" billingLocationId={value.billingLocationId} shippingLocationId={value.shippingLocationId} billingLocked={billingLocked} onChange={onChange} />
      <FoldCard title="Vendor & bill" summary={[party && hide.text(party.name), value.billNumber && `Bill ${value.billNumber}`, value.purchaseDate && formatDate(value.purchaseDate)].filter(Boolean).join(' · ') || 'Not filled in yet'} open={folds.open.vendor} onToggle={() => folds.toggle('vendor')}>
          <PartyField
            label="Vendor"
            kind={PARTY_TYPE.VENDOR}
            back="Purchase"
            party={party}
            error={errors.party}
            lock={vendorLock}
            listType={listType}
            // A vendor: its places come with it, starting at its registered billing address and default dispatch address.
            onPick={(full) => onChange({ party: full, billingAddressId: '', dispatchFromId: defaultShipToId(full) })}
            onRefresh={(full) => onChange({ party: full })}
          />

          {party ? (
            billOthers.length > 0 ? (
              <PickerField label="Bill from" value={value.billingAddressId} options={billOptions} onChange={(billingAddressId) => onChange({ billingAddressId })} />
            ) : (
              <ReadOnlyField label="Bill from" text={hide.text(party.billToAddress)} />
            )
          ) : (
            <ReadOnlyField label="Bill from" text="Fills in after you pick a vendor" empty />
          )}

          {party ? (
            dispatchList.length > 0 ? (
              <PickerField label="Dispatch from" value={value.dispatchFromId} options={dispatchOptions} onChange={(dispatchFromId) => onChange({ dispatchFromId })} />
            ) : (
              <ReadOnlyField label="Dispatch from" text={hide.text(party.shipToAddress || party.billToAddress)} />
            )
          ) : (
            <ReadOnlyField label="Dispatch from" text="Fills in after you pick a vendor" empty />
          )}

          <ScrollAnchor name="purchaseDate">
            <DateField label="Purchase date" required value={value.purchaseDate} onChange={(purchaseDate) => onChange({ purchaseDate })} error={errors.purchaseDate} />
          </ScrollAnchor>
          <ScrollAnchor name="billNumber">
            <Field
              label="Vendor bill no."
              required={!billOptional}
              value={value.billNumber}
              onChangeText={(billNumber) => onChange({ billNumber })}
              onBlur={onBillBlur}
              placeholder="As printed on the bill"
              error={errors.billNumber ?? billClash ?? undefined}
              autoCapitalize="characters"
            />
          </ScrollAnchor>
          <ScrollAnchor name="billDate">
            <DateField label="Bill date" required={!billOptional} value={value.billDate} onChange={(billDate) => onChange({ billDate })} onClear={() => onChange({ billDate: '' })} error={errors.billDate} />
          </ScrollAnchor>
          <Field label="Payment terms" value={value.paymentTerms} onChangeText={(paymentTerms) => onChange({ paymentTerms })} placeholder="e.g. Net 30 Days, 50% Advance" maxLength={255} autoCapitalize="sentences" />

          {/* The vendor's scanned bill: a photo from the camera or the gallery */}
          <BillAttachment attachment={bill} />

          <ProjectFields value={value} onChange={onChange} />

          <CustomFieldsForm fields={customFields} values={value.customFields} onChange={(key, v) => onChange({ customFields: { ...value.customFields, [key]: v } })} errors={errors.custom} />
      </FoldCard>

      {/* The Items and the TDS / TCS card go here, between Vendor & bill and Notes & terms, as on the web. */}
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
        documentType={DOCUMENT_TYPE.PURCHASE}
        notes={value.notes}
        terms={value.terms}
        notesPlaceholder="Enter any notes about this purchase"
        termsPlaceholder="Enter your business Terms and Conditions"
        onChange={onChange}
      />

      {/* The Summary goes after Notes & terms. */}
      {footer}
    </>
  );
}
