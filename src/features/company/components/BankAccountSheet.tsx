import { VALIDATION_REGEX } from 'floman-shared/constants';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ErrorBanner, FormCard, SectionHeader, SwitchRow } from '@/components/FormParts';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import { addBankAccount, updateBankAccount, type BankAccount } from '../api';

type Errors = Partial<Record<'label' | 'bankName' | 'accountNumber' | 'ifsc' | 'upiId', string>>;

/**
 * Add or change one of the company's bank accounts: where money received goes and money paid comes from. Saved
 * straight away, on its own (the web's panel). `onSaved` gets the server's message ("Bank account added.").
 */
export function BankAccountSheet({ visible, companyId, account, onSaved, onClose }: {
  visible: boolean; companyId: string; account: BankAccount | null; onSaved: (message: string) => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [label, setLabel] = useState('');
  const [bankName, setBankName] = useState('');
  const [branch, setBranch] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Each time the sheet opens it starts from the account being changed, or empty.
  useEffect(() => {
    if (!visible) return;
    setLabel(account?.label ?? '');
    setBankName(account?.bankName ?? '');
    setBranch(account?.branch ?? '');
    setAccountNumber(account?.accountNumber ?? '');
    setIfsc(account?.ifsc ?? '');
    setUpiId(account?.upiId ?? '');
    setIsDefault(account?.isDefault ?? false);
    setErrors({});
    setBanner(null);
  }, [visible, account]);

  const save = async () => {
    const next: Errors = {};
    if (label.trim().length < 2) next.label = 'Give the account a name (e.g. HDFC Current)';
    else if (label.trim().length > 60) next.label = 'Name cannot exceed 60 characters';
    if (bankName.trim().length < 2) next.bankName = 'Bank name is required';
    if (!VALIDATION_REGEX.BANK_ACCOUNT_NUMBER.test(accountNumber.replace(/\s+/g, ''))) next.accountNumber = 'Account number must be 9 to 18 digits';
    if (!VALIDATION_REGEX.IFSC.test(ifsc.replace(/\s+/g, '').toUpperCase())) next.ifsc = 'Invalid IFSC (e.g. HDFC0001234)';
    if (upiId.trim() && !VALIDATION_REGEX.UPI_ID.test(upiId.trim())) next.upiId = 'Invalid UPI ID (e.g. name@bank)';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    setBanner(null);
    const input = {
      label: label.trim(),
      bankName: bankName.trim(),
      accountNumber: accountNumber.replace(/\s+/g, ''),
      ifsc: ifsc.replace(/\s+/g, '').toUpperCase(),
      branch: branch.trim() || null,
      upiId: upiId.trim() || null,
      isDefault,
    };
    try {
      const { message } = account ? await updateBankAccount(companyId, account.id, input) : await addBankAccount(companyId, input);
      onSaved(message ?? 'Bank account saved.');
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.head}>
          <Text style={styles.title}>{account ? 'Edit Bank Account' : 'Add Bank Account'}</Text>
          <Button title="Cancel" tone="secondary" onPress={onClose} disabled={busy} style={styles.headButton} />
        </View>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <ErrorBanner message={banner} />
          <View>
            <SectionHeader>Account</SectionHeader>
            <FormCard>
              <Field label="Name for this account" required value={label} onChangeText={setLabel} placeholder="e.g. Main current account" autoCapitalize="words" error={errors.label} />
              <Text style={styles.help}>Shown when you pick an account on a payment.</Text>
              <Field label="Bank" required value={bankName} onChangeText={setBankName} placeholder="e.g. HDFC Bank" autoCapitalize="words" error={errors.bankName} />
              <Field label="Branch" value={branch} onChangeText={setBranch} placeholder="e.g. Andheri East" autoCapitalize="words" />
              <Field label="Account number" required value={accountNumber} onChangeText={(v) => setAccountNumber(v.replace(/[^0-9 ]/g, ''))} placeholder="As on the cheque book" keyboardType="number-pad" error={errors.accountNumber} />
              <Field label="IFSC" required value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())} placeholder="e.g. HDFC0001234" autoCapitalize="characters" maxLength={11} error={errors.ifsc} />
            </FormCard>
          </View>
          <View>
            <SectionHeader>UPI</SectionHeader>
            <FormCard>
              <Field label="UPI ID" value={upiId} onChangeText={setUpiId} placeholder="e.g. company@hdfcbank" keyboardType="email-address" error={errors.upiId} />
              <Text style={styles.help}>Optional. Customers can pay to it.</Text>
            </FormCard>
          </View>
          <SwitchRow label="Use this account by default" help="Picked first on payments and printed on invoices." value={isDefault} onChange={setIsDefault} />
        </ScrollView>
        <View style={styles.bar}>
          <Button title={account ? 'Save changes' : 'Save'} onPress={() => void save()} busy={busy} style={{ flex: 1 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.lg + spacing.sm, paddingBottom: spacing.sm, backgroundColor: c.surface },
    title: { ...type.title3, color: c.ink },
    headButton: { minHeight: 44, paddingHorizontal: spacing.md },
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    help: { ...type.footnote, color: c.muted },
    bar: { flexDirection: 'row', padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
