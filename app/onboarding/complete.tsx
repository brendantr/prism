import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, FadeIn, LinearSpectrum, Text } from '@/components/ui';
import { isAuthEnabled } from '@/data/supabase/auth';
import {
  COMPLETE,
  completionBody,
  DAYS_OPTIONS,
  EQUIPMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
} from '@/content/onboarding';
import { isEmptyProfilePatch, profilePatchFromOnboarding } from '@/domain/settings';
import { useOnboardingStore, type OnboardingSelections } from '@/store/onboardingStore';
import { useTrainingStore } from '@/store/trainingStore';
import { color, radius, space } from '@/theme';

/**
 * COMPLETION
 * ==========
 * The handover into the app.
 *
 * The answers are written to the training profile before onboarding is marked
 * complete. That order is load-bearing: the completion flag is what lets the
 * root gate reveal Today, so flipping it first would briefly render the
 * default profile and could leave the answers unapplied if the write failed.
 *
 * The screen echoes back what was chosen, including "Not set" for anything
 * skipped. Skipped fields are omitted from the patch, so the account's
 * existing/default value survives rather than being replaced by a stand-in.
 */
export default function CompleteScreen() {
  const insets = useSafeAreaInsets();
  const complete = useOnboardingStore((s) => s.complete);
  const goal = useOnboardingStore((s) => s.goal);
  const experience = useOnboardingStore((s) => s.experience);
  const trainingDaysPerWeek = useOnboardingStore((s) => s.trainingDaysPerWeek);
  const availableEquipment = useOnboardingStore((s) => s.availableEquipment);
  const updateProfile = useTrainingStore((s) => s.updateProfile);
  const refresh = useTrainingStore((s) => s.refresh);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const finish = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      let profile = useTrainingStore.getState().profile;
      if (!profile) {
        await refresh();
        profile = useTrainingStore.getState().profile;
      }
      if (!profile) throw new Error('Profile unavailable');

      const patch = profilePatchFromOnboarding({
        goal,
        experience,
        trainingDaysPerWeek,
        availableEquipment,
      });
      if (!isEmptyProfilePatch(patch)) await updateProfile(patch);

      await complete();
      // The root gate observes `completed` and owns the one redirect to Today.
    } catch (error) {
      console.warn('[onboarding] completion failed', error);
      setFinishError(COMPLETE.applyFailed);
    } finally {
      setFinishing(false);
    }
  };

  const rows = summaryRows({ goal, experience, trainingDaysPerWeek, availableEquipment });

  return (
    <View style={[styles.canvas, { paddingTop: insets.top + space.xl }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <FadeIn>
          <View style={styles.badge}>
            <Ionicons name="checkmark" size={26} color={color.violetBright} />
          </View>

          <Text variant="eyebrow" tone="violet" style={styles.eyebrow}>
            {COMPLETE.eyebrow}
          </Text>
          <LinearSpectrum height={3} rounded style={styles.band} />
          <Text variant="display" accessibilityRole="header" style={styles.title}>
            {COMPLETE.title}
          </Text>
        </FadeIn>

        <FadeIn delay={140}>
          <Card padding="base" style={styles.note}>
            <Text variant="bodySm" tone="secondary">
              {completionBody(isAuthEnabled())}
            </Text>
          </Card>
        </FadeIn>

        <FadeIn delay={220}>
          <Text variant="eyebrow" tone="faint" style={styles.summaryEyebrow}>
            {COMPLETE.summaryEyebrow}
          </Text>

          <Card padding="base">
            {rows.map((row, i) => (
              <View key={row.label} style={[styles.row, i > 0 && styles.divided]}>
                <Text variant="label" tone="muted" style={styles.rowLabel}>
                  {row.label}
                </Text>
                <Text
                  variant="bodySm"
                  tone={row.value == null ? 'faint' : 'primary'}
                  numberOfLines={2}
                  style={styles.rowValue}
                >
                  {row.value ?? COMPLETE.notSet}
                </Text>
              </View>
            ))}
          </Card>

          <Text variant="bodySm" tone="faint" style={styles.summaryNote}>
            {COMPLETE.summaryNote}
          </Text>
        </FadeIn>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.base }]}>
        <Button
          label={COMPLETE.primaryCta}
          fullWidth
          size="lg"
          loading={finishing}
          onPress={() => void finish()}
        />
        {finishError ? (
          <Text variant="bodySm" tone="coral" accessibilityRole="alert" style={styles.error}>
            {finishError}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// --- Local helpers ---------------------------------------------------------

/**
 * One row per setup question. `null` means the question was skipped, and is
 * rendered as "Not set" rather than filled in with anything.
 */
function summaryRows(s: OnboardingSelections): Array<{ label: string; value: string | null }> {
  const equipment = EQUIPMENT_OPTIONS.filter((o) => s.availableEquipment.includes(o.value)).map(
    (o) => o.label,
  );

  return [
    {
      label: COMPLETE.summaryLabels.goal,
      value: GOAL_OPTIONS.find((o) => o.value === s.goal)?.label ?? null,
    },
    {
      label: COMPLETE.summaryLabels.experience,
      value: EXPERIENCE_OPTIONS.find((o) => o.value === s.experience)?.label ?? null,
    },
    {
      label: COMPLETE.summaryLabels.days,
      value: DAYS_OPTIONS.find((o) => o.value === s.trainingDaysPerWeek)?.label ?? null,
    },
    {
      label: COMPLETE.summaryLabels.equipment,
      value: equipment.length > 0 ? equipment.join(', ') : null,
    },
  ];
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.violetWash,
    marginBottom: space.xl,
  },
  eyebrow: { marginTop: space.xs },
  band: { width: 72, marginTop: space.base },
  title: { marginTop: space.lg },
  note: { marginTop: space.xl },
  summaryEyebrow: { marginTop: space.xl, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  rowLabel: { width: 118 },
  rowValue: { flex: 1 },
  summaryNote: { marginTop: space.md, lineHeight: 18 },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    backgroundColor: color.bg,
  },
  error: { marginTop: space.sm, textAlign: 'center' },
});
