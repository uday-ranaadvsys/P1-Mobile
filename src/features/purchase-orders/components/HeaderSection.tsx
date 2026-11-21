import { PARTY_TYPE } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { PERMISSIONS } from 'floman-shared/permissions';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DateField } from '@/components/DateField';
import { ScrollAnchor } from '@/components/FormScroll';
import { Field } from '@/components/Field';
import { FormCard, ReadOnlyField, SectionHeader } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { useSession } from '@/features/auth/session';
import { CustomFieldsForm } from '@/features/documents/components/CustomFieldsForm';
import { NotesTermsSection } from '@/features/documents/components/NotesTermsSection';
import { OurPlacesCard } from '@/features/documents/components/OurPlacesCard';
import { ProjectFields } from '@/features/documents/components/ProjectFields';
import { useCustomFieldDefs } from '@/features/documents/useCustomFieldDefs';
import { PartyField } from '@/features/parties/components/PartyField';
import { billingAddresses, defaultShipToId, deliveryAddresses, PRIMARY, placeChoice } from '@/features/parties/places';
import { useHide } from '@/lib/privacy';
import { dueInDays, dueText, type HeaderErrors, type PurchaseOrderHeader } from '../form';

/**
 * The top of the Purchase Order form, as the web's Vendor & dates, Project details and Notes & terms: the vendor and
 * where goods come from, our own places, the dates, the vendor's quote, the payment terms, the custom fields, and the
 * notes and terms. `onChange` takes the changed fields only. The items and the TDS / TCS card go in `children`, the
 * Summary in `footer`.
 */
export function HeaderSection({ value, onChange, errors, children, footer, vendorLock, billingLocked }: {
  value: PurchaseOrderHeader; onChange: (patch: Partial<PurchaseOrderHeader>) => void; errors: HeaderErrors; children?: ReactNode; footer?: ReactNode;
  /** Why the vendor can't be changed (a GRN was made from the order, or it came from a Purchase Indent); none = it can. */
  vendorLock?: string | null;
  /** Bill to is fixed once the order has its number (the number is that place's series). */
  billingLocked?: boolean;
}) {
  const hide = useHide();
  const { can } = useSession();
  const { party } = value;
  const { fields: customFields } = useCustomFieldDefs(DOCUMENT_TYPE.PURCHASE_ORDER);
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
  const days = dueInDays(value);

  // The web's order: (number and series, in the title), our places, Vendor & dates, (the items), Notes & terms.
  return (
    <>
      <OurPlacesCard side="purchase" billingLocationId={value.billingLocationId} shippingLocationId={value.shippingLocationId} billingLocked={billingLocked} onChange={onChange} />
      <View>
        <SectionHeader>Vendor & dates</SectionHeader>
        <FormCard>
          <PartyField
            label="Vendor"
            kind={PARTY_TYPE.VENDOR}
            back="Purchase Order"
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

          <ScrollAnchor name="orderDate"><DateField label="Order date" required value={value.orderDate} onChange={(orderDate) => onChange({ orderDate })} error={errors.orderDate} /></ScrollAnchor>
          <DateField
            label={days !== null ? `Delivery due · ${dueText(days)}` : 'Delivery due'}
            value={value.deliveryDueDate}
            onChange={(deliveryDueDate) => onChange({ deliveryDueDate })}
            onClear={() => onChange({ deliveryDueDate: '' })}
          />
          <DateField label="Expected delivery" value={value.expectedDeliveryDate} onChange={(expectedDeliveryDate) => onChange({ expectedDeliveryDate })} onClear={() => onChange({ expectedDeliveryDate: '' })} />
          <Field label="Vendor quote" value={value.supplierQuote} onChangeText={(supplierQuote) => onChange({ supplierQuote })} placeholder="e.g. QUOTE-2026-889" />
          <Field label="Payment terms" required value={value.paymentTerms} onChangeText={(paymentTerms) => onChange({ paymentTerms })} placeholder="e.g. Net 30 Days" maxLength={255} autoCapitalize="sentences" />

          <ProjectFields value={value} onChange={onChange} />

          <CustomFieldsForm fields={customFields} values={value.customFields} onChange={(key, v) => onChange({ customFields: { ...value.customFields, [key]: v } })} errors={errors.custom} />
        </FormCard>
      </View>

      {/* The Items and the TDS / TCS card go here, between Vendor & dates and Notes & terms, as on the web. */}
      {children}

      <NotesTermsSection
        documentType={DOCUMENT_TYPE.PURCHASE_ORDER}
        notes={value.notes}
        terms={value.terms}
        notesPlaceholder="Enter production instructions or dispatch notes"
        termsPlaceholder="Enter your business Terms and Conditions"
        onChange={onChange}
      />

      {/* The Summary goes after Notes & terms. */}
      {footer}
    </>
  );
}
