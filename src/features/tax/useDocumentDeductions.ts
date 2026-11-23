import { useQuery } from '@tanstack/react-query';
import { DEDUCTION_KIND, DEDUCTION_KIND_LABEL, DEDUCTION_SIDE, DEDUCTION_TEXT, THRESHOLD_KIND, type DeductionKind, type DeductionSide } from 'floman-shared/constants';
import { DEDUCTION_COLUMNS, type DeductionPicks, type DeductionSection, type PartyHistory } from 'floman-shared/taxDeduction';
import { useCallback, useMemo, useState } from 'react';
import { api } from '@/api/client';

const NONE: Record<DeductionKind, string | null> = { TCS: null, GST_TDS: null, TDS: null };
const OFF: Record<DeductionKind, boolean> = { TCS: false, GST_TDS: false, TDS: false };

/** What the form sends for each box (shared/taxDeduction.ts DEDUCTION_COLUMNS). */
const PAYLOAD_FIELD: Record<DeductionKind, string> = {
  TCS: DEDUCTION_COLUMNS.TCS.sectionId,
  GST_TDS: DEDUCTION_COLUMNS.GST_TDS.sectionId,
  TDS: DEDUCTION_COLUMNS.TDS.sectionId,
};

/** The fixed section list, the same for every document: fetched once. */
const useSections = () => useQuery({ queryKey: ['tax-sections'], queryFn: () => api<DeductionSection[]>('/tax-sections'), staleTime: Infinity });

/**
 * The TDS / TCS boxes of a document form (the web's hooks/useDocumentDeductions.ts): which are ticked, the section
 * picked in each, and the party's bills this year when a limit needs them. The form works the figures out with
 * floman-shared/taxDeduction (the server's own calculation) and sends only `payload()`: the sections picked.
 * `kinds`: the boxes this document has (a Quotation, Proforma and Sales Order: TCS only).
 */
export function useDocumentDeductions(options: { kinds: readonly DeductionKind[]; vendorId?: string | null; date?: string | null; excludeId?: string | null; side?: DeductionSide; typedTcs?: boolean }) {
  const { kinds, vendorId, date, excludeId, side = DEDUCTION_SIDE.SALES, typedTcs = false } = options;
  const sectionsQuery = useSections();
  const sections = useMemo(() => sectionsQuery.data ?? [], [sectionsQuery.data]);
  const [ticked, setTicked] = useState(OFF);
  const [sectionIds, setSectionIds] = useState(NONE);
  const [includeEarlierTds, setIncludeEarlierTds] = useState(false);
  // A GRN's TCS as typed from the vendor's bill (null: worked out).
  const [tcsTyped, setTcsTyped] = useState<number | null>(null);

  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const sectionsFor = useCallback((kind: DeductionKind) => sections.filter((s) => s.kind === kind && (s.isActive || s.id === sectionIds[kind])), [sections, sectionIds]);

  /** Ticks a box or unticks it (its section is dropped). TDS and TCS untick each other. */
  const toggle = useCallback((kind: DeductionKind, on: boolean) => {
    setTicked((prev) => ({ ...prev, [kind]: on, ...(on && kind === DEDUCTION_KIND.TDS && { TCS: false }), ...(on && kind === DEDUCTION_KIND.TCS && { TDS: false }) }));
    setSectionIds((prev) => ({ ...prev, ...(!on && { [kind]: null }), ...(on && kind === DEDUCTION_KIND.TDS && { TCS: null }), ...(on && kind === DEDUCTION_KIND.TCS && { TDS: null }) }));
    if (kind === DEDUCTION_KIND.TDS || (on && kind === DEDUCTION_KIND.TCS)) setIncludeEarlierTds(false);
    if (kind === DEDUCTION_KIND.TCS || (on && kind === DEDUCTION_KIND.TDS)) setTcsTyped(null);
  }, []);

  const pick = useCallback((kind: DeductionKind, sectionId: string | null) => {
    setSectionIds((prev) => ({ ...prev, [kind]: sectionId }));
    setTicked((prev) => ({ ...prev, [kind]: true }));
    if (kind === DEDUCTION_KIND.TDS) setIncludeEarlierTds(false);
    if (kind === DEDUCTION_KIND.TCS) setTcsTyped(null);
  }, []);

  /**
   * The boxes as a saved or source document has them (edit, duplicate, made from another). `ownTcs`: the document's own
   * saved TCS amount is kept as typed (editing a GRN); from a PO or Purchase it is worked out again.
   */
  const loadFrom = useCallback(
    (doc: Record<string, unknown> | null | undefined, ownTcs = false) => {
      const ids = { ...NONE };
      for (const kind of kinds) ids[kind] = (doc?.[PAYLOAD_FIELD[kind]] as string | null | undefined) || null;
      setSectionIds(ids);
      setTicked({ TCS: Boolean(ids.TCS), GST_TDS: Boolean(ids.GST_TDS), TDS: Boolean(ids.TDS) });
      setIncludeEarlierTds(Number(doc?.incomeTdsEarlierAmount) > 0);
      setTcsTyped(typedTcs && ownTcs && ids.TCS ? Number(doc?.tcsAmount) || 0 : null);
    },
    [kinds, typedTcs],
  );

  const picks: DeductionPicks = useMemo(() => {
    const out: DeductionPicks = {};
    for (const kind of kinds) {
      const section = sectionIds[kind] ? byId.get(sectionIds[kind]!) : undefined;
      if (ticked[kind] && section) out[kind] = { section, includeEarlier: kind === DEDUCTION_KIND.TDS && includeEarlierTds, amount: kind === DEDUCTION_KIND.TCS ? tcsTyped : null };
    }
    return out;
  }, [kinds, sectionIds, ticked, byId, includeEarlierTds, tcsTyped]);

  // The party's bills this year, only when a ticked section's limit needs them.
  const needsHistory = Object.values(picks).some((p) => p && p.section.thresholdKind !== THRESHOLD_KIND.NONE && p.section.thresholdKind !== THRESHOLD_KIND.PER_BILL);
  const historyQuery = useQuery({
    queryKey: ['tax-history', vendorId, date, side, excludeId],
    queryFn: () => api<PartyHistory | null>(`/tax-sections/history?vendorId=${vendorId}&date=${date}&side=${side}${excludeId ? `&excludeId=${excludeId}` : ''}`),
    enabled: needsHistory && Boolean(vendorId && date),
  });
  const history = needsHistory && vendorId && date ? historyQuery.data ?? null : null;

  /** A box ticked without a section: Save is refused with this message. */
  const missingPick = kinds.find((kind) => ticked[kind] && !sectionIds[kind]) ?? null;
  const missingMessage = missingPick ? DEDUCTION_TEXT.pickRequired(DEDUCTION_KIND_LABEL[missingPick]) : null;

  /** What the form sends: the section of each box this document has (null when unticked). */
  const payload = useCallback(() => {
    const out: Record<string, unknown> = {};
    for (const kind of kinds) out[PAYLOAD_FIELD[kind]] = ticked[kind] ? sectionIds[kind] : null;
    if (kinds.includes(DEDUCTION_KIND.TDS)) out.includeEarlierTds = Boolean(ticked.TDS && includeEarlierTds);
    if (typedTcs) out.tcsAmount = ticked.TCS ? tcsTyped : null;
    return out;
  }, [kinds, ticked, sectionIds, includeEarlierTds, typedTcs, tcsTyped]);

  return { kinds, side, typedTcs, tcsTyped, setTcsTyped, sections, sectionsFor, byId, ticked, sectionIds, includeEarlierTds, setIncludeEarlierTds, toggle, pick, loadFrom, picks, history, missingPick, missingMessage, payload };
}

export type DocumentDeductions = ReturnType<typeof useDocumentDeductions>;
