import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, Screen, ScreenState, SectionHeader, StatBlock, Text } from '@/components/ui';
import { buildSessionDetail, type HistoryExerciseLine, type HistorySetLine } from '@/domain/history';
import { useTrainingStore } from '@/store/trainingStore';
import { formatDate, formatDuration, formatRpe, formatTimeOfDay, formatVolume, formatWeight } from '@/utils/format';
import { color, radius, space } from '@/theme';
import { SET_TYPE_COPY, setTypeMark } from '@/content/setTypes';
import type { PersonalRecord, Unit } from '@/domain/types';

/**
 * SESSION DETAIL
 * ==============
 * One completed session, exactly as it was logged.
 *
 * Read-only by design. This screen answers "what did I actually do?", and the
 * answer is worth nothing if the record can drift after the fact -- editing a
 * finished session is a separate decision with its own consequences for volume,
 * records and readiness, and it is not made here.
 *
 * Warm-ups and sets left unticked are shown rather than hidden, marked as not
 * counting toward volume. A review screen that quietly drops the parts that did
 * not "count" is showing a tidier session than the one that happened.
 */
export default function SessionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const workouts = useTrainingStore((s) => s.workouts);
  const exerciseById = useTrainingStore((s) => s.exerciseById);
  const personalRecords = useTrainingStore((s) => s.personalRecords);
  const profile = useTrainingStore((s) => s.profile);
  const status = useTrainingStore((s) => s.status);
  const loadError = useTrainingStore((s) => s.error);
  const refresh = useTrainingStore((s) => s.refresh);
  const historyComplete = useTrainingStore((s) => s.historyComplete);
  const loadFullHistory = useTrainingStore((s) => s.loadFullHistory);

  const workout = useMemo(
    () => workouts.find((w) => w.id === id && w.status === 'completed') ?? null,
    [workouts, id],
  );

  /*
    Reached from the History list this is already loaded, because that screen
    loads the full archive on entry. A deep link is the case this exists for:
    startup holds a bounded window (`src/domain/workingSet.ts`), so a link
    straight to a session older than that window would find nothing in the store
    and render "not found" for a session that exists.

    Asking only when the lookup actually missed keeps the common path free --
    and `loadFullHistory` is itself a no-op once the set is complete, so a
    genuinely deleted or foreign id costs one fetch, not one per render.
  */
  useEffect(() => {
    if (!workout && !historyComplete) void loadFullHistory();
  }, [workout, historyComplete, loadFullHistory]);

  const detail = useMemo(
    () => (workout ? buildSessionDetail(workout, exerciseById, personalRecords) : null),
    [workout, exerciseById, personalRecords],
  );

  const back = () => router.back();

  if (status !== 'ready' || !profile) {
    return (
      <Screen scroll={false} title="Session" onBack={back}>
        <ScreenState
          phase={status !== 'ready' ? status : 'error'}
          onRetry={() => void refresh()}
          errorMessage={loadError}
          loadingLabel="Opening the session…"
        />
      </Screen>
    );
  }

  if (!workout || !detail) {
    return (
      <Screen title="Session not found" onBack={back}>
        <Card style={styles.gutter}>
          <Text variant="body" tone="secondary">
            That session is not in your history. It may have been discarded before it was finished.
          </Text>
          <Button label="Back to History" style={styles.spacer} onPress={back} />
        </Card>
      </Screen>
    );
  }

  const { entry, exercises, records, reflection, sessionRating } = detail;
  const uncounted = exercises.some((e) => e.sets.some((s) => !s.countsTowardVolume));

  return (
    <Screen
      eyebrow={`${formatDate(entry.startedAt)} · ${formatTimeOfDay(entry.startedAt)}`}
      title={entry.title}
      onBack={back}
    >
      {/* Headline numbers -- the same four the post-session summary opens with,
          so a session reads the same way a week later as it did on the day. */}
      <Card variant="raised" padding="xl" spectral style={styles.gutter}>
        <View style={styles.statRow}>
          <StatBlock
            label="Volume"
            value={formatVolume(entry.volumeKg, profile.unit)}
            unit={profile.unit}
            tone="violet"
          />
          <StatBlock label="Working sets" value={String(entry.workingSets)} />
        </View>
        <View style={[styles.statRow, styles.statRowSecond]}>
          <StatBlock label="Reps" value={String(entry.totalReps)} />
          <StatBlock label="Duration" value={formatDuration(entry.durationMinutes)} />
        </View>
      </Card>

      {records.length > 0 ? (
        <>
          <SectionHeader title="Records set" eyebrow="Personal best" />
          <Card style={styles.gutter} padding="base">
            {records.map((pr, i) => (
              <View key={pr.id} style={[styles.prRow, i > 0 && styles.divided]}>
                <View style={styles.prIcon}>
                  <Ionicons name="flash" size={14} color={color.textOnAccent} />
                </View>
                <View style={styles.prText}>
                  <Text variant="title3" numberOfLines={1}>
                    {exerciseById.get(pr.exerciseId)?.name ?? 'Exercise'}
                  </Text>
                  <Text variant="bodySm" tone="faint">
                    {describeRecord(pr, profile.unit)}
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

      <SectionHeader
        title="What you lifted"
        eyebrow={`${exercises.length} ${exercises.length === 1 ? 'lift' : 'lifts'}`}
      />

      {exercises.length === 0 ? (
        <Card style={styles.gutter}>
          <Text variant="body" tone="secondary">
            This session was finished without any exercises recorded against it.
          </Text>
        </Card>
      ) : (
        exercises.map((line) => (
          <ExerciseCard key={line.id} line={line} unit={profile.unit} />
        ))
      )}

      {uncounted ? (
        <Text variant="bodySm" tone="faint" style={styles.legend}>
          Warm-ups and sets you did not tick off are shown here but left out of volume, working sets
          and reps — the same rule the rest of Repello counts by.
        </Text>
      ) : null}

      {reflection || sessionRating != null ? (
        <>
          <SectionHeader title="How it felt" eyebrow="Your words" />
          <Card style={styles.gutter} padding="lg">
            {sessionRating != null ? (
              <View
                style={styles.ratingRow}
                accessible
                accessibilityLabel={`Session quality: ${sessionRating} out of 5`}
              >
                <Text variant="eyebrow" tone="faint">
                  Session quality
                </Text>
                <View style={styles.ratingDots}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <View
                      key={value}
                      style={[styles.ratingDot, value <= sessionRating && styles.ratingDotOn]}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {reflection ? (
              <Text variant="body" tone="secondary" style={styles.reflection}>
                {reflection}
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

// --- Records ----------------------------------------------------------------

/**
 * One line of context under a record.
 *
 * Every field except `value` is nullable on `PersonalRecord`, so each clause is
 * added only when the data behind it is actually there -- a missing rep count
 * reads as a shorter sentence, never as "0 reps".
 */
function describeRecord(pr: PersonalRecord, unit: Unit): string {
  const load = pr.weightKg != null ? formatWeight(pr.weightKg, unit) : null;

  switch (pr.kind) {
    case 'e1rm':
      if (load && pr.reps != null) return `Estimated 1RM from ${load} × ${pr.reps}`;
      return 'Estimated 1RM';
    case 'weight':
      return pr.reps != null ? `Heaviest set: ${pr.reps} reps` : 'Heaviest set';
    case 'reps':
      return load ? `Most reps at ${load}` : 'Most reps';
    case 'volume':
      return 'Most volume in a session';
  }
}

// --- Exercise ---------------------------------------------------------------

/** Applied to every column heading in the set table. See the note at its use. */
const COLUMN_LABEL = { numberOfLines: 1, maxFontSizeMultiplier: 1.2 } as const;

function ExerciseCard({ line, unit }: { line: HistoryExerciseLine; unit: Unit }) {
  return (
    <Card style={styles.gutterCard} padding="lg">
      <View style={styles.exerciseHead}>
        <Text variant="title3" numberOfLines={2} style={styles.exerciseName}>
          {line.name}
        </Text>
        <Text variant="numericSm" tone="violet">
          {formatVolume(line.volumeKg, unit)}
          <Text variant="eyebrow" tone="faint">{` ${unit}`}</Text>
        </Text>
      </View>

      {line.topSet ? (
        <View style={styles.chipRow}>
          {/* An unloaded lift reads as reps, not as "0 kg × 12" -- a bodyweight
              set is not a set with no load, and saying so makes it look broken. */}
          <Chip
            label={
              line.topSet.weightKg > 0
                ? `Top ${formatWeight(line.topSet.weightKg, unit)} × ${line.topSet.reps}`
                : `Top set ${line.topSet.reps} reps`
            }
            tone="violet"
            accessibilityLabel={
              line.topSet.weightKg > 0
                ? `Top set: ${formatWeight(line.topSet.weightKg, unit)} for ${line.topSet.reps} reps`
                : `Top set: ${line.topSet.reps} reps, bodyweight`
            }
          />
          <Chip label={`${line.workingSets} working`} />
        </View>
      ) : (
        <View style={styles.chipRow}>
          <Chip label="Nothing counted" />
        </View>
      )}

      {/*
        Column headers are fixed-width labels over fixed-width cells, so they get
        a tighter scaling cap than body text: at the accessibility sizes the
        default 1.6x broke "REPS" across two lines as "REP / S" while the numbers
        underneath stayed put (seen on an iPhone SE at accessibility-extra-large).
        The values still scale to 1.6x -- it is only the headings that are pinned.
      */}
      <View style={styles.columns}>
        <Text variant="eyebrow" tone="faint" style={styles.setCell} {...COLUMN_LABEL}>
          Set
        </Text>
        <Text variant="eyebrow" tone="faint" style={styles.loadCell} {...COLUMN_LABEL}>
          {`Load (${unit})`}
        </Text>
        <Text variant="eyebrow" tone="faint" style={styles.repCell} {...COLUMN_LABEL}>
          Reps
        </Text>
        <Text variant="eyebrow" tone="faint" style={styles.rpeCell} {...COLUMN_LABEL}>
          RPE
        </Text>
        <View style={styles.statusCell} />
      </View>

      {line.sets.map((set) => (
        <SetLine key={set.id} set={set} unit={unit} />
      ))}

      {line.notes ? (
        <Text variant="bodySm" tone="secondary" style={styles.notes}>
          {line.notes}
        </Text>
      ) : null}
    </Card>
  );
}

function SetLine({ set, unit }: { set: HistorySetLine; unit: Unit }) {
  const mark = setTypeMark(set.type, set.position);
  const tone = set.countsTowardVolume ? 'primary' : 'faint';
  const disposition = set.countsTowardVolume
    ? 'Counted toward volume'
    : set.completed
      ? 'Completed, not counted toward volume'
      : 'Not completed';

  return (
    <View
      style={styles.setRow}
      accessible
      accessibilityLabel={[
        `Set ${set.position}, ${SET_TYPE_COPY[set.type].spoken}`,
        `${formatWeight(set.weightKg, unit)} for ${set.reps} reps`,
        set.rpe == null ? 'RPE not recorded' : `RPE ${set.rpe}`,
        disposition,
      ].join('. ')}
    >
      <Text variant="numericSm" tone={set.countsTowardVolume ? 'secondary' : 'faint'} style={styles.setCell}>
        {mark}
      </Text>
      <Text variant="numeric" tone={tone} style={styles.loadCell} numeric>
        {formatWeight(set.weightKg, unit, false)}
      </Text>
      <Text variant="numeric" tone={tone} style={styles.repCell} numeric>
        {String(set.reps)}
      </Text>
      <Text variant="numericSm" tone="muted" style={styles.rpeCell} numeric>
        {formatRpe(set.rpe)}
      </Text>
      <View style={styles.statusCell}>
        <Ionicons
          name={set.completed ? 'checkmark' : 'remove'}
          size={14}
          color={set.countsTowardVolume ? color.violetBright : color.textFaint}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg },
  gutterCard: { marginHorizontal: space.lg, marginBottom: space.md },
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
  exerciseHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  exerciseName: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.md },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 34,
    paddingVertical: space.xs,
  },
  // Holds two characters of data at most ("W" or a set number), but has to fit
  // the word "Set" above it at the accessibility text sizes.
  setCell: { width: 36 },
  loadCell: { flex: 1, textAlign: 'right' },
  repCell: { width: 46, textAlign: 'right' },
  rpeCell: { width: 34, textAlign: 'right' },
  statusCell: { width: 20, alignItems: 'flex-end' },
  notes: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    lineHeight: 19,
  },
  legend: {
    marginHorizontal: space.lg,
    marginTop: space.xs,
    lineHeight: 18,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ratingDots: { flexDirection: 'row', gap: space.xs },
  ratingDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: color.inset,
  },
  ratingDotOn: { backgroundColor: color.violetBright },
  reflection: { marginTop: space.md, lineHeight: 21 },
});
