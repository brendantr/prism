import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { Button, Card, Chip, Screen, ScreenState, SectionHeader, Text } from '@/components/ui';
import { CheckInPrompt } from '@/components/today/CheckInPrompt';
import { QuickAccess } from '@/components/today/QuickAccess';
import { ReadinessCard } from '@/components/today/ReadinessCard';
import { SessionCard } from '@/components/today/SessionCard';
import { TodayHero } from '@/components/today/TodayHero';
import { WeekCard } from '@/components/today/WeekCard';
import {
  BAND_COPY,
  INSUFFICIENT_COPY,
  computeReadiness,
  completedThisWeek,
  estimateRecovery,
  volumeInWindow,
} from '@/domain/calc';
import { estimateDayMinutes, lastSessionForDay, resolveTodaySession, weekCells } from '@/domain/schedule';
import { MUSCLE_META } from '@/domain/muscles';
import {
  selectCompletedWorkouts,
  selectLatestCheckIn,
  selectTodaysCheckIn,
  useTrainingStore,
} from '@/store/trainingStore';
import {
  selectCompletedSetCount,
  selectTotalSetCount,
  useActiveWorkoutStore,
} from '@/store/activeWorkoutStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { formatDate, formatRelativeDay, formatVolume } from '@/utils/format';
import { isDemoMode } from '@/data/repository';
import { color, space } from '@/theme';

/**
 * TODAY
 * =====
 * Summary first, then one action, then depth on scroll.
 *
 *   1. `TodayHero`     where do I stand -- readiness, sessions, volume, up next
 *   2. `SessionCard`   the screen's single dominant action
 *   3. Readiness       the score's full reasoning, and the input that sharpens it
 *   4. Consistency     the week's rhythm
 *   5. Recovery / PRs  context worth scrolling for, not worth opening on
 *   6. `QuickAccess`   the deeper surfaces that are not in the tab bar
 *
 * The hero deliberately restates numbers that appear in full further down. That
 * repetition is the point: the summary is readable in a glance at the top, and
 * the explanation stays where it belongs instead of being hoisted above the fold.
 *
 * No section header sits between the hero and the session card, so the state
 * block and the start button share the first screenful.
 */
export default function TodayScreen() {
  const router = useRouter();
  const status = useTrainingStore((s) => s.status);
  const loadError = useTrainingStore((s) => s.error);
  const refresh = useTrainingStore((s) => s.refresh);
  const profile = useTrainingStore((s) => s.profile);
  const activeRoutine = useTrainingStore((s) => s.activeRoutine);
  const exerciseById = useTrainingStore((s) => s.exerciseById);
  const personalRecords = useTrainingStore((s) => s.personalRecords);
  const completed = useTrainingStore(useShallow(selectCompletedWorkouts));
  const latestCheckIn = useTrainingStore(selectLatestCheckIn);
  const todaysCheckIn = useTrainingStore(selectTodaysCheckIn);

  const activeWorkout = useActiveWorkoutStore((s) => s.workout);
  const startWorkout = useActiveWorkoutStore((s) => s.start);
  const draftPendingReview = useActiveWorkoutStore((s) => s.draftPendingReview);
  const resumeDraft = useActiveWorkoutStore((s) => s.resumeDraft);
  const discardDraft = useActiveWorkoutStore((s) => s.discard);
  const draftCompletedSets = useActiveWorkoutStore(selectCompletedSetCount);
  const draftTotalSets = useActiveWorkoutStore(selectTotalSetCount);

  const now = useMemo(() => new Date(), []);

  const today = useMemo(
    () => resolveTodaySession(activeRoutine, completed, exerciseById, now),
    [activeRoutine, completed, exerciseById, now],
  );

  const recovery = useMemo(
    () => estimateRecovery(completed, exerciseById, now),
    [completed, exerciseById, now],
  );

  const readiness = useMemo(() => {
    if (!profile) return null;
    return computeReadiness({
      profile,
      workouts: completed,
      recovery,
      targetMuscles: today?.targetMuscles ?? [],
      latestCheckIn,
      now,
    });
  }, [profile, completed, recovery, today, latestCheckIn, now]);

  const week = useMemo(
    () => weekCells(profile, activeRoutine, completed, now),
    [profile, activeRoutine, completed, now],
  );

  const volume = useMemo(() => {
    const thisWeek = volumeInWindow(completed, now, 7);
    const previousWeek = volumeInWindow(completed, now, 14) - thisWeek;
    const change = previousWeek > 0 ? (thisWeek - previousWeek) / previousWeek : 0;
    return {
      thisWeek,
      weeklyAverage: volumeInWindow(completed, now, 28) / 4,
      delta:
        previousWeek > 0
          ? {
              text: `${Math.abs(Math.round(change * 100))}%`,
              direction: (change > 0.02 ? 'up' : change < -0.02 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
            }
          : undefined,
    };
  }, [completed, now]);

  // Hoisted so the hero and the week card cannot disagree about the same figure.
  const sessionsDone = useMemo(() => completedThisWeek(completed, now), [completed, now]);

  const streakWeeks = useMemo(() => countStreakWeeks(completed, profile?.trainingDaysPerWeek ?? 3, now), [completed, profile, now]);

  const recentPrs = useMemo(
    () => [...personalRecords].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt)).slice(0, 3),
    [personalRecords],
  );

  const fatigued = useMemo(
    () => recovery.filter((r) => r.readiness < 0.55).sort((a, b) => a.readiness - b.readiness).slice(0, 3),
    [recovery],
  );

  // Today uses the same primitive as every other screen, so the three states
  // read identically wherever the lifter meets them.
  //
  // The header is the one thing that cannot match: it greets them by name, and
  // the name lives in the profile that has not arrived yet. The greeting shows
  // regardless -- it comes from the clock -- and the name appears once it is
  // genuinely known rather than being guessed at.
  if (status !== 'ready' || !profile) {
    return (
      <Screen scroll={false} eyebrow={greeting(now)}>
        <ScreenState
          // Loaded but no profile is not "still loading" -- it is something
          // being wrong, and it should offer a retry rather than spin forever.
          phase={status !== 'ready' ? status : 'error'}
          onRetry={() => void refresh()}
          errorMessage={loadError}
          loadingLabel="Reading your training history…"
        />
      </Screen>
    );
  }

  const handleStart = () => {
    if (activeWorkout) {
      router.push('/workout/active');
      return;
    }
    if (!today) return;
    startWorkout({ profileId: profile.id, title: today.day.name, routineDay: today.day });
    router.push('/workout/active');
  };

  return (
    <Screen eyebrow={greeting(now)} title={profile.displayName.split(' ')[0]}>
      {isDemoMode() ? (
        <View style={styles.demoBanner}>
          <Chip label="Demo data" tone="cyan" icon="flask" />
          <Text variant="bodySm" tone="faint" style={styles.demoText}>
            8 weeks of seeded training. Log a real session and it saves on this device.
          </Text>
        </View>
      ) : null}

      {activeWorkout && draftPendingReview ? (
        <Card variant="raised" style={styles.draftCard} padding="base">
          <Text variant="eyebrow" tone="cyan">
            Recovered session
          </Text>
          <Text variant="title3" style={styles.draftTitle}>
            {activeWorkout.title}
          </Text>
          <Text variant="bodySm" tone="faint">
            {`Started ${formatRelativeDay(activeWorkout.startedAt).toLowerCase()} · ${draftCompletedSets}/${draftTotalSets} sets logged`}
          </Text>
          <Text variant="bodySm" tone="secondary" style={styles.draftBody}>
            PRism found this workout still in progress after the app was closed. Resume it, or discard
            the draft.
          </Text>
          <View style={styles.draftActions}>
            <Button
              label="Resume workout"
              onPress={() => {
                resumeDraft();
                router.push('/workout/active');
              }}
              style={styles.draftActionButton}
            />
            <Button
              label="Discard draft"
              variant="danger"
              onPress={() => {
                Alert.alert('Discard this draft?', 'Nothing you logged will be saved.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Discard', style: 'destructive', onPress: () => discardDraft() },
                ]);
              }}
              style={styles.draftActionButton}
            />
          </View>
        </Card>
      ) : activeWorkout ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resume your workout in progress"
          onPress={() => router.push('/workout/active')}
          style={styles.resume}
        >
          <View style={styles.resumeDot} />
          <Text variant="label" tone="cyan" style={styles.resumeText}>
            {`Session in progress — ${activeWorkout.title}`}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={color.cyanBright} />
        </Pressable>
      ) : null}

      <TodayHero
        dateLabel={formatDate(now.toISOString())}
        readinessScore={readiness?.score ?? null}
        readinessBand={
          readiness?.band ? BAND_COPY[readiness.band].title : INSUFFICIENT_COPY.title
        }
        sessionsDone={sessionsDone}
        sessionsTarget={profile.trainingDaysPerWeek}
        volume={formatVolume(volume.thisWeek, profile.unit)}
        volumeUnit={profile.unit}
        volumeDelta={volume.delta}
        upNext={today ? (today.reason === 'rest_day' ? 'Rest day' : today.day.name) : 'No plan active'}
        upNextDetail={
          today
            ? `${today.day.exercises.length} lifts · ~${estimateDayMinutes(today.day)}m`
            : 'Pick a plan, or log an open session'
        }
      />

      <View style={styles.heroGap} />

      {today ? (
        <SessionCard
          day={today.day}
          reason={today.reason}
          targetMuscles={today.targetMuscles}
          exerciseById={exerciseById}
          lastSession={lastSessionForDay(completed, today.day.id)}
          onStart={handleStart}
          onBrowse={() => router.push('/workout/templates')}
        />
      ) : (
        <Card style={styles.gutter}>
          <Text variant="body" tone="secondary">
            No plan is active yet. Pick one from Plans, or start an open session and add lifts as you go.
          </Text>
          <Button
            label="Choose a workout"
            variant="secondary"
            style={styles.retry}
            onPress={() => router.push('/workout/templates')}
          />
        </Card>
      )}

      <SectionHeader title="Readiness" eyebrow="Estimate" />
      {readiness ? <ReadinessCard readiness={readiness} /> : null}
      <CheckInPrompt profileId={profile.id} checkIn={todaysCheckIn} />

      <SectionHeader title="Consistency" eyebrow="Rhythm" />
      <WeekCard
        days={week}
        sessionsDone={sessionsDone}
        sessionsTarget={profile.trainingDaysPerWeek}
        volumeAverage={formatVolume(volume.weeklyAverage, profile.unit)}
        volumeUnit={profile.unit}
        streakWeeks={streakWeeks}
      />

      {fatigued.length > 0 ? (
        <>
          <SectionHeader title="Still recovering" eyebrow="By muscle" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railContent}
          >
            {fatigued.map((r) => (
              <Card key={r.muscle} padding="base" style={styles.railCard}>
                <Text variant="eyebrow" tone="faint">
                  {MUSCLE_META[r.muscle].label}
                </Text>
                <Text variant="numericLg" tone="caution" style={styles.railValue}>
                  {Math.round(r.readiness * 100)}%
                </Text>
                <Text variant="bodySm" tone="faint">
                  {r.hoursSinceLastStimulus != null
                    ? `${r.hoursSinceLastStimulus}h since, ~${r.estimatedRecoveryHours}h needed`
                    : 'Not trained recently'}
                </Text>
              </Card>
            ))}
          </ScrollView>
        </>
      ) : null}

      {recentPrs.length > 0 ? (
        <>
          <SectionHeader title="Latest records" eyebrow="Personal bests" />
          <Card style={styles.gutter} padding="base">
            {recentPrs.map((pr, i) => (
              <View key={pr.id} style={[styles.prRow, i > 0 && styles.prRowBorder]}>
                <View style={styles.prIcon}>
                  <Ionicons
                    name={pr.kind === 'e1rm' ? 'trending-up' : 'barbell'}
                    size={15}
                    color={color.violetBright}
                  />
                </View>
                <View style={styles.prText}>
                  <Text variant="title3" numberOfLines={1}>
                    {exerciseById.get(pr.exerciseId)?.name ?? 'Exercise'}
                  </Text>
                  <Text variant="bodySm" tone="faint">
                    {pr.kind === 'e1rm' ? 'Estimated 1RM' : 'Heaviest set'} ·{' '}
                    {formatRelativeDay(pr.achievedAt)}
                  </Text>
                </View>
                <Text variant="numeric" tone="violet">
                  {formatVolume(pr.value, profile.unit)}
                  <Text variant="eyebrow" tone="faint">{` ${profile.unit}`}</Text>
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Go deeper" eyebrow="More detail" />
      <QuickAccess
        items={[
          {
            key: 'progress',
            label: 'Progress',
            caption: 'Key lifts over time',
            icon: 'trending-up-outline',
            onPress: () => router.push('/(tabs)/progress'),
          },
          {
            key: 'body',
            label: 'Body',
            caption: 'Recovery by muscle',
            icon: 'body-outline',
            onPress: () => router.push('/(tabs)/body'),
          },
          {
            key: 'plans',
            label: 'Plans',
            caption: 'Templates and rotation',
            icon: 'grid-outline',
            onPress: () => router.push('/(tabs)/plans'),
          },
        ]}
      />

      <Text variant="eyebrow" tone="faint" style={styles.version}>
        {`PRism v${Constants.expoConfig?.version ?? '0.0.0'}`}
      </Text>

      {/* Dev-only: replays onboarding on next launch. Never built into a release. */}
      {__DEV__ ? (
        <Button
          label="Reset onboarding"
          variant="ghost"
          size="sm"
          onPress={() => void useOnboardingStore.getState().reset()}
          style={styles.devReset}
        />
      ) : null}
    </Screen>
  );
}

// --- Local helpers ---------------------------------------------------------

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Consecutive prior weeks that met the user's own session target. */
function countStreakWeeks(
  workouts: Parameters<typeof completedThisWeek>[0],
  target: number,
  now: Date,
): number {
  let streak = 0;
  for (let back = 0; back < 26; back++) {
    const ref = new Date(now);
    ref.setDate(ref.getDate() - back * 7);
    const count = completedThisWeek(workouts, ref);
    // The current, still-running week counts if it is already on pace.
    if (count >= target) streak++;
    else if (back > 0) break;
  }
  return streak;
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg },
  retry: { marginTop: space.base },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.base,
  },
  demoText: { flex: 1 },
  draftCard: { marginHorizontal: space.lg, marginBottom: space.base },
  draftTitle: { marginTop: 2 },
  draftBody: { marginTop: space.sm },
  draftActions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  draftActionButton: { flex: 1 },
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.base,
    paddingVertical: space.md,
    paddingHorizontal: space.base,
    borderRadius: 14,
    backgroundColor: color.cyanWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22,196,222,0.4)',
    minHeight: 44,
  },
  resumeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.cyanBright },
  resumeText: { flex: 1 },
  // Separates the summary from the action without a section rule, which would
  // cost ~90pt of chrome and push the start button off the first screenful.
  heroGap: { height: space.md },
  railContent: { paddingHorizontal: space.lg, gap: space.md },
  railCard: { width: 170 },
  railValue: { marginTop: space.xs, marginBottom: 2 },
  prRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, gap: space.md },
  prRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  prIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: color.violetWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prText: { flex: 1 },
  version: { textAlign: 'center', marginTop: space.xl },
  devReset: { alignSelf: 'center', marginTop: space.sm },
});
