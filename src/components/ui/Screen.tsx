import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { a11y, color, opacity, space } from '@/theme';

export interface ScreenProps extends Pick<ScrollViewProps, 'refreshControl' | 'onScroll' | 'scrollEventThrottle'> {
  children?: ReactNode;
  /** Set false for screens that own their own scrolling (e.g. FlatList). */
  scroll?: boolean;
  /** Large editorial title rendered above the content. */
  title?: string;
  eyebrow?: string;
  headerRight?: ReactNode;
  /**
   * Renders a back affordance above the header block.
   *
   * Needed by screens that are reachable but not present in the tab bar: with
   * no bar item and no navigation header, the only way back would be a
   * platform gesture that does not exist on every platform.
   */
  onBack?: () => void;
  /**
   * What the back control announces. Name the destination when the control goes
   * somewhere fixed rather than to wherever the user came from -- "Go back" is a
   * promise about history, and a control that does not keep it should not make it.
   */
  backLabel?: string;
  /** Extra bottom padding, e.g. to clear a floating action bar. */
  bottomInset?: number;
}

/**
 * Standard screen chrome: safe areas, canvas colour, and the editorial header
 * block (small wide-tracked eyebrow above a heavy display title).
 */
export function Screen({
  children,
  scroll = true,
  title,
  eyebrow,
  headerRight,
  onBack,
  backLabel = 'Go back',
  bottomInset = 0,
  ...scrollProps
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const back = onBack ? (
    <View style={styles.backRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        hitSlop={10}
        style={({ pressed }) => [styles.back, pressed && { opacity: opacity.pressed }]}
      >
        <Ionicons name="chevron-back" size={20} color={color.text} />
      </Pressable>
    </View>
  ) : null;

  const header =
    title || eyebrow ? (
      <View style={styles.header}>
        <View style={styles.headerText}>
          {eyebrow ? (
            <Text variant="eyebrow" tone="muted" style={styles.eyebrow}>
              {eyebrow}
            </Text>
          ) : null}
          {title ? (
            <Text variant="display" accessibilityRole="header">
              {title}
            </Text>
          ) : null}
        </View>
        {headerRight}
      </View>
    ) : null;

  const paddingTop = insets.top + space.sm;
  const paddingBottom = insets.bottom + space.xxl + bottomInset;

  if (!scroll) {
    return (
      <View style={[styles.canvas, { paddingTop }]}>
        {back}
        {header}
        <View style={styles.flex}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.canvas}
      contentContainerStyle={{ paddingTop, paddingBottom }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      {...scrollProps}
    >
      {back}
      {header}
      {children}
    </ScrollView>
  );
}

export const SCREEN_PADDING = space.lg;

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: color.bg,
  },
  flex: { flex: 1 },
  backRow: { paddingHorizontal: SCREEN_PADDING - space.md },
  back: {
    width: a11y.minTouch,
    height: a11y.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  headerText: { flex: 1 },
  eyebrow: { marginBottom: space.xs },
});
