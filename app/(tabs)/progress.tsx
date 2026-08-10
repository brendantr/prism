import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Card,
  EmptyState,
  LinearSpectrum,
  Screen,
  ScreenState,
  SectionHeader,
  StatBlock,
  Text,
} from '@/components/ui';
import { LockedProScreen } from '@/components/paywall/LockedProScreen';
import { PhasePanel } from '@/components/ui/PhasePanel';
import { selectKeyLifts } from '@/domain/calc/keyLifts';
import { volumeInWindow } from '@/domain/calc/readiness';
import { KEY_LIFTS_COPY, ZERO_DATA } from '@/content/zeroData';
import { selectCompletedWorkouts, useTrainingStore } from '@/store/trainingStore';
import { useShallow } from 'zustand/react/shallow';
import { formatVolume } from '@/utils/format';
import { isSurfaceLocked } from '@/domain/entitlements';
import { useEntitlementStore } from '@/store/entitlementStore';
import { color, space } from '@/theme';

/**
 * PROGRESS (Phase 2)
 *
 * Phase 1 ships the numbers that the calculation engine already produces, so
 * this screen is useful today rather than empty. The full charting surface --
 * interactive e1RM/volume charts, PR history and per-exercise detail -- lands
 * in Phase 2 on top of the same `e1rmSeries` / `volumeByDay` selectors.
 *
 * Not a bar item: reached from Insights or Today, so it renders its own way back.
 */
export default function ProgressScreen() {
  const router = useRouter();
  const history = useTrainingStore(useShallow(selectCompletedWorkouts));
  const profile = useTrainingStore((s) => s.profile);
  const exerciseById = useTrainingStore((s) => s.exerciseById);
  const status = useTrainingStore((s) => s.status);
  const loadError = useTrainingStore((s) => s.error);
  const refresh = useTrainingStore((s) => s.refresh);
  const entitlementPhase = useEntitlementStore((s) => s.phase);

  const now = useMemo(() => new Date(), []);

  const headline = useMemo(() => {
    if (!profile) return null;
    const week = volumeInWindow(history, now, 7);
    const fourWeek = volumeInWindow(history, now, 28);
    return { week, weeklyAverage: fourWeek / 4, sessions: history.length };
  }, [history, profile, now]);

  /*
    Derived from what this account actually logged -- see `domain/calc/keyLifts`
    for why a fixed id list could not work here. The selection, the window and
    the ordering are all in that pure function so they can be tested; this
    screen only renders the result.
  */
  const keyLifts = useMemo(
    () => selectKeyLifts(history, exerciseById, now),
    [history, exerciseById, now],
  );

  /**
   * Always returns to Insights, the analytics hub these screens hang off.
   *
   * `router.back()` was tried and rejected: verified on a simulator (2026-07-29),
   * a bottom-tab navigator pops to its initial route rather than to the tab you
   * arrived from, so "back" from here landed on Today no matter whether you came
   * from Today or from Insights. A control labelled "back" that ignores history
   * is worse than one that names a fixed destination, so this names it.
   */
  const back = () => router.replace('/(tabs)/insights');

  const header = {
    eyebrow: 'Every angle',
    title: 'Progress',
    onBack: back,
    backLabel: 'Back to Insights',
  } as const;

  if (isSurfaceLocked({ requiresPro: true, phase: entitlementPhase })) {
    return <LockedProScreen eyebrow={header.eyebrow} title={header.title} onBack={back} />;
  }

  // Status must be checked before the profile/headline guard below: both stay
  // null for the entire loading/error window, so checking them first silently
  // swallowed the loading spinner and the error state behind a bare title --
  // confirmed on-device 2026-08-01 (Docs/sprints/2026-08-01-screen-state-verification.md).
  // A loaded store with no profile is something being wrong rather than a
  // slower load, so it offers a retry instead of an empty state -- the same
  // reading `app/history/index.tsx` makes of the same condition. It used to be
  // folded in with `!headline` below, where it rendered a bare title.
  if (status !== 'ready' || !profile || !headline) {
    return (
      <Screen scroll={false} {...header}>
        <ScreenState
          phase={status !== 'ready' ? status : 'error'}
          onRetry={() => void refresh()}
          errorMessage={loadError}
          loadingLabel="Loading your history…"
        />
      </Screen>
    );
  }

  /*
    Loaded, correct, and genuinely empty.

    The guard this replaces was `!profile || !headline`, and `headline` is null
    only when `profile` is -- so the whole condition collapsed to `!profile`,
    which never holds once the store is ready. The fallback was unreachable, and
    it was a bare titled screen with no body and no way out. A new account now
    branches on the thing that is actually missing: finished sessions.
  */
  if (history.length === 0) {
    return (
      <Screen scroll={false} {...header}>
        <EmptyState
          icon={ZERO_DATA.progress.icon}
          title={ZERO_DATA.progress.title}
          body={ZERO_DATA.progress.body}
          actionLabel={ZERO_DATA.progress.actionLabel}
          onAction={() => router.push(ZERO_DATA.progress.route)}
        />
      </Screen>
    );
  }

  const peak = Math.max(...keyLifts.map((l) => Math.abs(l.change)), 0.01);

  return (
    <Screen {...header}>
      <Card variant="raised" padding="xl" spectral style={styles.gutter}>
        <View style={styles.statRow}>
          <StatBlock
            label="Last 7 days"
            value={formatVolume(headline.week, profile.unit)}
            unit={profile.unit}
            tone="violet"
          />
          <StatBlock
            label="4-week avg"
            value={formatVolume(headline.weeklyAverage, profile.unit)}
            unit={`${profile.unit}/wk`}
          />
          <StatBlock label="Sessions" value={String(headline.sessions)} />
        </View>
      </Card>

      <SectionHeader title={KEY_LIFTS_COPY.sectionTitle} eyebrow={KEY_LIFTS_COPY.sectionEyebrow} />
      {/*
        There is history on this screen but not necessarily in this panel: a
        trend needs one movement repeated, which a lifter three sessions into
        three different workouts has not done yet. This used to render an empty
        rounded rectangle under the heading, with nothing saying why.
      */}
      {keyLifts.length === 0 ? (
        <Card style={styles.gutter} padding="sm">
          <EmptyState
            icon={KEY_LIFTS_COPY.emptyIcon}
            title={KEY_LIFTS_COPY.emptyTitle}
            body={KEY_LIFTS_COPY.emptyBody}
          />
        </Card>
      ) : (
        <Card style={styles.gutter} padding="lg">
          {keyLifts.map((lift, i) => (
            <View key={lift.exerciseId} style={[styles.liftRow, i > 0 && styles.divided]}>
              <View style={styles.liftHead}>
                {/*
                  Same fix as ListRow's title, same reason: this shares a row
                  with a trailing numeric value, and "Barbell Bench Press"
                  clipped to "Barbell Bench Pre…" at accessibility-extra-large,
                  confirmed on-device -- hiding which lift the row even was.
                */}
                <Text variant="title3" numberOfLines={2} style={styles.liftName}>
                  {lift.name}
                </Text>
                <Text variant="numeric" tone="violet">
                  {formatVolume(lift.current, profile.unit)}
                  <Text variant="eyebrow" tone="faint">{` ${profile.unit}`}</Text>
                </Text>
              </View>
              <View style={styles.track}>
                <LinearSpectrum height={5} progress={Math.abs(lift.change) / peak} rounded />
              </View>
              <Text variant="bodySm" tone={lift.change >= 0 ? 'positive' : 'coral'}>
                {`${lift.change >= 0 ? '+' : '−'}${Math.abs(lift.change * 100).toFixed(1)}% over ${lift.points.length} sessions`}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <PhasePanel
        phase={2}
        summary="Interactive charts on top of the series this screen already computes."
        deliverables={[
          'Estimated 1RM chart with a selectable time window and trend line',
          'Weekly volume chart split by muscle region',
          'Full PR history, filterable by lift and record type',
          'Exercise detail: every set ever logged, best sets, rep-range breakdown',
        ]}
        readyNow={[
          'e1rmSeries() and volumeByDay() selectors, unit-tested',
          'Epley 1RM with a rep cap so long sets cannot fake a record',
          'PR detection for both estimated 1RM and heaviest completed weight',
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg },
  statRow: { flexDirection: 'row', gap: space.md },
  liftRow: { paddingVertical: space.md, gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  liftHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  liftName: { flex: 1 },
  track: { height: 5, backgroundColor: color.inset, borderRadius: 3, overflow: 'hidden' },
});
