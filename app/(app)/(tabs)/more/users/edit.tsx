import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ErrorBanner, FormCard, SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { PickerField } from '@/components/PickerField';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { createUser, listDepartments, listRoles, listUsers, updateUser, type UserInput } from '@/features/users/api';
import { MIN_PASSWORD_LENGTH, roleText } from '@/features/users/text';
import { useUserAccess } from '@/features/users/useUserAccess';
import { notify } from '@/lib/notify';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
type Errors = Partial<Record<'firstName' | 'lastName' | 'email' | 'phoneNo' | 'password' | 'roleId', string>>;

/**
 * Invite a user or edit one: the web's form (client features/users/forms/UserForm.tsx). Name, email (optional), mobile
 * number, a temporary password for a new user, role and department. Only an Admin invites, and a role is changed
 * only by an Admin and never on their own account. The server's words appear at the top.
 */
export default function UserForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refresh } = useSession();
  const access = useUserAccess();
  const styles = useThemed(makeStyles);
  const colors = useColors();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);

  const users = useQuery({ queryKey: ['users'], queryFn: listUsers, enabled: editing });
  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles, retry: false });
  const departments = useQuery({ queryKey: ['departments'], queryFn: listDepartments, retry: false });
  const user = editing ? users.data?.find((u) => u.id === id) : undefined;

  // An existing user fills the form once, when they arrive.
  const loaded = useRef(false);
  useEffect(() => {
    if (!user || loaded.current) return;
    loaded.current = true;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setEmail(user.email ?? '');
    setPhoneNo(user.phoneNo);
    setRoleId(user.roles?.[0]?.id ?? '');
    setDepartmentId(user.departmentId ?? user.department?.id ?? '');
  }, [user]);

  // Only an Admin assigns roles, and never on their own account.
  const canChangeRole = access.isAdmin && id !== access.meId;

  const save = useMutation({
    mutationFn: () => {
      const input: UserInput = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        phoneNo: phoneNo.trim(),
        // A locked role isn't sent, so it stays as it is.
        ...(canChangeRole && { roleIds: roleId ? [roleId] : [] }),
        departmentId: departmentId || null,
      };
      return editing ? updateUser(id!, input) : createUser({ ...input, password });
    },
    onSuccess: ({ message: _server }) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void refresh(); // the active-user count may have changed
      const who = `${firstName.trim()} ${lastName.trim()}`;
      notify(editing ? `${who} saved.` : `${who} added. Share the temporary password with them; they'll choose their own at first sign-in.`);
      router.back();
    },
    onError: (e) => setBanner(message(e)),
  });

  // The web form's own checks, in its words; the server checks the rest (a mobile or email already in use, the seat limit).
  const submit = () => {
    const next: Errors = {};
    if (!firstName.trim()) next.firstName = 'First name is required';
    else if (firstName.trim().length > 100) next.firstName = 'First name cannot exceed 100 characters';
    if (!lastName.trim()) next.lastName = 'Last name is required';
    else if (lastName.trim().length > 100) next.lastName = 'Last name cannot exceed 100 characters';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Invalid email address';
    if (!/^[6-9]\d{9}$/.test(phoneNo.trim())) next.phoneNo = 'Enter a valid 10-digit Indian mobile number (e.g. 9876543210)';
    if (!editing && password.length < MIN_PASSWORD_LENGTH) next.password = `Enter a temporary password of at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (canChangeRole && roles.data && !roleId) next.roleId = 'Role selection is required';
    setErrors(next);
    setBanner(null);
    if (Object.keys(next).length === 0) save.mutate();
  };

  if (editing && users.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (editing && (users.error || !user)) {
    return (
      <Centered>
        <ErrorText message={users.error ? message(users.error) : 'User not found'} />
        <Button title="Try again" tone="secondary" onPress={() => void users.refetch()} />
      </Centered>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle back="Users" title={editing ? `Edit ${[firstName, lastName].filter(Boolean).join(' ') || 'User'}` : 'Invite User'} />
        <Text style={styles.help}>
          {editing ? 'Name, sign-in details, role and department.' : 'They sign in with their mobile number or email and the temporary password.'}
        </Text>
        <ErrorBanner message={banner} />

        <View>
          <SectionHeader>Who are they?</SectionHeader>
          <FormCard>
            <Field label="First name" required value={firstName} onChangeText={setFirstName} placeholder="John" autoCapitalize="words" error={errors.firstName} />
            <Field label="Last name" required value={lastName} onChangeText={setLastName} placeholder="Doe" autoCapitalize="words" error={errors.lastName} />
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="name@company.com" keyboardType="email-address" error={errors.email} />
            <Text style={styles.help}>Optional. They can sign in with this email or their mobile number.</Text>
            <Field label="Mobile number" required prefix="+91" value={phoneNo} onChangeText={(v) => setPhoneNo(v.replace(/\D/g, ''))} placeholder="9876543210" keyboardType="phone-pad" maxLength={10} error={errors.phoneNo} />
            {/* Temporary password (new users only) */}
            {!editing ? (
              <View style={{ gap: spacing.xs }}>
                <Field label="Temporary password" required secure value={password} onChangeText={setPassword} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} autoComplete="off" error={errors.password} />
                <Text style={styles.help}>Give this to the user. They sign in with it, then must choose their own.</Text>
              </View>
            ) : null}
          </FormCard>
        </View>

        <View>
          <SectionHeader>Access</SectionHeader>
          <FormCard>
            {canChangeRole && roles.data ? (
              <PickerField label="Role" required value={roleId} options={roles.data.map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => { setRoleId(v); setErrors((e) => ({ ...e, roleId: undefined })); }} placeholder="Select a role" error={errors.roleId} />
            ) : (
              <View style={{ gap: spacing.xs }}>
                <InfoRow label="Role" value={user ? roleText(user) : null} />
                <Text style={styles.help}>{canChangeRole ? "The roles couldn't be loaded." : 'Only an Admin can change roles, and not on their own account.'}</Text>
              </View>
            )}
            <PickerField
              label="Department"
              value={departmentId}
              options={[{ value: '', label: 'None' }, ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))]}
              onChange={setDepartmentId}
              placeholder="None"
            />
            <Text style={styles.help}>Optional. Used for indents: who asks for material and who approves it.</Text>
          </FormCard>
        </View>
      </ScrollView>

      <View style={styles.bar}>
        <Button title="Cancel" tone="secondary" style={{ flex: 1 }} onPress={() => router.back()} disabled={save.isPending} />
        <Button title={editing ? 'Save' : 'Invite'} style={{ flex: 1 }} onPress={submit} busy={save.isPending} />
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
