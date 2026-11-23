import { Ionicons } from '@expo/vector-icons';
import { PARTY_TYPE } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PO_STATUS } from 'floman-shared/statuses';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { DateField } from '@/components/DateField';
import { DocumentSheet, type DocumentChoice } from '@/components/DocumentSheet';
import { Field } from '@/components/Field';
import { FoldCard, type Folds } from '@/components/FoldCard';
import { FormCard, OptionPills, ReadOnlyField, SectionHeader } from '@/components/FormParts';
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
import { listPurchaseOrders } from '@/features/purchase-orders/api';
import { statusLabel as poStatusLabel } from '@/features/purchase-orders/text';
import { listReceivablePurchases } from '@/features/purchases/api';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import { RECEIVE_AGAINST, type GrnHeader, type HeaderErrors, type ReceiveAgainst } from '../form';

/** Only orders goods can be received against: approved, partly or fully received. */
const RECEIVABLE_PO = [PO_STATUS.APPROVED, PO_STATUS.PARTIALLY_RECEIVED, PO_STATUS.RECEIVED].join(',');

const AGAINST_OPTIONS: { value: ReceiveAgainst; label: string }[] = [
  { value: RECEIVE_AGAINST.PO, label: 'Purchase Order / Direct' },
  { value: RECEIVE_AGAINST.PURCHASE, label: 'Purchase' },
];

const statusWords = (status?: string | null) => (status ? status.charAt(0) + status.slice(1).replace(/_/g, ' ').toLowerCase() : '');

/**
 * The top of the GRN form, as the web's Vendor & bill, Project details and Notes & terms: the vendor and where goods
 * come from, our own places, what the goods are received against (a Purchase Order, none, or a Purchase), the vendor's
 * bill (number, date, photo), the day they came in, the custom fields, and the notes and terms. `onChange` takes the
 * changed fields only. The items and the TDS / TCS card go in `children`, the Summary in `footer`.
 */
export function HeaderSection({ value, onChange, errors, children, footer, vendorLock, billingLocked, sourceLocked, billOptional, billClash, onBillBlur, bill, onPickOrder, onPickPurchase, onChangeAgainst, loadingSource, folds, itemsSummary, taxCard, taxSummary }: {
  value: GrnHeader; onChange: (patch: Partial<GrnHeader>) => void; errors: HeaderErrors; children?: ReactNode; footer?: ReactNode;
  /** Which sections are open; the Items' one-line summary while they are folded. */
  folds: Folds; itemsSummary: string;
  /** The TDS / TCS card: a folding section of its own after the Items, with its one-line summary. */
  taxCard?: ReactNode;
  taxSummary?: string;
  /** Why the vendor can't be changed (it comes from a Purchase, or the GRN was approved); none = it can. */
  vendorLock?: string | null;
  /** Bill to is fixed once the GRN has its number (the number is that place's series). */
  billingLocked?: boolean;
  /** A saved GRN stays against what it was made from. */
  sourceLocked?: boolean;
  /** A vendor with no GSTIN (cash purchase): the source and the bill are optional. */
  billOptional?: boolean;
  /** The server's message when the vendor's bill number is already on another Purchase or GRN. */
  billClash?: string | null;
  /** The bill number or date was left: the screen checks it with the server. */
  onBillBlur: () => void;
  bill: BillAttachmentState;
  /** An order picked (or cleared with null): the screen reads it and fills the form from it. */
  onPickOrder: (id: string | null) => void;
  onPickPurchase: (id: string) => void;
  /** The other choice of what the goods are received against: the screen clears what the first filled in. */
  onChangeAgainst: (target: ReceiveAgainst) => void;
  loadingSource?: boolean;
}) {
  const hide = useHide();
  const colors = useColors();
  const styles = useThemed(makeStyles);
  const { can } = useSession();
  const { party } = value;
  const { fields: customFields } = useCustomFieldDefs(DOCUMENT_TYPE.GRN);
  // As the web: an Admin (all permissions) lists vendors and customers, everyone else only vendors.
  const listType = can(PERMISSIONS.ALL) ? undefined : PARTY_TYPE.VENDOR;
  const [orderSheet, setOrderSheet] = useState(false);
  const [purchaseSheet, setPurchaseSheet] = useState(false);

  // ── Where goods come from: the vendor's billing and dispatch places ──
  const billOthers = billingAddresses(party);
  const dispatchList = deliveryAddresses(party);
  const billOptions = [{ value: '', label: `Registered: ${(party?.billToAddress ?? '').slice(0, 40)}` }, ...billOthers.map((a) => ({ value: a.id, label: placeChoice(a) }))];
  const dispatchOptions = [
    { value: PRIMARY, label: `Primary: ${party?.shipToAddress ? `${party.shipToAddress.slice(0, 32)}…` : 'Registered shipping'}` },
    ...dispatchList.map((a) => ({ value: a.id, label: `${placeChoice(a)}${a.isDefault ? ' (Default)' : ''}` })),
  ];

  const fetchOrders = async (search: string): Promise<DocumentChoice[]> => {
    const { rows } = await listPurchaseOrders(1, 50, { search: search || undefined, status: RECEIVABLE_PO });
    return rows.map((po) => ({ id: po.id, title: po.poNumber, subtitle: [po.vendor?.name, po.orderDate && formatDate(po.orderDate)].filter(Boolean).join(' · '), right: poStatusLabel(po.status) }));
  };
  const fetchPurchases = async (search: string): Promise<DocumentChoice[]> => {
    const rows = await listReceivablePurchases(search);
    return rows.map((p) => ({ id: p.id, title: p.purchaseNumber, subtitle: [p.vendor?.name, p.vendorBillNumber && `Bill ${p.vendorBillNumber}`].filter(Boolean).join(' · '), right: statusWords(p.status) }));
  };

  const against = value.receiveAgainst;

  // The web's order: (number and series, in the title), our places, Vendor & bill, Items, Notes & terms.
  return (
    <>
      <OurPlacesCard side="purchase" billingLocationId={value.billingLocationId} shippingLocationId={value.shippingLocationId} billingLocked={billingLocked} onChange={onChange} />
      <FoldCard title="Vendor & bill" summary={[party && hide.text(party.name), value.billNumber && `Bill ${value.billNumber}`, value.receivedDate && formatDate(value.receivedDate)].filter(Boolean).join(' · ') || 'Not filled in yet'} open={folds.open.vendor} onToggle={() => folds.toggle('vendor')}>
          <PartyField
            label="Vendor"
            kind={PARTY_TYPE.VENDOR}
            back="GRN"
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

          {/* What the goods are received against */}
          <ScrollAnchor name="against">
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.label}>Receive against{billOptional ? '' : <Text style={{ color: colors.danger }}> *</Text>}</Text>
              <View pointerEvents={sourceLocked ? 'none' : 'auto'} style={sourceLocked ? { opacity: 0.6 } : undefined}>
                <OptionPills label="Receive against" value={against ?? ''} options={AGAINST_OPTIONS} onChange={onChangeAgainst} />
              </View>
              {errors.against ? <Text style={[styles.error, { color: colors.danger }]}>{errors.against}</Text> : null}
            </View>
          </ScrollAnchor>

          {against === RECEIVE_AGAINST.PURCHASE ? (
            <>
              <ScrollAnchor name="purchase">
                <SourceBox
                  label="Purchase"
                  required
                  text={value.purchase?.number ?? null}
                  placeholder="Choose a Purchase"
                  error={errors.purchase}
                  disabled={sourceLocked}
                  loading={loadingSource}
                  onPress={() => setPurchaseSheet(true)}
                />
              </ScrollAnchor>
              <ReadOnlyField label="Purchase date" text={value.purchase?.date ? formatDate(value.purchase.date) : 'Fills in after you pick a purchase'} empty={!value.purchase?.date} />
              <ReadOnlyField label="Purchase status" text={value.purchase?.status ? statusWords(value.purchase.status) : 'Select a Purchase'} empty={!value.purchase} />
            </>
          ) : against === RECEIVE_AGAINST.PO ? (
            <>
              <SourceBox
                label="Originating Purchase Order"
                text={value.purchaseOrder?.number ?? null}
                placeholder="None / Direct Inward Receipt (No PO Linkage)"
                disabled={sourceLocked}
                loading={loadingSource}
                onClear={value.purchaseOrder && !sourceLocked ? () => onPickOrder(null) : undefined}
                onPress={() => setOrderSheet(true)}
              />
              <ReadOnlyField label="PO date" text={value.purchaseOrder?.date ? formatDate(value.purchaseOrder.date) : 'Fills in after you pick a PO'} empty={!value.purchaseOrder?.date} />
              <ReadOnlyField label="PO status" text={value.purchaseOrder ? statusWords(value.purchaseOrder.status || 'LINKED') : 'Direct Inward (No PO)'} empty={!value.purchaseOrder} />
            </>
          ) : null}

          <ScrollAnchor name="billNumber">
            <Field
              label="Vendor bill no."
              required={!billOptional && !value.purchase}
              value={value.billNumber}
              onChangeText={(billNumber) => onChange({ billNumber })}
              onBlur={onBillBlur}
              placeholder="As printed on the bill"
              editable={!value.purchase}
              error={errors.billNumber ?? (value.purchase ? undefined : billClash ?? undefined)}
              autoCapitalize="characters"
            />
          </ScrollAnchor>
          <ScrollAnchor name="billDate">
            {value.purchase ? (
              <ReadOnlyField label="Bill date" text={value.billDate ? formatDate(value.billDate) : '—'} empty={!value.billDate} />
            ) : (
              <DateField label="Bill date" required={!billOptional} value={value.billDate} onChange={(billDate) => { onChange({ billDate }); }} onClear={() => onChange({ billDate: '' })} error={errors.billDate} />
            )}
          </ScrollAnchor>
          <ScrollAnchor name="receivedDate">
            <DateField label="Inward / Received date" required value={value.receivedDate} onChange={(receivedDate) => onChange({ receivedDate })} error={errors.receivedDate} />
          </ScrollAnchor>

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
        documentType={DOCUMENT_TYPE.GRN}
        notes={value.notes}
        terms={value.terms}
        notesPlaceholder="Enter any notes about this inward receipt"
        termsPlaceholder="Enter your business Terms and Conditions"
        onChange={onChange}
      />

      {/* The Summary goes after Notes & terms. */}
      {footer}

      <DocumentSheet
        visible={orderSheet}
        title="Purchase Order"
        queryKey="grn-source-orders"
        fetchChoices={fetchOrders}
        selectedId={value.purchaseOrder?.id}
        searchPlaceholder="Search PO number, vendor…"
        noneLabel="None / Direct Inward Receipt (No PO Linkage)"
        emptyText="No Purchase Orders found."
        onPick={(choice) => onPickOrder(choice?.id ?? null)}
        onClose={() => setOrderSheet(false)}
      />
      <DocumentSheet
        visible={purchaseSheet}
        title="Purchase"
        queryKey="grn-source-purchases"
        fetchChoices={fetchPurchases}
        selectedId={value.purchase?.id}
        searchPlaceholder="Search purchase number, vendor, bill…"
        emptyText="No Purchases to receive against."
        onPick={(choice) => choice && onPickPurchase(choice.id)}
        onClose={() => setPurchaseSheet(false)}
      />
    </>
  );
}

/** The box that opens the source list: the number picked (with a clear cross), or the placeholder. */
function SourceBox({ label, text, placeholder, required, error, disabled, loading, onClear, onPress }: {
  label: string; text: string | null; placeholder: string; required?: boolean; error?: string | null; disabled?: boolean; loading?: boolean; onClear?: () => void; onPress: () => void;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>
        {label}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${text ?? 'not chosen'}`}
        style={({ pressed }) => [styles.box, error ? { borderColor: colors.danger } : null, disabled && { opacity: 0.6 }, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.boxText, !text && { color: colors.placeholder, fontWeight: '400' }]} numberOfLines={1}>{text ?? placeholder}</Text>
        {onClear ? (
          <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
            <Ionicons name="close-circle" size={22} color={colors.muted} />
          </Pressable>
        ) : null}
        <Ionicons name={loading ? 'hourglass-outline' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    error: { ...type.footnote },
    box: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    boxText: { ...type.body, flex: 1, color: c.ink, fontWeight: '600' },
  });
