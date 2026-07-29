import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { color, opacity, radius, space } from '@/theme';

export interface QuickAccessItem {
  key: string;
  label: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

export interface QuickAccessProps {
  items: QuickAccessItem[];
}

/**
 * Lateral routes out of Today.
 *
 * The tab bar can only hold five destinations and Today is the screen a lifter
 * actually lands on, so the surfaces that lose their bar slot -- or that a user
 * would otherwise have to remember exists -- get a named tile here instead of
 * relying on the bar alone.
 *
 * Tiles are quiet by construction: flat surface, muted glyph, no accent fill.
 * They are a way out of the screen, not a competing call to action.
 */
export function QuickAccess({ items }: QuickAccessProps) {
  return (
    <View style={styles.row}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={`${item.label}. ${item.caption}`}
          onPress={item.onPress}
          style={({ pressed }) => [styles.tile, pressed && { opacity: opacity.pressed }]}
        >
          <View style={styles.glyph}>
            <Ionicons name={item.icon} size={16} color={color.textSecondary} />
          </View>
          <Text variant="label" numberOfLines={1}>
            {item.label}
          </Text>
          <Text variant="bodySm" tone="faint" numberOfLines={2} style={styles.caption}>
            {item.caption}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, marginHorizontal: space.lg },
  tile: {
    flex: 1,
    minHeight: 108,
    padding: space.base,
    borderRadius: radius.md,
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  glyph: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: color.neutralWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  caption: { marginTop: 2 },
});
