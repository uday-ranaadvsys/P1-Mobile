import { Text } from 'react-native';
import { useSession } from '@/auth/session';
import { Screen, Title } from '@/components/ui';
import { colors } from '@/theme';

// Step 1 placeholder: the Today list comes in step 2.
export default function Today() {
  const { user } = useSession();
  return (
    <Screen>
      <Title>Hello{user?.firstName ? `, ${user.firstName}` : ''}</Title>
      <Text style={{ color: colors.muted }}>You are signed in. Today comes next.</Text>
    </Screen>
  );
}
