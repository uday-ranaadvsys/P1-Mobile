import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from 'floman-shared/permissions';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ScrollAnchor } from '@/components/FormScroll';
import { Text } from '@/components/AppText';
import { FieldLink } from '@/components/FieldLink';
import { FullScreenModal } from '@/components/FullScreenModal';
import { useSession } from '@/features/auth/session';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import { getParty, type Party } from '../api';
import { gstinText, placeLine } from '../text';
import { PartyForm } from './PartyForm';
import { PartySheet } from './PartySheet';

/**
 * The Customer / Vendor of a document form: a field that opens the list, with "Edit customer" at the top right of the
 * label (hidden while the party is locked) and "New customer" at the top of the list (the web's PartySelectDropdown).
 * A party picked comes back with its places (`onPick`); an edited one comes back to `onRefresh` so the form keeps what
 * was chosen. `label`: Customer or Vendor. `kind`: its PARTY_TYPE. `listType`: limits the list to one type (none: the
 * server limits it to the user's side). `back`: what the full-screen form names as where it came from.
 */
export function PartyField({ label, kind, party, error, lock, listType, back, onPick, onRefresh }: {
  label: string; kind: string; party: Party | null; error?: string | null; lock?: string | null; listType?: string; back: string;
  onPick: (party: Party) => void; onRefresh: (party: Party) => void;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const [sheet, setSheet] = useState(false);
  const [picking, setPicking] = useState(false);
  // A party made or edited from here; `id` set = the one chosen.
  const [quick, setQuick] = useState<{ id?: string } | null>(null);
  const canCreate = can(PERMISSIONS.VENDORS.CREATE);
  const canUpdate = can(PERMISSIONS.VENDORS.UPDATE);
  const lower = label.toLowerCase();

  // A party picked: its places come with it.
  const pick = async (picked: Party) => {
    setPicking(true);
    const full = await getParty(picked.id).catch(() => picked);
    setPicking(false);
    onPick(full);
  };

  return (
    <ScrollAnchor name="party">
    <View style={{ gap: spacing.xs }}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}<Text style={{ color: colors.danger }}> *</Text>
        </Text>
        {/* As on the web: at the top right of the field, and hidden once the party is locked. */}
        {party && canUpdate && !lock ? <FieldLink label={`Edit ${lower}`} onPress={() => setQuick({ id: party.id })} /> : null}
      </View>
      <Pressable
        onPress={() => setSheet(true)}
        disabled={Boolean(lock)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${party?.name ?? 'not chosen'}`}
        style={({ pressed }) => [styles.box, error ? { borderColor: colors.danger } : null, lock && { opacity: 0.6 }, pressed && { opacity: 0.7 }]}
      >
        {party ? (
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.value} numberOfLines={2}>{hide.text(party.name)}</Text>
            <Text style={styles.sub} numberOfLines={1}>{gstinText(party)} · {hide.text(placeLine(party))}</Text>
          </View>
        ) : (
          <Text style={[styles.value, { flex: 1, color: colors.placeholder }]}>Choose a {lower}</Text>
        )}
        {picking ? <ActivityIndicator color={colors.muted} /> : <Ionicons name="chevron-down" size={18} color={colors.muted} />}
      </Pressable>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {lock ? <Text style={styles.sub}>{lock}</Text> : null}

      <PartySheet
        visible={sheet}
        title={label}
        type={listType}
        selectedId={party?.id}
        onPick={(p) => void pick(p)}
        // The full-screen form opens once the sheet has closed (a phone can't show two at once).
        onNew={canCreate ? () => setTimeout(() => setQuick({}), 400) : undefined}
        onClose={() => setSheet(false)}
      />

      <FullScreenModal visible={quick !== null} onClose={() => setQuick(null)}>
        {quick ? (
          <PartyForm
            key={quick.id ?? 'new'}
            id={quick.id}
            lockKind={kind}
            back={back}
            onCancel={() => setQuick(null)}
            onDone={(saved) => {
              void queryClient.invalidateQueries({ queryKey: ['party-picker'] });
              setQuick(null);
              // A new one is chosen for the document; an edited one is read again, keeping the places picked.
              if (quick.id) void getParty(saved.id).then(onRefresh).catch(() => undefined);
              else void pick(saved);
            }}
          />
        ) : null}
      </FullScreenModal>
    </View>
    </ScrollAnchor>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    box: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    value: { ...type.body, color: c.ink },
    sub: { ...type.footnote, color: c.muted },
    error: { ...type.footnote },
  });
