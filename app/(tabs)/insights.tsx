import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Card,
  Chip,
  EmptyState,
  ListRow,
  Screen,
  ScreenState,
  SectionHeader,
  SegmentedControl,
  StatBlock,
  Text,
  type SegmentedOption,
} from '@/components/ui';
import { PhasePanel } from '@/components/ui/PhasePanel';
import { completedThisWeek, volumeInWindow } from '@/domain/calc/readiness';
import { muscleDistribution, workoutWorkingSetCount } from '@/domain/calc/volume';
import { MUSCLE_META } from '@/domain/muscles';
import { selectCompletedWorkouts, useTrainingStore } from '@/store/trainingStore';
import { DEEPER_SECTION, DEEPER_SURFACES } from '@/content/deeperSurfaces';
import { useShallow } from 'zustand/react/shallow';
import { formatVolume } from '@/utils/format';
import { color, radius, space } from '@/theme';
import type { Workout } from '@/domain/types';
import { isInsightsWindowLocked, isSurfaceLocked, resolveInsightsWindow } from '@/domain/entitlements';
import { PAYWALL, PAYWALL_ROUTE } from '@/content/paywall';
import { useEntitlementStore } from '@/store/entitlementStore';

/**
 * INSIGHTS
 * ========
 * The analytics hub, layered rather than flattened:
 *
 *   1. A window selector and a three-number summary -- readable at a glance.
 *   2. Derived highlights, in sentences, from the calculations that already exist.
 *   3. Per-muscle volume against a reference target.
 *   4. Links into the deeper surfaces (Progress, Body), which are not in the
 *      tab bar and would otherwise be hard to find.
 *   5. An honest statement of what the recommendation engine is not yet doing.
 *
 * Every number states the span it covers, in words, next to the number itself.
 * A figure read after the selector has scrolled out of view, or read aloud by a
 * screen reader, has to carry its own period.
 */

type WindowDays = '7' | '28' | '84';

const WINDOW_OPTIONS: SegmentedOption<WindowDays>[] = [
  // The visible label is the bare period; the spoken one says what it changes,
  // because a screen reader reaching "7 days" on its own has no context.
  { value: '7', label: '7 days', accessibilityLabel: 'Show insights for the last 7 days' },
  { value: '28', label: '4 weeks', accessibilityLabel: 'Show insights for the last 4 weeks' },
  { value: '84', label: '12 weeks', accessibilityLabel: 'Show insights for the last 12 weeks' },
];

/** How each window is named in prose, so copy and control cannot drift. */
const WINDOW_PHRASE: Record<WindowDays, string> = {
  '7': 'last 7 days',
  '28': 'last 4 weeks',
  '84': 'last 12 weeks',
};

/** The same span, named as a bare period for "…than the N before" comparisons. */
const WINDOW_PERIOD: Record<WindowDays, string> = {
  '7': '7 days',
  '28': '4 weeks',
  '84': '12 weeks',
};

/**
 * Below this share of the reference target a muscle is called out as running
 * light. Deliberately generous: this is a prompt to look, not a verdict.
 */
const LIGHT_THRESHOLD = 0.6;

export default function InsightsScreen() {
  const router = useRouter();
  const history = useTrainingStore(useShallow(selectCompletedWorkouts));
  const profile = useTrainingStore((s) => s.profile);
  const exerciseById = useTrainingStore((s) => s.exerciseById);
  const status = useTrainingStore((s) => s.status);
  const loadError = useTrainingStore((s) => s.error);
  const refresh = useTrainingStore((s) => s.refresh);
  const now = useMemo(() => new Date(), []);

  const entitlementPhase = useEntitlementStore((s) => s.phase);
  const [windowDays, setWindowDays] = useState<WindowDays>('7');
  const [lockedWindowNotice, setLockedWindowNotice] = useState(false);
  const days = Number(windowDays);
  const weeks = days / 7;
  const phrase = WINDOW_PHRASE[windowDays];

  const selectWindow = (requested: WindowDays) => {
    if (isInsightsWindowLocked(Number(requested), entitlementPhase)) {
      setWindowDays(String(resolveInsightsWindow(Number(requested), entitlementPhase)) as WindowDays);
      setLockedWindowNotice(true);
      router.push(PAYWALL_ROUTE as never);
      return;
    }
    setLockedWindowNotice(false);
    setWindowDays(requested);
  };

  const inWindow = useMemo(() => workoutsSince(history, now, days), [history, now, days]);

  const summary = useMemo(() => {
    if (!profile) return null;
    const volume = volumeInWindow(history, now, days);
    const priorVolume = volumeInWindow(history, now, days * 2) - volume;
    const change = priorVolume > 0 ? (volume - priorVolume) / priorVolume : 0;

    return {
      volume,
      sessions: inWindow.length,
      workingSets: inWindow.reduce((n, w) => n + workoutWorkingSetCount(w), 0),
      sessionsPerWeek: Math.round((inWindow.length / weeks) * 10) / 10,
      delta:
        priorVolume > 0
          ? {
              text: `${Math.abs(Math.round(change * 100))}%`,
              direction: (change > 0.02 ? 'up' : change < -0.02 ? 'down' : 'flat') as
                | 'up'
                | 'down'
                | 'flat',
            }
          : undefined,
    };
  }, [history, inWindow, profile, now, days, weeks]);

  const highlights = useMemo(() => {
    if (!profile) return [];

    const volume = volumeInWindow(history, now, days);
    const priorVolume = volumeInWindow(history, now, days * 2) - volume;
    const sessionsThisWeek = completedThisWeek(history, now);
    const remaining = profile.trainingDaysPerWeek - sessionsThisWeek;

    const dist = muscleDistribution(inWindow, exerciseById);
    const light = dist
      .filter((d) => d.sets / weeks < MUSCLE_META[d.muscle].weeklySetTarget * LIGHT_THRESHOLD)
      .sort((a, b) => a.sets - b.sets)[0];

    const out: Array<{
      icon: keyof typeof Ionicons.glyphMap;
      tone: 'violet' | 'cyan' | 'coral';
      title: string;
      body: string;
    }> = [];

    out.push({
      icon: 'pulse',
      tone: priorVolume > 0 && volume < priorVolume * 0.8 ? 'coral' : 'violet',
      title:
        priorVolume === 0
          ? `${formatVolume(volume, profile.unit)} ${profile.unit} logged in the ${phrase}`
          : volume >= priorVolume
            ? `Volume up ${Math.round(((volume - priorVolume) / priorVolume) * 100)}% on the ${WINDOW_PERIOD[windowDays]} before`
            : `Volume down ${Math.round(((priorVolume - volume) / priorVolume) * 100)}% on the ${WINDOW_PERIOD[windowDays]} before`,
      body: `${formatVolume(volume, profile.unit)} ${profile.unit} across ${inWindow.length} ${inWindow.length === 1 ? 'session' : 'sessions'} in the ${phrase} — a weekly average of ${formatVolume(volume / weeks, profile.unit)} ${profile.unit}.`,
    });

    if (light) {
      out.push({
        icon: 'alert-circle',
        tone: 'coral',
        title: `${MUSCLE_META[light.muscle].label} is running light`,
        body: `About ${(light.sets / weeks).toFixed(1)} effective sets a week over the ${phrase}, against a ${MUSCLE_META[light.muscle].weeklySetTarget}-set target for an intermediate lifter. Adding one exercise would close most of that gap.`,
      });
    }

    out.push({
      icon: 'calendar',
      tone: remaining <= 0 ? 'cyan' : 'violet',
      title:
        remaining <= 0
          ? 'Weekly session target hit'
          : `${remaining} ${remaining === 1 ? 'session' : 'sessions'} left this week`,
      body: `You set a target of ${profile.trainingDaysPerWeek} sessions a week. Consistency contributes 10% of your readiness score.`,
    });

    return out;
  }, [history, inWindow, profile, exerciseById, now, days, weeks, phrase, windowDays]);

  /** Per-muscle load, most under-target first: that is the end worth reading. */
  const balance = useMemo(() => {
    const dist = muscleDistribution(inWindow, exerciseById);
    return dist
      .map((d) => {
        const target = MUSCLE_META[d.muscle].weeklySetTarget;
        const perWeek = d.sets / weeks;
        return { muscle: d.muscle, perWeek, target, ratio: perWeek / target };
      })
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, 8);
  }, [inWindow, exerciseById, weeks]);

  const header = { eyebrow: 'What the data says', title: 'Insights' } as const;

  if (status !== 'ready') {
    return (
      <Screen scroll={false} {...header}>
        <ScreenState
          phase={status}
          onRetry={() => void refresh()}
          errorMessage={loadError}
          loadingLabel="Working out what your training says…"
        />
      </Screen>
    );
  }

  // Loaded, but there is genuinely nothing to derive from yet. This used to
  // render as a bare title over blank space, which reads as a broken screen
  // rather than a new lifter's honest starting point.
  if (!profile || !summary) {
    return (
      <Screen scroll={false} {...header}>
        {/* Every other empty state in the app offers a way out, which is what
            `EmptyState` is for -- this one used to be a dead end, and the way
            out of "no data yet" is the same first session History points at. */}
        <EmptyState
          icon="sparkles-outline"
          title="Nothing to read yet"
          body="Insights appear once you have finished a session or two. There is no shortcut — the numbers come from your own training."
          actionLabel="Choose a workout"
          onAction={() => router.push('/workout/templates')}
        />
      </Screen>
    );
  }

  return (
    <Screen {...header}>
      <View style={styles.gutter}>
        <SegmentedControl
          options={WINDOW_OPTIONS}
          value={windowDays}
          onChange={selectWindow}
        />
      </View>

      {lockedWindowNotice && entitlementPhase !== 'entitled' ? (
        <Text variant="bodySm" tone="violet" style={styles.lockedNotice}>
          {PAYWALL.lockedWindowNotice}
        </Text>
      ) : null}

      <Card variant="raised" padding="lg" spectral style={styles.summary}>
        <Text variant="eyebrow" tone="faint">
          {phrase}
        </Text>

        <View style={styles.statRow}>
          <StatBlock
            label="Volume"
            value={formatVolume(summary.volume, profile.unit)}
            unit={profile.unit}
            delta={summary.delta}
            tone="violet"
          />
          <View style={styles.divider} />
          <StatBlock label="Sessions" value={String(summary.sessions)} />
          <View style={styles.divider} />
          <StatBlock label="Working sets" value={String(summary.workingSets)} />
        </View>

        <Text variant="bodySm" tone="secondary" style={styles.summaryLine}>
          {summary.sessions === 0
            ? `Nothing logged in the ${phrase}. One session is enough to restart the trend.`
            : `Averaging ${summary.sessionsPerWeek} ${summary.sessionsPerWeek === 1 ? 'session' : 'sessions'} a week across the ${phrase}, against your target of ${profile.trainingDaysPerWeek}.`}
        </Text>
      </Card>

      <SectionHeader title="Highlights" eyebrow={phrase} />
      {highlights.map((h) => (
        <Card key={h.title} style={styles.gutterCard} padding="lg">
          <View style={styles.head}>
            <View style={[styles.icon, { backgroundColor: WASH[h.tone] }]}>
              <Ionicons name={h.icon} size={15} color={TINT[h.tone]} />
            </View>
            <Text variant="title3" style={styles.title}>
              {h.title}
            </Text>
          </View>
          <Text variant="bodySm" tone="secondary" style={styles.body}>
            {h.body}
          </Text>
        </Card>
      ))}

      <SectionHeader title="Muscle balance" eyebrow={phrase} />
      <Card style={styles.gutterCard} padding="lg">
        {balance.length === 0 ? (
          <Text variant="bodySm" tone="muted">
            {`No completed sets in the ${phrase} to split across muscles yet.`}
          </Text>
        ) : (
          <>
            {balance.map((row, i) => (
              <View key={row.muscle} style={[styles.balanceRow, i > 0 && styles.divided]}>
                <View style={styles.balanceHead}>
                  <Text variant="label">{MUSCLE_META[row.muscle].label}</Text>
                  <Text variant="numericSm" tone={row.ratio >= 1 ? 'positive' : 'muted'}>
                    {row.perWeek.toFixed(1)}
                    <Text variant="eyebrow" tone="faint">{` / ${row.target} sets`}</Text>
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.min(100, Math.round(row.ratio * 100))}%`,
                        backgroundColor: row.ratio >= 1 ? color.positive : color.violetBright,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
            <Text variant="bodySm" tone="faint" style={styles.balanceNote}>
              Effective sets a week, secondary muscles counted fractionally, against a reference
              target for an intermediate lifter. A reference point for planning volume — not a
              health threshold, and not a target you have to hit.
            </Text>
          </>
        )}
      </Card>

      {/* Shares `DEEPER_SURFACES` with Today's tile row -- see that module for
          why the two screens stopped owning these words separately. */}
      <SectionHeader title={DEEPER_SECTION.title} eyebrow={DEEPER_SECTION.eyebrow} />
      <Card style={styles.gutterCard} padding="base">
        {DEEPER_SURFACES.map((surface, i) => {
          const locked = isSurfaceLocked({ requiresPro: surface.requiresPro, phase: entitlementPhase });
          return (
            <ListRow
              key={surface.key}
              title={surface.label}
              subtitle={locked ? PAYWALL.lockedRowHint : surface.rowSubtitle}
              icon={surface.icon}
              iconTone={surface.iconTone}
              trailing={locked ? <Chip label={PAYWALL.lockedBadge} tone="violet" icon="lock-closed" /> : undefined}
              chevron={!locked}
              divided={i > 0}
              onPress={() => router.push((locked ? PAYWALL_ROUTE : surface.route) as never)}
            />
          );
        })}
      </Card>

      <PhasePanel
        phase={4}
        summary="A ranked recommendation feed where every card can be acted on without leaving the screen."
        deliverables={[
          'Ranked, dismissible recommendation cards with a one-tap action',
          'Stalled-lift detection across the last 3-4 sessions',
          'Muscle-balance warnings, push/pull and left/right',
          'Deload prompts driven by the acute:chronic workload ratio',
          'Week-in-review digest with a shareable card',
        ]}
        readyNow={[
          'Acute:chronic workload ratio, already weighted into readiness',
          'Effective-set totals per muscle against weekly targets',
          'Next-load recommendation with a full plain-language rationale',
        ]}
      />
    </Screen>
  );
}

// --- Local helpers ---------------------------------------------------------

/** Completed sessions started within the last `days`. */
function workoutsSince(history: Workout[], now: Date, days: number): Workout[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return history.filter((w) => new Date(w.startedAt).getTime() >= cutoff);
}

const WASH = { violet: color.violetWash, cyan: color.cyanWash, coral: color.coralWash };
const TINT = { violet: color.violetBright, cyan: color.cyanBright, coral: color.coralBright };

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg },
  lockedNotice: { marginHorizontal: space.lg, marginTop: space.md },
  summary: { marginHorizontal: space.lg, marginTop: space.base },
  gutterCard: { marginHorizontal: space.lg, marginBottom: space.md },
  statRow: { flexDirection: 'row', marginTop: space.base },
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
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
  body: { marginTop: space.md, lineHeight: 19 },
  balanceRow: { paddingVertical: space.md, gap: 6 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  balanceHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  track: {
    height: 6,
    backgroundColor: color.inset,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  balanceNote: {
    marginTop: space.base,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    lineHeight: 18,
  },
});
