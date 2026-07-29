import { StyleSheet, View } from 'react-native';
import { color, radius, space } from '@/theme';

export interface CarouselPaginationProps {
  count: number;
  /** 0-based. */
  index: number;
}

/**
 * Position within a carousel.
 *
 * The active dot stretches into a bar rather than changing colour alone, so
 * position survives being viewed at arm's length or by someone who cannot
 * separate the accent from the inactive grey.
 */
export function CarouselPagination({ count, index }: CarouselPaginationProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Page ${Math.min(index + 1, count)} of ${count}`}
      accessibilityValue={{ min: 1, max: count, now: Math.min(index + 1, count) }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.inset,
  },
  dotActive: {
    width: 22,
    backgroundColor: color.violetBright,
  },
});
