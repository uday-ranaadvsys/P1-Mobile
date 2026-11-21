import { FormCard } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { useCompanyLocations } from '../useCompanyLocations';

/**
 * Our places on a document (the web's OurPlacesPicker): the location it is billed from / to (its numbering series
 * follows it) and the one goods leave from / arrive at. Shown only once the company has locations besides its
 * registered address. `side`: sales (Bill from / Dispatch from) or purchase (Bill to / Deliver to). Changing the first
 * moves the second along while it was the same place. `billingLocked`: fixed once the document has its number.
 */
export function OurPlacesCard({ side, billingLocationId, shippingLocationId, billingLocked, onChange }: {
  side: 'sales' | 'purchase'; billingLocationId: string; shippingLocationId: string; billingLocked?: boolean;
  onChange: (patch: { billingLocationId?: string; shippingLocationId?: string }) => void;
}) {
  const locations = useCompanyLocations();
  if (locations.length === 0) return null;
  const labels = side === 'sales' ? { billing: 'Bill from', shipping: 'Dispatch from' } : { billing: 'Bill to', shipping: 'Deliver to' };
  const options = [{ value: '', label: 'Registered address' }, ...locations.map((l) => ({ value: l.id, label: l.name }))];
  return (
    <FormCard>
      <PickerField
        label={labels.billing}
        value={billingLocationId}
        options={options}
        disabled={billingLocked}
        onChange={(next) => onChange({ billingLocationId: next, shippingLocationId: shippingLocationId === billingLocationId ? next : shippingLocationId })}
      />
      <PickerField label={labels.shipping} value={shippingLocationId} options={options} onChange={(next) => onChange({ shippingLocationId: next })} />
    </FormCard>
  );
}
