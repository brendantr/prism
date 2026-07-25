import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearSpectrum, Text } from '@/components/ui';
import { useActiveWorkoutStore } from '@/store/activeWorkoutStore';
import { formatClock } from '@/utils/format';
import { a11y, color, opacity, radius, space } from '@/theme';

/**
 * Rest timer.
 *
 * Deliberately a bar, not a full-screen takeover: you need to see the next set
 * while you rest. It counts down, buzzes once at zero, and then keeps counting
 * UP in coral so an eight-minute "rest" cannot quietly pass for two.
 */
export function RestTimerBar() {
  const timer = useActiveWorkoutStore((s) => s.restTimer);
  const adjustRest = useActiveWorkoutStore((s) => s.adjustRest);
  const clearRest = useActiveWorkoutStore((s) => s.clearRest);

  const [remaining, setRemaining] = useState(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!timer) return;
    firedRef.current = false;

    const tick = () => {
      const secondsLeft = (timer.endsAt - Date.now()) / 1000;
      setRemaining(secondsLeft);
      if (secondsLeft <= 0 && !firedRef.current) {
        firedRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [timer]);

  if (!timer) return null;

  const overdue = remaining <= 0;
  const progress = overdue ? 1 : 1 - remaining / Math.max(1, timer.durationSeconds);
  const display = formatClock(Math.abs(remaining));

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <LinearSpectrum height={2} progress={progress} tone={overdue ? 'warm' : 'brand'} />

      <View style={styles.row}>
        <View style={styles.labelGroup}>
          <Text variant="eyebrow" tone={overdue ? 'coral' : 'muted'}>
            {overdue ? 'Rest over' : 'Resting'}
          </Text>
          <Text
            variant="numericLg"
            tone={overdue ? 'coral' : 'primary'}
            accessibilityLabel={`${overdue ? 'Over rest by' : 'Rest remaining'} ${display}`}
          >
            {overdue ? `+${display}` : display}
          </Text>
        </View>

        <View style={styles.controls}>
          <TimerButton label="Subtract 15 seconds" icon="remove" onPress={() => adjustRest(-15)} />
          <TimerButton label="Add 15 seconds" icon="add" onPress={() => adjustRest(15)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip rest"
            onPress={clearRest}
            hitSlop={8}
            style={({ pressed }) => [styles.skip, pressed && { opacity: opacity.pressed }]}
          >
            <Text variant="label" tone="violet">
              Skip
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TimerButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: 'add' | 'remove';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.timerButton, pressed && { opacity: opacity.pressed }]}
    >
      <Ionicons name={icon} size={16} color={color.text} />
      <Text variant="numericSm" tone="secondary">
        15
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: color.cardRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  labelGroup: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  timerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: a11y.minTouch,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: color.inset,
  },
  skip: {
    height: a11y.minTouch,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
});
