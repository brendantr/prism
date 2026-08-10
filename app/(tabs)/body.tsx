import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Screen, ScreenState, SectionHeader, Text } from '@/components/ui';
import { LockedProScreen } from '@/components/paywall/LockedProScreen';
import { PhasePanel } from '@/components/ui/PhasePanel';
import { estimateRecovery, RECOVERY_MODEL_EXPLANATION } from '@/domain/calc/recovery';
import { MUSCLE_META } from '@/domain/muscles';
import { selectCompletedWorkouts, useTrainingStore } from '@/store/trainingStore';
import { useShallow } from 'zustand/react/shallow';
import { color, radius, recoveryScale, space } from '@/theme';
import type { MuscleRecovery } from '@/domain/types';
import { isSurfaceLocked } from '@/domain/entitlements';
import { useEntitlementStore } from '@/store/entitlementStore';

/**
 * BODY (Phase 3)
 *
 * The recovery model is already live and drives the readiness score, so this
 * screen shows its full output as a ranked list today. The original SVG body-map
 * illustration that renders the same data anatomically arrives in Phase 3.
 *
 * Not a bar item: reached from Insights or Today, so it renders its own way back.
 */
export default function BodyScreen() {
  const router = useRouter();
  const history = useTrainingStore(useShallow(selectCompletedWorkouts));
  const exerciseById = useTrainingStore((s) => s.exerciseById);
  const status = useTrainingStore((s) => s.status);
  const loadError = useTrainingStore((s) => s.error);
  const refresh = useTrainingStore((s) => s.refresh);
  const entitlementPhase = useEntitlementStore((s) => s.phase);
  const now = useMemo(() => new Date(), []);

  const recovery = useMemo(
    () => estimateRecovery(history, exerciseById, now).sort((a, b) => a.readiness - b.readiness),
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
    eyebrow: 'Estimate, not measurement',
    title: 'Body',
    onBack: back,
    backLabel: 'Back to Insights',
  } as const;

  if (isSurfaceLocked({ requiresPro: true, phase: entitlementPhase })) {
    return <LockedProScreen eyebrow={header.eyebrow} title={header.title} onBack={back} />;
  }

  if (status !== 'ready') {
    return (
      <Screen scroll={false} {...header}>
        <ScreenState
          phase={status}
          onRetry={() => void refresh()}
          errorMessage={loadError}
          loadingLabel="Estimating recovery…"
        />
      </Screen>
    );
  }

  return (
    <Screen {...header}>
      <Card style={styles.gutter} padding="lg">
        <Text variant="bodySm" tone="muted" style={styles.explainer}>
          {RECOVERY_MODEL_EXPLANATION}
        </Text>
      </Card>

      <SectionHeader title="Recovery by muscle" eyebrow="Estimated readiness" />
      <Card style={styles.gutter} padding="lg">
        {recovery.map((r, i) => (
          <RecoveryRow key={r.muscle} recovery={r} divided={i > 0} />
        ))}
      </Card>

      <PhasePanel
        phase={3}
        summary="An original SVG body illustration, front and back, that colours each region by the recovery values listed above."
        deliverables={[
          'Hand-drawn SVG muscle map, drawn specifically for PRism',
          'Tap a region for its volume, effective sets and recovery window',
          'Front/back toggle with a weekly volume-balance view',
          'Left/right and push/pull imbalance flags',
        ]}
        readyNow={[
          'Per-muscle recovery estimate with a load-scaled window',
          'Effective-set attribution: 100% primary, 40% synergist',
          'Muscle metadata: recovery baselines and weekly set targets',
        ]}
      />
    </Screen>
  );
}

function RecoveryRow({ recovery, divided }: { recovery: MuscleRecovery; divided: boolean }) {
  const meta = MUSCLE_META[recovery.muscle];
  const tint = recoveryScale[recovery.status];
  const pct = Math.round(recovery.readiness * 100);

  return (
    <View
      style={[styles.row, divided && styles.divided]}
      accessible
      accessibilityLabel={`${meta.label}: estimated ${pct}% recovered, ${recovery.status}${
        recovery.hoursSinceLastStimulus != null
          ? `, ${recovery.hoursSinceLastStimulus} hours since training, roughly ${recovery.estimatedRecoveryHours} hours needed`
          : ', not trained recently'
      }`}
    >
      <View style={styles.rowHead}>
        <Text variant="label">{meta.label}</Text>
        <Text variant="numericSm" style={{ color: tint }}>
          {pct}%
        </Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tint }]} />
      </View>

      <Text variant="bodySm" tone="faint">
        {recovery.hoursSinceLastStimulus != null
          ? `${recovery.hoursSinceLastStimulus}h since last stimulus · ~${recovery.estimatedRecoveryHours}h window`
          : 'No recent stimulus recorded'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg },
  explainer: { lineHeight: 19 },
  row: { paddingVertical: space.md, gap: 6 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  track: {
    height: 6,
    backgroundColor: color.inset,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
});
