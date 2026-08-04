import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, Text } from '@/components/ui';
import { MUSCLE_META } from '@/domain/muscles';
import { estimateDayMinutes } from '@/domain/schedule';
import { formatRelativeDay } from '@/utils/format';
import { color, space } from '@/theme';
import type { Exercise, MuscleGroup, RoutineDay, Workout } from '@/domain/types';

export interface SessionCardProps {
  day: RoutineDay;
  reason: 'scheduled_today' | 'next_in_rotation' | 'rest_day';
  targetMuscles: MuscleGroup[];
  exerciseById: Map<string, Exercise>;
  lastSession: Workout | null;
  onStart: () => void;
  onBrowse: () => void;
}

const REASON_COPY = {
  scheduled_today: { eyebrow: 'On the plan today', tone: 'violet' as const },
  next_in_rotation: { eyebrow: 'Next in your rotation', tone: 'cyan' as const },
  rest_day: { eyebrow: 'Week complete — rest day', tone: 'positive' as const },
};

/**
 * The single most important card in PRism: what am I doing today, and can I
 * start it in one tap. Everything else on Today is context around this.
 */
export function SessionCard({
  day,
  reason,
  targetMuscles,
  exerciseById,
  lastSession,
  onStart,
  onBrowse,
}: SessionCardProps) {
  const copy = REASON_COPY[reason];
  const totalSets = day.exercises.reduce((n, slot) => n + slot.targetSets, 0);
  const minutes = estimateDayMinutes(day);
  const leadMuscles = targetMuscles.slice(0, 4);

  return (
    <Card variant="raised" padding="xl" style={styles.card}>
      <View style={styles.head}>
        <Chip label={copy.eyebrow} tone={copy.tone} />
        {reason !== 'rest_day' ? (
          // Shrinks against the chip beside it. Without this the row overflowed
          // the card on a 390pt screen and clipped its own last value mid-word
          // ("~49M" -> "~49"), on the most important card in the app.
          <Text variant="eyebrow" tone="faint" numberOfLines={1} style={styles.headMeta}>
            {`${day.exercises.length} lifts · ${totalSets} sets · ~${minutes}m`}
          </Text>
        ) : null}
      </View>

      <Text variant="title1" style={styles.title}>
        {day.name}
      </Text>

      <View style={styles.muscles}>
        {leadMuscles.map((m) => (
          <Chip key={m} label={MUSCLE_META[m].short} accessibilityLabel={MUSCLE_META[m].label} />
        ))}
        {targetMuscles.length > leadMuscles.length ? (
          <Chip label={`+${targetMuscles.length - leadMuscles.length}`} accessibilityLabel={`Plus ${targetMuscles.length - leadMuscles.length} more muscle groups`} />
        ) : null}
      </View>

      <View style={styles.list}>
        {day.exercises.slice(0, 4).map((slot, i) => {
          const exercise = exerciseById.get(slot.exerciseId);
          return (
            <View key={slot.id} style={styles.row}>
              <Text variant="numericSm" tone="faint" style={styles.rowIndex}>
                {String(i + 1).padStart(2, '0')}
              </Text>
              {/*
                Same fix as ListRow's title, Progress' lift names, and Plans'
                day names, all found the same way this session: a name
                sharing a row with other fixed-width values, capped at one
                line. "Dumbbell Shoulder Press" clipped to "Dumbbell
                Should…" at accessibility-extra-large, confirmed on-device
                on this, the single most important card in the app -- the
                row already has minHeight, not a fixed height, so it grows
                to fit without any other change.
              */}
              <Text variant="body" style={styles.rowName} numberOfLines={2}>
                {exercise?.name ?? 'Exercise'}
              </Text>
              <Text variant="numericSm" tone="muted">
                {slot.targetSets}×{slot.targetRepsLow}–{slot.targetRepsHigh}
              </Text>
            </View>
          );
        })}
        {day.exercises.length > 4 ? (
          <Text variant="bodySm" tone="faint" style={styles.more}>
            {`+ ${day.exercises.length - 4} more`}
          </Text>
        ) : null}
      </View>

      {lastSession ? (
        <View style={styles.lastRow}>
          <Ionicons name="time-outline" size={13} color={color.textFaint} />
          <Text variant="bodySm" tone="faint" style={styles.lastText}>
            {`You last ran this ${formatRelativeDay(lastSession.startedAt).toLowerCase()}`}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={reason === 'rest_day' ? 'Train anyway' : 'Start session'}
          icon="play"
          onPress={onStart}
          fullWidth
          size="md"
        />
        <Button label="Choose a workout" variant="ghost" size="sm" onPress={onBrowse} fullWidth />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  headMeta: { flexShrink: 1, textAlign: 'right' },
  title: { marginTop: space.md },
  muscles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.md },
  list: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    gap: space.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  rowIndex: { width: 26 },
  rowName: { flex: 1, paddingRight: space.sm },
  more: { marginTop: 2 },
  lastRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.md, gap: 5 },
  lastText: { flex: 1 },
  actions: { marginTop: space.lg, gap: space.sm },
});
