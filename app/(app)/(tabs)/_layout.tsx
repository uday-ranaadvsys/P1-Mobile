import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { useColors } from '@/theme';

export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brandText,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.divider, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          header: () => <AppHeader />,
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" size={size} color={String(color)} />,
        }}
      />
    </Tabs>
  );
}
