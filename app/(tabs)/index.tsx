import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { Button, Card, Chip, Screen, SectionHeader, Text } from '@/components/ui';
import { CheckInPrompt } from '@/components/today/CheckInPrompt';
import { ReadinessCard } from '@/components/today/ReadinessCard';
import { SessionCard } from '@/components/today/SessionCard';
import { WeekCard } from '@/components/today/WeekCard';
import {
  computeReadiness,
  completedThisWeek,
  estimateRecovery,
  volumeInWindow,
} from '@/domain/calc';
import { lastSessionForDay, resolveTodaySession, weekCells } from '@/domain/schedule';
import { MUSCLE_META } from '@/domain/muscles';
import {
  selectCompletedWorkouts,
  selectLatestCheckIn,
  selectTodaysCheckIn,
  useTrainingStore,
} from '@/store/trainingStore';
import { useActiveWorkoutStore } from '@/store/activeWorkoutStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { formatRelativeDay, formatVolume } from '@/utils/format';
import { isDemoMode } from '@/data/repository';
import { color, space } from '@/theme';

/**
 * TODAY
 * =====
 * Answers three questions in order, top to bottom:
 *   1. How am I? (readiness, with its reasoning)
 *   2. What am I doing? (scheduled session, one tap to start)
 *   3. How is the week going? (consistency, volume, streak)
 *
 * Anything that does not serve one of those three lives on another tab.
 */
export default function TodayScreen() {
  const router = useRouter();
  const status = useTrainingStore((s) => s.status);
  const profile = useTrainingStore((s) => s.profile);
  const activeRoutine = useTrainingStore((s) => s.activeRoutine);
  const exerciseById = useTrainingStore((s) => s.exerciseById);
  const personalRecords = useTrainingStore((s) => s.personalRecords);
  const completed = useTrainingStore(useShallow(selectCompletedWorkouts));
  const latestCheckIn = useTrainingStore(selectLatestCheckIn);
  const todaysCheckIn = useTrainingStore(selectTodaysCheckIn);

  const activeWorkout = useActiveWorkoutStore((s) => s.workout);
  const startWorkout = useActiveWorkoutStore((s) => s.start);

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
      delta:
        previousWeek > 0
          ? {
              text: `${Math.abs(Math.round(change * 100))}%`,
              direction: (change > 0.02 ? 'up' : change < -0.02 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
            }
          : undefined,
    };
  }, [completed, now]);

  const streakWeeks = useMemo(() => countStreakWeeks(completed, profile?.trainingDaysPerWeek ?? 3, now), [completed, profile, now]);

  const recentPrs = useMemo(
    () => [...personalRecords].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt)).slice(0, 3),
    [personalRecords],
  );

  const fatigued = useMemo(
    () => recovery.filter((r) => r.readiness < 0.55).sort((a, b) => a.readiness - b.readiness).slice(0, 3),
    [recovery],
  );

  if (status === 'loading' || status === 'idle' || !profile) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={color.violetBright} />
        <Text variant="bodySm" tone="muted" style={styles.loadingText}>
          Reading your training history…
        </Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <Screen title="Something broke">
        <Card style={styles.gutter}>
          <Text variant="body" tone="secondary">
            {useTrainingStore.getState().error ?? 'Your training data could not be loaded.'}
          </Text>
          <Button label="Try again" variant="secondary" onPress={() => void useTrainingStore.getState().refresh()} style={styles.retry} />
        </Card>
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

      {activeWorkout ? (
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

      {readiness ? <ReadinessCard readiness={readiness} /> : null}
      <CheckInPrompt profileId={profile.id} checkIn={todaysCheckIn} />

      <SectionHeader title="Today's session" eyebrow="Scheduled" />
      {today ? (
        <SessionCard
          day={today.day}
          reason={today.reason}
          targetMuscles={today.targetMuscles}
          exerciseById={exerciseById}
          lastSession={lastSessionForDay(completed, today.day.id)}
          onStart={handleStart}
          onBrowse={() => {
            if (!activeWorkout) {
              startWorkout({ profileId: profile.id, title: 'Open session', routineDay: null });
            }
            router.push('/workout/picker');
          }}
        />
      ) : (
        <Card style={styles.gutter}>
          <Text variant="body" tone="secondary">
            No plan is active yet. Pick one from Plans, or start an open session and add lifts as you go.
          </Text>
          <Button
            label="Start an open session"
            variant="secondary"
            style={styles.retry}
            onPress={() => {
              startWorkout({ profileId: profile.id, title: 'Open session', routineDay: null });
              router.push('/workout/active');
            }}
          />
        </Card>
      )}

      <SectionHeader title="Consistency" eyebrow="Rhythm" />
      <WeekCard
        days={week}
        sessionsDone={completedThisWeek(completed, now)}
        sessionsTarget={profile.trainingDaysPerWeek}
        volumeThisWeek={formatVolume(volume.thisWeek, profile.unit)}
        volumeUnit={profile.unit}
        volumeDelta={volume.delta}
        streakWeeks={streakWeeks}
      />

      {fatigued.length > 0 ? (
        <>
          <SectionHeader title="Still recovering" eyebrow="Estimate" />
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
  loading: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: space.md },
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
