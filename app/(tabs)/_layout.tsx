import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color, space, type } from '@/theme';

/**
 * Tab bar. Five destinations, each with an icon AND a visible text label --
 * icon-only bars fail badly for anyone who has not memorised the glyph set.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.violetBright,
        tabBarInactiveTintColor: color.textFaint,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarAccessibilityLabel: 'Today',
          tabBarIcon: ({ color: c, focused }) => <TabIcon name="flash" c={c} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          title: 'Exercises',
          tabBarAccessibilityLabel: 'Exercise library',
          tabBarIcon: ({ color: c, focused }) => <TabIcon name="barbell" c={c} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarAccessibilityLabel: 'Progress charts',
          tabBarIcon: ({ color: c, focused }) => <TabIcon name="trending-up" c={c} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="body"
        options={{
          title: 'Body',
          tabBarAccessibilityLabel: 'Body map and recovery',
          tabBarIcon: ({ color: c, focused }) => <TabIcon name="body" c={c} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarAccessibilityLabel: 'Weekly insights',
          tabBarIcon: ({ color: c, focused }) => <TabIcon name="sparkles" c={c} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarAccessibilityLabel: 'Training with others',
          tabBarIcon: ({ color: c, focused }) => <TabIcon name="people" c={c} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarAccessibilityLabel: 'Training plans',
          tabBarIcon: ({ color: c, focused }) => <TabIcon name="grid" c={c} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  name,
  c,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  // React Navigation hands the tab tint through as ColorValue, which covers
  // platform-opaque colours as well as plain strings.
  c: ColorValue;
  focused: boolean;
}) {
  return (
    <View style={styles.iconWrap}>
      <Ionicons name={focused ? name : (`${name}-outline` as keyof typeof Ionicons.glyphMap)} size={21} color={c} />
      {focused ? <View style={styles.activeDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.surface,
    borderTopColor: color.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingTop: space.sm,
  },
  item: {
    // Guarantees a 44pt target even on compact Android bars.
    minHeight: 44,
  },
  label: {
    ...(type.eyebrow as object),
    fontSize: 9.5,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  activeDot: {
    position: 'absolute',
    bottom: -6,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: color.cyan,
  },
});
