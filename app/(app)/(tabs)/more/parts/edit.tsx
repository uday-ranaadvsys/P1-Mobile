import { useLocalSearchParams, useRouter } from 'expo-router';
import { PartForm } from '@/features/parts/components/PartForm';

/** Add or edit a part (the form itself is features/parts/components/PartForm.tsx, shared with the Quotation). */
export default function PartScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  return <PartForm id={id} back="Part Master" onDone={() => router.back()} onCancel={() => router.back()} />;
}
