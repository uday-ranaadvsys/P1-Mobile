import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { useColors } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tabIcon = (name: IconName) => ({ color, size }: { color: unknown; size: number }) => (
  <Ionicons name={name} size={size + 2} color={String(color)} />
);

/** The red + in the middle of the bar: lifted above it, opens the Create page. */
function CreateButton({ onPress }: { onPress?: (...args: never[]) => void }) {
  return (
    <View style={styles.slot}>
      <Pressable onPress={onPress as () => void} style={styles.fab} accessibilityLabel="Create">
        <Ionicons name="add" size={36} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        header: () => <AppHeader />,
        tabBarActiveTintColor: colors.brandText,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.divider, height: 72, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="sales" options={{ title: 'Sales', tabBarIcon: tabIcon('document-text-outline') }} />
      <Tabs.Screen name="create" options={{ title: '', tabBarButton: (props) => <CreateButton onPress={props.onPress as never} /> }} />
      <Tabs.Screen name="purchase" options={{ title: 'Purchase', tabBarIcon: tabIcon('cube-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('ellipsis-horizontal') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center' },
  fab: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: '#8A171A', alignItems: 'center', justifyContent: 'center',
    marginTop: -26, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
});
