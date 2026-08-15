import { useEffect, useMemo } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { Card, EmptyState, ListRow, Screen, ScreenState, StatBlock, Text } from '@/components/ui';
import { groupHistoryByMonth, historyTotals, listWorkoutHistory, type HistoryEntry } from '@/domain/history';
import { selectCompletedWorkouts, useTrainingStore } from '@/store/trainingStore';
import { formatDate, formatDuration, formatMonthLabel, formatVolume } from '@/utils/format';
import { color, space } from '@/theme';
import type { Unit } from '@/domain/types';

/**
 * HISTORY
 * =======
 * Every completed session, newest first, grouped by the month it happened in.
 *
 * Three rules this screen holds to:
 *
 *   1. **Completed sessions only.** A session still in the logger, or a
 *      recovered draft waiting on Resume/Discard, is not training that happened
 *      yet -- it belongs on Today, where the decision about it lives.
 *   2. **Scannable in one column.** Title, when, and the three numbers a lifter
 *      actually uses to recognise a session (lifts, working sets, volume). Any
 *      more per row and the list stops being a list.
 *   3. **Nothing derived is stored.** Every figure here is recomputed from the
 *      same set-level rows the logger wrote, through the same `src/domain/calc`
 *      functions the rest of the app uses.
 *
 * Reached from Insights and from Today's "Go deeper" tiles, pushed onto the root
 * stack, so plain `router.back()` genuinely returns where the lifter came from.
 */
export default function HistoryScreen() {
  const router = useRouter();

  const workouts = useTrainingStore(useShallow(selectCompletedWorkouts));
  const personalRecords = useTrainingStore((s) => s.personalRecords);
  const profile = useTrainingStore((s) => s.profile);
  const status = useTrainingStore((s) => s.status);
  const loadError = useTrainingStore((s) => s.error);
  const refresh = useTrainingStore((s) => s.refresh);
  const loadFullHistory = useTrainingStore((s) => s.loadFullHistory);

  /*
    Startup loads a bounded window of sessions (`src/domain/workingSet.ts`),
    because the unbounded read grew with a lifter's tenure and ran on every cold
    start. Every other surface works inside a window shorter than that bound;
    this screen is the one that does not -- it is the archive, and it is the
    only place a session from two years ago is supposed to appear.

    So History asks for the rest on entry. `loadFullHistory` is a no-op once the
    set is known complete, which is the common case after the first visit, and
    it extends the list in place rather than flipping the shared load status --
    so the sessions already on screen do not blink out while the rest arrive.
  */
  useEffect(() => {
    void loadFullHistory();
  }, [loadFullHistory]);

  const entries = useMemo(
    () => listWorkoutHistory(workouts, personalRecords),
    [workouts, personalRecords],
  );

  const sections = useMemo(
    () =>
      groupHistoryByMonth(entries).map((month) => ({
        key: month.key,
        title: formatMonthLabel(month.key),
        data: month.entries,
      })),
    [entries],
  );

  const totals = useMemo(() => historyTotals(entries), [entries]);

  const header = {
    // "Finished", not "logged": this list is completed sessions only, and a
    // draft that was logged but never finished never appears in it. Today and
    // Insights use the same word for the same reason (`content/deeperSurfaces`).
    eyebrow: 'Every session you have finished',
    title: 'History',
    onBack: () => router.back(),
  } as const;

  // Same shape as every other data-driven screen: chrome stays put, the body
  // swaps. A loaded store with no profile is something being wrong, not a
  // slower load, so it offers a retry rather than spinning.
  if (status !== 'ready' || !profile) {
    return (
      <Screen scroll={false} {...header}>
        <ScreenState
          phase={status !== 'ready' ? status : 'error'}
          onRetry={() => void refresh()}
          errorMessage={loadError}
          loadingLabel="Reading your training history…"
        />
      </Screen>
    );
  }

  if (entries.length === 0) {
    return (
      <Screen scroll={false} {...header}>
        <EmptyState
          icon="time-outline"
          title="No finished sessions yet"
          body="Sessions land here the moment you finish one. Nothing is backfilled — this list only ever shows training you actually finished."
          actionLabel="Choose a workout"
          onAction={() => router.push('/workout/templates')}
        />
      </Screen>
    );
  }

  const oldest = entries[entries.length - 1];

  return (
    <Screen scroll={false} {...header}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.workoutId}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Card variant="raised" padding="lg" spectral style={styles.summary}>
            <View style={styles.statRow}>
              <StatBlock label="Sessions" value={String(totals.sessions)} tone="violet" />
              <View style={styles.divider} />
              <StatBlock
                label="Volume"
                value={formatVolume(totals.volumeKg, profile.unit)}
                unit={profile.unit}
              />
              <View style={styles.divider} />
              <StatBlock label="Working sets" value={String(totals.workingSets)} />
            </View>
            <Text variant="bodySm" tone="secondary" style={styles.summaryLine}>
              {`Everything you have finished since ${formatDate(oldest.startedAt)}, newest first.`}
            </Text>
          </Card>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <Text variant="eyebrow" tone="muted">
              {section.title}
            </Text>
            <Text variant="eyebrow" tone="faint">
              {`${section.data.length} ${section.data.length === 1 ? 'session' : 'sessions'}`}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <SessionRow
            entry={item}
            unit={profile.unit}
            onPress={() =>
              router.push({ pathname: '/history/[id]', params: { id: item.workoutId } })
            }
          />
        )}
      />
    </Screen>
  );
}

// --- Row -------------------------------------------------------------------

function SessionRow({
  entry,
  unit,
  onPress,
}: {
  entry: HistoryEntry;
  unit: Unit;
  onPress: () => void;
}) {
  const facts = [
    formatDate(entry.startedAt),
    `${entry.exerciseCount} ${entry.exerciseCount === 1 ? 'lift' : 'lifts'}`,
    `${entry.workingSets} ${entry.workingSets === 1 ? 'set' : 'sets'}`,
  ];
  if (entry.durationMinutes != null) facts.push(formatDuration(entry.durationMinutes));
  if (entry.prCount > 0) facts.push(`${entry.prCount} PR`);

  return (
    <View style={styles.row}>
      <ListRow
        title={entry.title}
        subtitle={facts.join(' · ')}
        // A record is the one thing worth spotting from across the list, so it
        // changes the glyph rather than adding a fourth number to the row.
        icon={entry.prCount > 0 ? 'flash' : 'barbell'}
        iconTone={entry.prCount > 0 ? 'cyan' : 'violet'}
        onPress={onPress}
        accessibilityLabel={[
          entry.title,
          facts.join(', '),
          `${formatVolume(entry.volumeKg, unit)} ${unit} of volume`,
          'Opens the full session',
        ].join('. ')}
        style={styles.rowInner}
        trailing={
          <View style={styles.trailing}>
            <View style={styles.volume}>
              <Text variant="numeric" tone="violet">
                {formatVolume(entry.volumeKg, unit)}
              </Text>
              <Text variant="eyebrow" tone="faint">
                {unit}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: space.xxl },
  summary: { marginHorizontal: space.lg, marginBottom: space.base },
  statRow: { flexDirection: 'row' },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.line,
    marginHorizontal: space.md,
  },
  summaryLine: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    lineHeight: 19,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  rowInner: { paddingHorizontal: space.lg },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  volume: { alignItems: 'flex-end' },
});
