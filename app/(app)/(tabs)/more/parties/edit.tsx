import { useLocalSearchParams, useRouter } from 'expo-router';
import { PartyForm } from '@/features/parties/components/PartyForm';

/** Add or edit a vendor or customer (the form itself is features/parties/components/PartyForm.tsx, shared with the Quotation). */
export default function PartyScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  return <PartyForm id={id} back="Vendors & Customers" onDone={() => router.back()} onCancel={() => router.back()} />;
}
