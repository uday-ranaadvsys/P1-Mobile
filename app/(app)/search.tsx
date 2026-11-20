import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { SEARCH_LIMITS } from 'floman-shared/constants';
import { DOCUMENT_API_PATHS, DOCUMENT_NAMES } from 'floman-shared/documentTypes';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { search, type DocumentHit } from '@/features/search/api';
import { ErrorText } from '@/components/Text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

/** Search documents, parties and parts. A document opens read-only (no Approve) on the review screen. */
export default function Search() {
  const router = useRouter();
  const colors = useColors();
  const styles = useThemed(makeStyles);
  const hide = useHide();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');

  // Ask the server once the user pauses typing.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const enabled = q.length >= SEARCH_LIMITS.MIN_QUERY;
  const { data, error, isFetching } = useQuery({ queryKey: ['search', q], queryFn: () => search(q), enabled });

  function open(hit: DocumentHit) {
    router.push({
      pathname: '/document/[kind]/[id]',
      params: { kind: hit.kind, id: hit.id, number: hit.number, party: hit.owner ?? '', date: hit.date },
    });
  }

  const empty = enabled && data && !data.documents.length && !data.parties.length && !data.parts.length;
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.bar}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          placeholder="Search documents, parties, parts…"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {isFetching ? <ActivityIndicator color={colors.brandText} /> : null}
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ErrorText message={error instanceof Error ? error.message : null} />
        {empty ? <Text style={styles.muted}>Nothing found.</Text> : null}

        {data?.documents.length ? <Text style={styles.heading}>Documents</Text> : null}
        {data?.documents.map((hit) => {
          const openable = Boolean(DOCUMENT_API_PATHS[hit.kind]);
          return (
            <Pressable key={`${hit.kind}:${hit.id}`} style={styles.card} disabled={!openable} onPress={() => open(hit)}>
              <View style={styles.row}>
                <Text style={styles.small}>{DOCUMENT_NAMES[hit.kind]} · {formatDate(hit.date)}</Text>
                {hit.total != null ? <Text style={styles.amount}>{hide.rupees(hit.total)}</Text> : null}
              </View>
              <Text style={styles.title}>{hit.number}</Text>
              {hit.owner ? <Text style={styles.muted}>{hide.text(hit.owner)}</Text> : null}
            </Pressable>
          );
        })}

        {data?.parties.length ? <Text style={styles.heading}>Parties</Text> : null}
        {data?.parties.map((party) => (
          <Pressable
            key={party.id}
            style={styles.card}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/more/parties/[id]', params: { id: party.id } })}
          >
            <Text style={styles.title}>{hide.text(party.name)}</Text>
            <Text style={styles.muted}>{[party.type, party.city].filter(Boolean).join(' · ')}</Text>
          </Pressable>
        ))}

        {data?.parts.length ? <Text style={styles.heading}>Parts</Text> : null}
        {data?.parts.map((part) => (
          <View key={part.id} style={styles.card}>
            <Text style={styles.title}>{part.name}</Text>
            <Text style={styles.muted}>{[part.hsn && `HSN ${part.hsn}`, part.uom].filter(Boolean).join(' · ')}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    bar: {
      flexDirection: 'row', alignItems: 'center', gap: 10, margin: spacing.md, backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.outline, paddingHorizontal: spacing.md,
    },
    input: { flex: 1, paddingVertical: 14, fontSize: 16, color: c.ink },
    cancel: { color: c.brandText, fontWeight: '600', fontSize: 15 },
    page: { padding: spacing.md, paddingTop: 0, gap: spacing.sm },
    heading: { fontSize: 14, fontWeight: '700', color: c.muted, marginTop: spacing.sm },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: 4 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    small: { fontSize: 13, color: c.muted },
    title: { fontSize: 16, fontWeight: '700', color: c.ink },
    amount: { fontSize: 16, fontWeight: '700', color: c.ink },
    muted: { fontSize: 14, color: c.muted },
  });
