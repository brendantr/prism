import { StyleSheet, View } from 'react-native';
import { Card, ConsistencyStrip, StatBlock, Text, type DayCell } from '@/components/ui';
import { color, space } from '@/theme';

export interface WeekCardProps {
  days: DayCell[];
  sessionsDone: number;
  sessionsTarget: number;
  /** Rolling four-week weekly average, already formatted. */
  volumeAverage: string;
  volumeUnit: string;
  streakWeeks: number;
}

/**
 * Weekly consistency: the rhythm strip plus the numbers that frame it.
 *
 * This card reports the *baseline* -- the four-week average and the streak --
 * rather than this week's volume, which the Today summary above already owns.
 * Repeating that figure here would cost a column and add nothing; the average
 * is what makes the current week readable as high, low, or ordinary.
 */
export function WeekCard({
  days,
  sessionsDone,
  sessionsTarget,
  volumeAverage,
  volumeUnit,
  streakWeeks,
}: WeekCardProps) {
  return (
    <Card padding="lg" style={styles.card}>
      <View style={styles.head}>
        <Text variant="eyebrow" tone="muted">
          This week
        </Text>
        <Text variant="numericSm" tone={sessionsDone >= sessionsTarget ? 'positive' : 'muted'}>
          {sessionsDone}/{sessionsTarget} sessions
        </Text>
      </View>

      <View style={styles.strip}>
        <ConsistencyStrip days={days} />
      </View>

      <View style={styles.stats}>
        <StatBlock label="4-week avg" value={volumeAverage} unit={`${volumeUnit}/wk`} />
        <View style={styles.divider} />
        <StatBlock
          label="Streak"
          value={String(streakWeeks)}
          unit={streakWeeks === 1 ? 'week' : 'weeks'}
          tone="cyan"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  strip: { marginTop: space.base },
  stats: {
    flexDirection: 'row',
    marginTop: space.lg,
    paddingTop: space.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.line,
    marginHorizontal: space.base,
  },
});
