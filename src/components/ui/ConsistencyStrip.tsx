import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { color, radius, space } from '@/theme';

export interface DayCell {
  /** Single-letter weekday initial. */
  initial: string;
  /** Full name, announced by screen readers. */
  label: string;
  state: 'done' | 'planned' | 'rest' | 'missed' | 'today';
}

export interface ConsistencyStripProps {
  days: DayCell[];
}

const STATE_STYLE: Record<DayCell['state'], { bg: string; border: string; fg: string }> = {
  done: { bg: color.violet, border: color.violetBright, fg: color.text },
  planned: { bg: 'transparent', border: color.lineStrong, fg: color.textMuted },
  rest: { bg: 'transparent', border: color.line, fg: color.textFaint },
  missed: { bg: 'transparent', border: 'rgba(242,96,78,0.45)', fg: color.coralBright },
  today: { bg: color.cyanWash, border: color.cyan, fg: color.cyanSoft },
};

const STATE_WORD: Record<DayCell['state'], string> = {
  done: 'trained',
  planned: 'planned',
  rest: 'rest day',
  missed: 'missed',
  today: 'today, planned',
};

/**
 * Seven-day training rhythm. Deliberately not a heat map -- a lifter cares
 * whether the session happened, not about a nine-shade gradient of intensity.
 */
export function ConsistencyStrip({ days }: ConsistencyStripProps) {
  return (
    <View style={styles.row} accessibilityRole="summary">
      {days.map((day, i) => {
        const palette = STATE_STYLE[day.state];
        return (
          <View key={`${day.label}-${i}`} style={styles.cell}>
            <View
              accessible
              accessibilityLabel={`${day.label}: ${STATE_WORD[day.state]}`}
              style={[styles.dot, { backgroundColor: palette.bg, borderColor: palette.border }]}
            >
              <Text variant="numericSm" style={{ color: palette.fg }}>
                {day.initial}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  cell: { flex: 1, alignItems: 'center' },
  dot: {
    width: '100%',
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
