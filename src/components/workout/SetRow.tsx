import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { RpeSelector } from './RpeSelector';
import { displayToKg, kgToDisplay, loadIncrementKg } from '@/domain/calc/loadRecommendation';
import { formatWeight } from '@/utils/format';
import { a11y, color, opacity, radius, space } from '@/theme';
import type { Equipment, Unit, WorkoutSet } from '@/domain/types';

export interface SetRowProps {
  set: WorkoutSet;
  unit: Unit;
  equipment: Equipment;
  /** Matching set from the last time this lift was trained, if there was one. */
  previous: WorkoutSet | null;
  isPr: boolean;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onToggleComplete: () => void;
  onRemove: () => void;
}

/**
 * One logged set.
 *
 * Layout is a fixed five-column grid -- index, previous, weight, reps, done --
 * so the eye lands in the same place on every row. The "previous" column is the
 * single most-used piece of information during a session, so it sits directly
 * left of the field you are about to fill in, not buried in a detail sheet.
 */
export const SetRow = memo(function SetRow({
  set,
  unit,
  equipment,
  previous,
  isPr,
  onChange,
  onToggleComplete,
  onRemove,
}: SetRowProps) {
  const increment = loadIncrementKg(equipment, unit);
  const weightDisplay = kgToDisplay(set.weightKg, unit);

  const bump = (deltaSteps: number) => {
    const next = Math.max(0, set.weightKg + deltaSteps * increment);
    onChange({ weightKg: Math.round(next * 100) / 100 });
  };

  const bumpReps = (delta: number) => {
    onChange({ reps: Math.max(0, set.reps + delta) });
  };

  const isWarmup = set.type === 'warmup';

  return (
    <View style={[styles.row, set.completed && styles.rowDone]}>
      {/* Set index / type */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Set ${set.setIndex + 1}, ${isWarmup ? 'warm-up' : 'working set'}. Tap to switch type.`}
        onPress={() => onChange({ type: isWarmup ? 'working' : 'warmup' })}
        onLongPress={onRemove}
        hitSlop={6}
        style={({ pressed }) => [styles.indexCell, pressed && { opacity: opacity.pressed }]}
      >
        <Text variant="numericSm" tone={isWarmup ? 'faint' : 'secondary'}>
          {isWarmup ? 'W' : set.setIndex + 1}
        </Text>
      </Pressable>

      {/* Previous */}
      <View style={styles.previousCell}>
        {previous ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy previous: ${formatWeight(previous.weightKg, unit)} for ${previous.reps} reps`}
            onPress={() => onChange({ weightKg: previous.weightKg, reps: previous.reps })}
            hitSlop={8}
            style={({ pressed }) => pressed && { opacity: opacity.pressed }}
          >
            <Text variant="numericSm" tone="faint">
              {`${Math.round(kgToDisplay(previous.weightKg, unit))}×${previous.reps}`}
            </Text>
          </Pressable>
        ) : (
          <Text variant="numericSm" tone="faint">
            —
          </Text>
        )}
      </View>

      {/* Weight */}
      <ValueCell
        label={`Set ${set.setIndex + 1} weight in ${unit}`}
        value={formatNumber(weightDisplay)}
        onDecrease={() => bump(-1)}
        onIncrease={() => bump(1)}
        highlight={isPr}
      />

      {/* Reps */}
      <ValueCell
        label={`Set ${set.setIndex + 1} reps`}
        value={String(set.reps)}
        onDecrease={() => bumpReps(-1)}
        onIncrease={() => bumpReps(1)}
      />

      {/* RPE */}
      <View style={styles.rpeCell}>
        <RpeSelector
          value={set.rpe}
          onChange={(rpe) => onChange({ rpe })}
          label={`Set ${set.setIndex + 1} RPE`}
        />
      </View>

      {/* Complete */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`Mark set ${set.setIndex + 1} ${set.completed ? 'incomplete' : 'complete'}`}
        accessibilityState={{ checked: set.completed }}
        onPress={onToggleComplete}
        hitSlop={6}
        style={({ pressed }) => [
          styles.checkCell,
          set.completed && styles.checkCellDone,
          pressed && { opacity: opacity.pressed },
        ]}
      >
        <Ionicons
          name={set.completed ? 'checkmark' : 'ellipse-outline'}
          size={set.completed ? 20 : 16}
          color={set.completed ? color.textOnAccent : color.textFaint}
        />
      </Pressable>

      {isPr ? (
        <View style={styles.prFlag} accessible accessibilityLabel="Personal record on this set">
          <Ionicons name="flash" size={10} color={color.textOnAccent} />
        </View>
      ) : null}
    </View>
  );
});

function ValueCell({
  label,
  value,
  onDecrease,
  onIncrease,
  highlight,
}: {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  highlight?: boolean;
}) {
  return (
    <View style={styles.valueCell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        onPress={onDecrease}
        hitSlop={{ top: 12, bottom: 12, left: 6, right: 2 }}
        style={({ pressed }) => [styles.nudge, pressed && { opacity: opacity.pressed }]}
      >
        <Ionicons name="chevron-back" size={13} color={color.textFaint} />
      </Pressable>

      <View
        style={styles.valueBox}
        accessible
        accessibilityLabel={label}
        accessibilityValue={{ text: value }}
      >
        <Text variant="numeric" tone={highlight ? 'violet' : 'primary'}>
          {value}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        onPress={onIncrease}
        hitSlop={{ top: 12, bottom: 12, left: 2, right: 6 }}
        style={({ pressed }) => [styles.nudge, pressed && { opacity: opacity.pressed }]}
      >
        <Ionicons name="chevron-forward" size={13} color={color.textFaint} />
      </Pressable>
    </View>
  );
}

function formatNumber(n: number): string {
  return Math.abs(n % 1) < 0.049 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

/** Exported so the logger can convert typed values consistently. */
export { displayToKg };

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: a11y.minTouch + 4,
    paddingVertical: space.xs,
    gap: space.xs,
  },
  rowDone: {
    backgroundColor: 'rgba(122,59,255,0.06)',
    borderRadius: radius.sm,
  },
  indexCell: {
    width: 26,
    height: a11y.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previousCell: { width: 52, alignItems: 'center' },
  valueCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.inset,
    borderRadius: radius.sm,
    height: a11y.minTouch - 6,
  },
  nudge: { width: 22, alignItems: 'center', justifyContent: 'center', height: '100%' },
  valueBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rpeCell: { width: 52 },
  checkCell: {
    width: a11y.minTouch - 6,
    height: a11y.minTouch - 6,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.inset,
  },
  checkCellDone: { backgroundColor: color.violetBright },
  prFlag: {
    position: 'absolute',
    left: 18,
    top: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.cyanBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
