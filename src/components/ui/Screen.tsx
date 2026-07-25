import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { color, space } from '@/theme';

export interface ScreenProps extends Pick<ScrollViewProps, 'refreshControl' | 'onScroll' | 'scrollEventThrottle'> {
  children?: ReactNode;
  /** Set false for screens that own their own scrolling (e.g. FlatList). */
  scroll?: boolean;
  /** Large editorial title rendered above the content. */
  title?: string;
  eyebrow?: string;
  headerRight?: ReactNode;
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
  bottomInset = 0,
  ...scrollProps
}: ScreenProps) {
  const insets = useSafeAreaInsets();

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
