import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, LinearSpectrum, Screen, SectionHeader, StatBlock, Text } from '@/components/ui';
import { muscleDistribution, workoutRepCount, workoutVolume, workoutWorkingSetCount } from '@/domain/calc/volume';
import { bestsFromHistory, detectWorkoutPrs } from '@/domain/calc/prs';
import { workoutDurationMinutes } from '@/domain/history';
import { MUSCLE_META } from '@/domain/muscles';
import { selectCompletedWorkouts, useTrainingStore } from '@/store/trainingStore';
import { useShallow } from 'zustand/react/shallow';
import { formatDuration, formatVolume } from '@/utils/format';
import { a11y, color, opacity, radius, space, type as typeTokens } from '@/theme';

/**
 * WORKOUT SUMMARY
 * ===============
 * Shown immediately after finishing. Three jobs, in order:
 *   1. Bank the win -- volume, sets, and any records, up front.
 *   2. Show where the work landed (muscle distribution).
 *   3. Capture the subjective half before it evaporates: a 1-5 rating and one
 *      line of reflection. That text is the only training data a spreadsheet
 *      cannot reconstruct, so PRism asks for it while the session is fresh.
 */
export default function WorkoutSummaryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const workouts = useTrainingStore((s) => s.workouts);
  const history = useTrainingStore(useShallow(selectCompletedWorkouts));
  const exerciseById = useTrainingStore((s) => s.exerciseById);
  const profile = useTrainingStore((s) => s.profile);
  const upsertWorkout = useTrainingStore((s) => s.upsertWorkout);

  const workout = useMemo(() => workouts.find((w) => w.id === id) ?? null, [workouts, id]);

  const [rating, setRating] = useState(workout?.sessionRating ?? 0);
  const [reflection, setReflection] = useState(workout?.reflection ?? '');
  const [saved, setSaved] = useState(false);

  const stats = useMemo(() => {
    if (!workout) return null;
    // Shared with History, so a session's duration is measured one way only.
    const durationMinutes = workoutDurationMinutes(workout);

    // Compare against every OTHER completed session so the current one does not
    // count itself as its own precedent.
    const priorHistory = history.filter((w) => w.id !== workout.id);
    const prs = detectWorkoutPrs(workout, bestsFromHistory(priorHistory));

    return {
      volume: workoutVolume(workout),
      sets: workoutWorkingSetCount(workout),
      reps: workoutRepCount(workout),
      durationMinutes,
      distribution: muscleDistribution([workout], exerciseById),
      prs,
    };
  }, [workout, history, exerciseById]);

  if (!workout || !stats || !profile) {
    return (
      <Screen title="Session not found">
        <Card style={styles.gutter}>
          <Text variant="body" tone="secondary">
            That workout is no longer available.
          </Text>
          <Button label="Back to Today" style={styles.spacer} onPress={() => router.replace('/')} />
        </Card>
      </Screen>
    );
  }

  const topMuscles = stats.distribution.slice(0, 6);
  const maxVolume = topMuscles[0]?.volumeKg ?? 1;

  const handleSave = async () => {
    await upsertWorkout({
      ...workout,
      sessionRating: rating > 0 ? rating : null,
      reflection: reflection.trim().length > 0 ? reflection.trim() : null,
    });
    setSaved(true);
    router.replace('/');
  };

  return (
    <Screen eyebrow="Session complete" title={workout.title} bottomInset={space.huge}>
      {/* Headline numbers */}
      <Card variant="raised" padding="xl" spectral style={styles.gutter}>
        <View style={styles.statRow}>
          <StatBlock
            label="Volume"
            value={formatVolume(stats.volume, profile.unit)}
            unit={profile.unit}
            tone="violet"
          />
          <StatBlock label="Working sets" value={String(stats.sets)} />
        </View>
        <View style={[styles.statRow, styles.statRowSecond]}>
          <StatBlock label="Reps" value={String(stats.reps)} />
          <StatBlock label="Duration" value={formatDuration(stats.durationMinutes)} />
        </View>
      </Card>

      {/* Records */}
      {stats.prs.length > 0 ? (
        <>
          <SectionHeader title="New records" eyebrow="Personal best" />
          <Card style={styles.gutter} padding="base">
            {stats.prs.map((pr, i) => (
              <View key={`${pr.exerciseId}-${pr.kind}`} style={[styles.prRow, i > 0 && styles.divided]}>
                <View style={styles.prIcon}>
                  <Ionicons name="flash" size={14} color={color.textOnAccent} />
                </View>
                <View style={styles.prText}>
                  {/*
                    Same pattern as ListRow, Progress, Plans, and Today's
                    SessionCard: a name sharing a row with a trailing numeric
                    value, capped at one line. "Barbell Bench Press" clipped
                    to "Barbell Bench P…" at accessibility-extra-large,
                    confirmed on-device -- on the one screen whose entire job
                    is telling a lifter which record they just set.
                  */}
                  <Text variant="title3" numberOfLines={2}>
                    {exerciseById.get(pr.exerciseId)?.name ?? 'Exercise'}
                  </Text>
                  <Text variant="bodySm" tone="faint">
                    {pr.kind === 'e1rm'
                      ? `Estimated 1RM from ${formatVolume(pr.weightKg, profile.unit)} ${profile.unit} × ${pr.reps}`
                      : `Heaviest set: ${pr.reps} reps`}
                  </Text>
                </View>
                <Text variant="numeric" tone="cyan">
                  {formatVolume(pr.value, profile.unit)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* Muscle distribution */}
      <SectionHeader title="Where the work landed" eyebrow="Distribution" />
      <Card style={styles.gutter} padding="lg">
        {topMuscles.map((m) => (
          <View key={m.muscle} style={styles.distRow}>
            {/*
              Two different failures in one row, two different fixes. The
              label is real content ("Front Delts" clipped to "Front D…" at
              accessibility-extra-large) so it gets the same numberOfLines={2}
              fix as every other title this session. The value is a number,
              not prose -- letting IT wrap is worse than letting it clip,
              since "1.0" broke across two lines as "1." / "0", which reads as
              a different, wrong number rather than an incomplete one. It
              keeps one line and shrinks instead, the same
              numberOfLines={1} + adjustsFontSizeToFit pattern StatBlock
              already uses for exactly this "number in a narrow column" case.
            */}
            <Text variant="label" tone="secondary" style={styles.distLabel} numberOfLines={2}>
              {MUSCLE_META[m.muscle].label}
            </Text>
            <View style={styles.distTrack}>
              <LinearSpectrum height={6} progress={m.volumeKg / maxVolume} rounded />
            </View>
            <Text
              variant="numericSm"
              tone="muted"
              style={styles.distValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {m.sets.toFixed(1)}
            </Text>
          </View>
        ))}
        <Text variant="bodySm" tone="faint" style={styles.distNote}>
          Effective sets — a lift counts fully for the muscles it drives and 40% for the ones
          assisting.
        </Text>
      </Card>

      {/* Reflection */}
      <SectionHeader title="How did it feel?" eyebrow="Session reflection" />
      <Card style={styles.gutter} padding="lg">
        <Text variant="eyebrow" tone="faint">
          Session quality
        </Text>
        <View style={styles.ratingRow} accessibilityRole="radiogroup">
          {[1, 2, 3, 4, 5].map((value) => {
            const selected = rating >= value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: rating === value }}
                accessibilityLabel={`Rate this session ${value} out of 5`}
                onPress={() => setRating(value)}
                style={({ pressed }) => [
                  styles.ratingDot,
                  selected && styles.ratingDotOn,
                  pressed && { opacity: opacity.pressed },
                ]}
              >
                <Text variant="numericSm" tone={selected ? 'onAccent' : 'faint'}>
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text variant="eyebrow" tone="faint" style={styles.reflectionLabel}>
          One line for future you
        </Text>
        <TextInput
          value={reflection}
          onChangeText={setReflection}
          placeholder="Bar speed, aches, what you'd change next time…"
          placeholderTextColor={color.textFaint}
          multiline
          style={styles.reflectionInput}
          accessibilityLabel="Session reflection notes"
          maxLength={280}
        />
        <Text variant="eyebrow" tone="faint" style={styles.counter}>
          {`${reflection.length}/280`}
        </Text>
      </Card>

      <View style={styles.actions}>
        <Button
          label={saved ? 'Saved' : 'Save and finish'}
          icon="checkmark"
          onPress={handleSave}
          fullWidth
        />
        <Button label="Skip for now" variant="ghost" size="sm" onPress={() => router.replace('/')} fullWidth />
      </View>

      <View style={styles.chipRow}>
        <Chip label={`${workout.exercises.length} lifts`} />
        <Chip label={`${stats.sets} sets`} />
        {stats.prs.length > 0 ? <Chip label={`${stats.prs.length} PR`} tone="cyan" /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg },
  spacer: { marginTop: space.base },
  statRow: { flexDirection: 'row', gap: space.base },
  statRowSecond: {
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  prIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: color.cyanBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prText: { flex: 1 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  distLabel: { width: 92 },
  distTrack: {
    flex: 1,
    height: 6,
    backgroundColor: color.inset,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  // A little wider than the value itself needs at default text size, so the
  // shrink-to-fit above has real headroom before it has to shrink at all.
  distValue: { width: 40, textAlign: 'right' },
  distNote: { marginTop: space.xs, lineHeight: 18 },
  ratingRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  ratingDot: {
    flex: 1,
    height: a11y.minTouch,
    borderRadius: radius.sm,
    backgroundColor: color.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingDotOn: { backgroundColor: color.violetBright },
  reflectionLabel: { marginTop: space.lg },
  reflectionInput: {
    ...(typeTokens.body as object),
    color: color.text,
    backgroundColor: color.inset,
    borderRadius: radius.sm,
    padding: space.base,
    marginTop: space.sm,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  counter: { marginTop: space.xs, textAlign: 'right' },
  actions: { marginHorizontal: space.lg, marginTop: space.xxl, gap: space.sm },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.lg,
  },
});
