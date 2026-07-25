import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, Text } from '@/components/ui';
import { SetRow } from './SetRow';
import { evaluateSetForPr, type ExerciseBests } from '@/domain/calc/prs';
import { formatDelta, formatWeight } from '@/utils/format';
import { a11y, color, opacity, radius, space } from '@/theme';
import type { Exercise, LoadSuggestion, Unit, Workout, WorkoutExercise, WorkoutSet } from '@/domain/types';

export interface ExerciseBlockProps {
  workoutExercise: WorkoutExercise;
  exercise: Exercise;
  unit: Unit;
  suggestion: LoadSuggestion | null;
  previousSets: WorkoutSet[];
  previousWorkout: Workout | null;
  priorBests: ExerciseBests | undefined;
  onUpdateSet: (setId: string, patch: Partial<WorkoutSet>) => void;
  onToggleSet: (setId: string, restSeconds: number) => void;
  onRemoveSet: (setId: string) => void;
  onAddSet: () => void;
  onRemoveExercise: () => void;
  onApplySuggestion: (weightKg: number) => void;
}

const ACTION_TONE = {
  increase: 'positive' as const,
  hold: 'cyan' as const,
  deload: 'coral' as const,
  establish: 'neutral' as const,
};

const ACTION_VERB = {
  increase: 'Add load',
  hold: 'Hold load',
  deload: 'Back off',
  establish: 'First time',
};

/**
 * One exercise inside an active session: header, the load recommendation, the
 * set grid, and the controls to extend it.
 *
 * PR detection runs live against the lifter's prior bests as values change, so
 * a record is flagged the moment the set is marked done -- not on a summary
 * screen twenty minutes later.
 */
export function ExerciseBlock({
  workoutExercise,
  exercise,
  unit,
  suggestion,
  previousSets,
  previousWorkout,
  priorBests,
  onUpdateSet,
  onToggleSet,
  onRemoveSet,
  onAddSet,
  onRemoveExercise,
  onApplySuggestion,
}: ExerciseBlockProps) {
  const [showRationale, setShowRationale] = useState(false);

  const prFlags = useMemo(() => {
    const flags = new Set<string>();
    const running: ExerciseBests = { ...(priorBests ?? { bestE1rm: 0, bestWeightKg: 0 }) };
    for (const set of workoutExercise.sets) {
      if (!set.completed) continue;
      const result = evaluateSetForPr(set, running);
      if (result.isE1rmPr || result.isWeightPr) flags.add(set.id);
      if (result.isE1rmPr) running.bestE1rm = result.e1rm;
      if (result.isWeightPr) running.bestWeightKg = set.weightKg;
    }
    return flags;
  }, [workoutExercise.sets, priorBests]);

  const completedCount = workoutExercise.sets.filter((s) => s.completed).length;

  return (
    <Card padding="base" style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title3" numberOfLines={2}>
            {exercise.name}
          </Text>
          <Text variant="eyebrow" tone="faint" style={styles.equipment}>
            {`${exercise.equipment} · ${completedCount}/${workoutExercise.sets.length} sets`}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${exercise.name} from this session`}
          onPress={onRemoveExercise}
          hitSlop={10}
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: opacity.pressed }]}
        >
          <Ionicons name="close" size={16} color={color.textFaint} />
        </Pressable>
      </View>

      {exercise.cue ? (
        <Text variant="bodySm" tone="faint" style={styles.cue}>
          {exercise.cue}
        </Text>
      ) : null}

      {/* Load recommendation */}
      {suggestion ? (
        <View style={styles.suggestion}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${ACTION_VERB[suggestion.action]}. ${
              suggestion.action === 'establish'
                ? 'No history yet.'
                : `Suggested ${formatWeight(suggestion.suggestedWeightKg, unit)}, ${formatDelta(suggestion.deltaKg, unit)}. Tap to see why.`
            }`}
            accessibilityState={{ expanded: showRationale }}
            onPress={() => setShowRationale((v) => !v)}
            style={({ pressed }) => [styles.suggestionRow, pressed && { opacity: opacity.pressed }]}
          >
            <Chip label={ACTION_VERB[suggestion.action]} tone={ACTION_TONE[suggestion.action]} />

            {suggestion.action !== 'establish' ? (
              <Text variant="numericSm" tone="secondary" style={styles.suggestionValue}>
                {formatWeight(suggestion.suggestedWeightKg, unit)}
                <Text variant="eyebrow" tone="faint">{`  ${formatDelta(suggestion.deltaKg, unit)}`}</Text>
              </Text>
            ) : (
              <Text variant="bodySm" tone="faint" style={styles.suggestionValue}>
                No history yet
              </Text>
            )}

            <Ionicons
              name={showRationale ? 'chevron-up' : 'information-circle-outline'}
              size={15}
              color={color.textFaint}
            />
          </Pressable>

          {showRationale ? (
            <View style={styles.rationale}>
              {suggestion.rationale.map((line, i) => (
                <View key={i} style={styles.rationaleRow}>
                  <View style={styles.bullet} />
                  <Text variant="bodySm" tone="muted" style={styles.rationaleText}>
                    {line}
                  </Text>
                </View>
              ))}
              <Text variant="eyebrow" tone="faint" style={styles.confidence}>
                {`${suggestion.confidence} confidence`}
              </Text>

              {suggestion.action !== 'establish' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Apply ${formatWeight(suggestion.suggestedWeightKg, unit)} to every set`}
                  onPress={() => onApplySuggestion(suggestion.suggestedWeightKg)}
                  style={({ pressed }) => [styles.apply, pressed && { opacity: opacity.pressed }]}
                >
                  <Text variant="label" tone="violet">
                    Apply to all sets
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Column headers */}
      <View style={styles.columns}>
        <Text variant="eyebrow" tone="faint" style={styles.colIndex}>
          Set
        </Text>
        <Text variant="eyebrow" tone="faint" style={styles.colPrev}>
          {previousWorkout ? 'Last' : '—'}
        </Text>
        <Text variant="eyebrow" tone="faint" style={styles.colFlex}>
          {unit}
        </Text>
        <Text variant="eyebrow" tone="faint" style={styles.colFlex}>
          Reps
        </Text>
        <Text variant="eyebrow" tone="faint" style={styles.colRpe}>
          RPE
        </Text>
        <View style={styles.colCheck} />
      </View>

      {/* Sets */}
      {workoutExercise.sets.map((set, i) => (
        <SetRow
          key={set.id}
          set={set}
          unit={unit}
          equipment={exercise.equipment}
          previous={previousSets[i] ?? null}
          isPr={prFlags.has(set.id)}
          onChange={(patch) => onUpdateSet(set.id, patch)}
          onToggleComplete={() => onToggleSet(set.id, set.restSeconds ?? 120)}
          onRemove={() => onRemoveSet(set.id)}
        />
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add a set to ${exercise.name}`}
        onPress={onAddSet}
        style={({ pressed }) => [styles.addSet, pressed && { opacity: opacity.pressed }]}
      >
        <Ionicons name="add" size={15} color={color.violetBright} />
        <Text variant="label" tone="violet">
          Add set
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg, marginBottom: space.md },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  headerText: { flex: 1, paddingRight: space.sm },
  equipment: { marginTop: 3 },
  iconButton: {
    width: a11y.minTouch - 12,
    height: a11y.minTouch - 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xs,
  },
  cue: { marginTop: space.sm, fontStyle: 'italic' },
  suggestion: {
    marginTop: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: a11y.minTouch,
  },
  suggestionValue: { flex: 1 },
  rationale: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    gap: 6,
  },
  rationaleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  bullet: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: color.textFaint,
    marginTop: 8,
  },
  rationaleText: { flex: 1 },
  confidence: { marginTop: 2 },
  apply: {
    marginTop: space.sm,
    minHeight: a11y.minTouch,
    justifyContent: 'center',
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.base,
    paddingBottom: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  colIndex: { width: 26, textAlign: 'center' },
  colPrev: { width: 52, textAlign: 'center' },
  colFlex: { flex: 1, textAlign: 'center' },
  colRpe: { width: 52, textAlign: 'center' },
  colCheck: { width: a11y.minTouch - 6 },
  addSet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: a11y.minTouch,
    marginTop: space.xs,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderStyle: 'dashed',
  },
});
