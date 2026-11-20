import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/AppText';
import { formatMoney } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { Part } from '../api';
import { gstRate, isLow, isProduct, PART_TYPE_LABEL, qtyText } from '../text';

/**
 * One part as a row: an avatar, the name, its type with HSN / SAC and GST, its stock (a warning when below the minimum)
 * and, for those who may see prices, the selling price on the right. Tap opens it; long-press opens its actions.
 */
export function PartRow({ part, onOpen, onActions }: { part: Part; onOpen: () => void; onActions?: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const product = isProduct(part);
  const low = product && isLow(part);
  const missingCode = !part.hsn;
  const selling = part.sellingPriceWithoutTax;
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onActions}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityHint={onActions ? 'Press and hold for actions' : undefined}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Avatar name={part.name} />
      <View style={styles.body}>
        <Text style={[styles.name, !part.isActive && { color: colors.faint }]} numberOfLines={2}>{part.name}</Text>
        <View style={styles.pills}>
          <Text style={styles.pill}>{PART_TYPE_LABEL[part.partType] ?? part.partType}</Text>
          {part.hsn ? <Text style={styles.small}>{part.hsn}</Text> : null}
          <Text style={styles.small}>GST {gstRate(part)}%</Text>
          {!part.isActive ? <Text style={styles.inactive}>Inactive</Text> : null}
        </View>
        {missingCode && product ? (
          <View style={styles.warn}>
            <Ionicons name="warning" size={14} color={colors.warnText} />
            <Text style={[styles.warnText, { color: colors.warnText }]}>HSN missing</Text>
          </View>
        ) : null}
        {product ? (
          low ? (
            <View style={styles.warn}>
              <Ionicons name="warning" size={14} color={colors.warnText} />
              <Text style={[styles.warnText, { color: colors.warnText }]}>{qtyText(part.inStock, part.uom)} · min {qtyText(part.minStock, part.uom)}</Text>
            </View>
          ) : (
            <Text style={styles.stock}>
              {qtyText(part.inStock, part.uom)}
              {part.minStock !== null && part.minStock !== undefined ? ` · min ${qtyText(part.minStock, part.uom)}` : ''}
            </Text>
          )
        ) : null}
      </View>
      {selling !== undefined && selling !== null ? (
        <View style={styles.price}>
          <Text style={styles.amount}>{hide.hidden ? hide.rupees(0) : formatMoney(selling)}</Text>
          <Text style={styles.caption}>/{part.uom.toLowerCase()}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, minHeight: 72 },
    body: { flex: 1, gap: 4 },
    name: { ...type.headline, color: c.ink },
    pills: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    pill: { ...type.footnoteBold, color: c.ink, backgroundColor: c.track, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
    small: { ...type.footnote, color: c.muted },
    inactive: { ...type.footnoteBold, color: c.muted },
    warn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    warnText: { ...type.subhead },
    stock: { ...type.subhead, color: c.muted },
    price: { alignItems: 'flex-end', paddingTop: 2 },
    amount: { ...type.headline, fontWeight: '700', color: c.ink },
    caption: { ...type.footnote, color: c.muted },
  });
