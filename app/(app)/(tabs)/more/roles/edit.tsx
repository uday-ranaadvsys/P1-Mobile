import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ErrorBanner, FormCard } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { ScreenTitle } from '@/components/ScreenTitle';
import { createRole, listPermissions, listRoles, saveRolePermissions } from '@/features/roles/api';
import { grantable, isFullAccess } from '@/features/roles/matrix';
import { notify } from '@/lib/notify';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** New Role: name it, optionally start from another role's ticks, then choose what it can do on its own screen. */
export default function NewRole() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const styles = useThemed(makeStyles);
  const colors = useColors();

  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: listPermissions });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startFrom, setStartFrom] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const created = await createRole({ name: name.trim(), description: description.trim() || undefined });
      // "Start from": Admin = every box; another role = its ticks.
      const source = roles.data?.find((r) => r.id === startFrom);
      const ids = source ? (isFullAccess(source) ? grantable(permissions.data ?? []) : source.permissions).map((p) => p.id) : [];
      if (ids.length > 0) await saveRolePermissions(created.data.id, ids);
      return created;
    },
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      notify(`${name.trim()} added. Now choose what this role can do.`);
      router.replace({ pathname: '/more/roles/[id]', params: { id: data.id } });
    },
    onError: (e) => setBanner(message(e)),
  });

  const submit = () => {
    setBanner(null);
    if (!name.trim()) return setNameError('Role name is required');
    if (name.trim().length > 50) return setNameError('Role name cannot exceed 50 characters');
    if (description.trim().length > 255) return setBanner('Description cannot exceed 255 characters');
    setNameError(undefined);
    save.mutate();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle back="Roles" title="New Role" />
        <Text style={styles.help}>Name it, then choose what it can do.</Text>
        <ErrorBanner message={banner} />
        <FormCard>
          <Field label="Role name" required value={name} onChangeText={setName} placeholder="e.g. Stores, Accounts" autoCapitalize="words" error={nameError} />
          <Field label="What this role does" value={description} onChangeText={setDescription} placeholder="e.g. Receives material and makes GRNs" multiline autoCapitalize="sentences" />
          <PickerField
            label="Start from"
            value={startFrom}
            options={[{ value: '', label: 'Blank (nothing allowed)' }, ...(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))]}
            onChange={setStartFrom}
            placeholder="Blank (nothing allowed)"
          />
          <Text style={styles.help}>Next, choose what this role can do on the next screen.</Text>
        </FormCard>
      </ScrollView>
      <View style={styles.bar}>
        <Button title="Cancel" tone="secondary" style={{ flex: 1 }} onPress={() => router.back()} disabled={save.isPending} />
        <Button title="Add Role" style={{ flex: 1 }} onPress={submit} busy={save.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    help: { ...type.footnote, color: c.muted },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
