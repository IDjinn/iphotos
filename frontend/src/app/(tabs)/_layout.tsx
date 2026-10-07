import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/context';
import { useTranslation } from '@/i18n/hook';
import type { IconName } from '@/components/Icon';

function TabIcon({ name, color, focused }: { name: IconName; color: string; focused: boolean }) {
  const glyph = (focused ? name : (`${name}-outline` as IconName)) as keyof typeof Ionicons.glyphMap;
  return <Ionicons name={glyph} size={24} color={color} />;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.iconInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.outline,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.photos'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="images" color={String(color)} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="search" color={String(color)} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="albums" color={String(color)} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
