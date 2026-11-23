import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { mediaSource } from '@/api/client';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { BillAttachmentState } from '../useBillAttachment';

/**
 * "Attach Scanned Bill" on the GRN form (as the web's): take a photo of the vendor's bill with the camera or pick one
 * from the gallery (it uploads when the document is saved), see it, remove it. A bill already on the document, or
 * taken from the Purchase it is made from, shows as Attached.
 */
export function BillAttachment({ attachment, readOnlyNote }: { attachment: BillAttachmentState; readOnlyNote?: string | null }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const { picked, existing, source } = attachment;
  const [busy, setBusy] = useState(false);

  // Each pick answers with a message when it can't be used; it is told in an alert (a short, one-off notice).
  const pick = async (from: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const problem = await from();
      if (problem) Alert.alert('Could not attach the bill', problem);
    } catch (e) {
      Alert.alert('Could not attach the bill', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const existingUrl = existing?.url || existing?.path;
  const existingSource = existingUrl ? mediaSource(existingUrl) : null;
  const status = picked ? 'Selected (uploads on save)' : existing ? (source ? `Attached · from ${source}` : 'Attached') : null;

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.labelRow}>
        <View style={styles.labelLeft}>
          <Ionicons name="attach" size={18} color={colors.muted} />
          <Text style={styles.label}>Attach Scanned Bill</Text>
        </View>
        {status ? <Text style={[type.footnoteBold, { color: colors.receive }]}>{status}</Text> : null}
      </View>

      {picked || existing ? (
        <View style={styles.box}>
          {picked ? (
            <Image source={{ uri: picked.uri }} style={styles.thumb} accessibilityLabel="The bill photo" />
          ) : (
            <View style={[styles.thumb, styles.thumbFile]}>
              <Ionicons name="document-text-outline" size={24} color={colors.muted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{picked ? picked.name : existing?.originalName || existing?.filename || 'Scanned bill'}</Text>
            {existingUrl && !picked ? (
              <Pressable onPress={() => void Linking.openURL(existingSource?.uri ?? existingUrl)} accessibilityRole="link" style={{ minHeight: 32, justifyContent: 'center' }}>
                <Text style={[type.footnote, { color: colors.brandText, textDecorationLine: 'underline' }]}>View</Text>
              </Pressable>
            ) : null}
          </View>
          {readOnlyNote ? null : (
            <Pressable onPress={attachment.remove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove the bill" style={styles.iconButton}>
              <Ionicons name="close-circle" size={26} color={colors.muted} />
            </Pressable>
          )}
        </View>
      ) : null}

      {readOnlyNote ? (
        <Text style={styles.note}>{readOnlyNote}</Text>
      ) : (
        <View style={styles.buttons}>
          <Pressable onPress={() => void pick(attachment.fromCamera)} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }, busy && { opacity: 0.4 }]}>
            <Ionicons name="camera-outline" size={22} color={colors.ink} />
            <Text style={styles.actionText}>{picked || existing ? 'Retake photo' : 'Take photo'}</Text>
          </Pressable>
          <Pressable onPress={() => void pick(attachment.fromGallery)} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }, busy && { opacity: 0.4 }]}>
            <Ionicons name="images-outline" size={22} color={colors.ink} />
            <Text style={styles.actionText}>From gallery</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    labelLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    box: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
    thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: c.background },
    thumbFile: { alignItems: 'center', justifyContent: 'center' },
    name: { ...type.subhead, fontWeight: '600', color: c.ink },
    iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    buttons: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
    actionText: { ...type.subhead, fontWeight: '600', color: c.ink },
    note: { ...type.footnote, color: c.muted },
  });
