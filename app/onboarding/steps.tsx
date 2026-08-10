import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, OptionRow, ProgressHeader, Text } from '@/components/ui';
import {
  DAYS_OPTIONS,
  EQUIPMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  STEPS,
} from '@/content/onboarding';
import { useOnboardingStore } from '@/store/onboardingStore';
import { color, space } from '@/theme';

const STEP_KEYS = ['goal', 'experience', 'days', 'equipment'] as const;
type StepKey = (typeof STEP_KEYS)[number];

/**
 * MULTI-STEP ONBOARDING
 * =====================
 * Four questions behind one route.
 *
 * Holding the steps in local state rather than four routes keeps the progress
 * indicator honest and makes "back" mean the same thing on every step -- one
 * question backwards, then out of the flow. Four routes would let the stack and
 * the progress bar disagree after a gesture-driven back.
 *
 * Every question is skippable. Skipping advances without recording an answer --
 * it does not write a default. A middling stand-in would be indistinguishable
 * from a real choice later, which is the same mistake the check-in scales
 * deliberately avoid.
 *
 * Answers are recorded in `onboardingStore` and applied as one profile patch on
 * the completion screen. A skipped question stays absent from that patch.
 */
export default function StepsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);

  const { goal, experience, trainingDaysPerWeek, availableEquipment, select, toggleEquipment } =
    useOnboardingStore();

  const key: StepKey = STEP_KEYS[index];
  const copy = STEPS[key];
  const isLast = index === STEP_KEYS.length - 1;

  const answered: Record<StepKey, boolean> = {
    goal: goal != null,
    experience: experience != null,
    days: trainingDaysPerWeek != null,
    equipment: availableEquipment.length > 0,
  };

  const back = () => {
    if (index === 0) router.back();
    else setIndex((i) => i - 1);
  };

  const next = () => {
    if (isLast) router.push('/onboarding/complete');
    else setIndex((i) => i + 1);
  };

  return (
    <View style={styles.canvas}>
      <ProgressHeader
        step={index + 1}
        totalSteps={STEP_KEYS.length}
        onBack={back}
        onSkip={next}
        skipLabel={STEPS.skipLabel}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: space.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="eyebrow" tone="violet">
          {copy.eyebrow}
        </Text>
        <Text variant="title1" accessibilityRole="header" style={styles.title}>
          {copy.title}
        </Text>
        <Text variant="bodySm" tone="muted" style={styles.body}>
          {copy.body}
        </Text>

        <View style={styles.options}>
          {key === 'goal' &&
            GOAL_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                mode="radio"
                label={o.label}
                description={o.description}
                selected={goal === o.value}
                onPress={() => select({ goal: o.value })}
              />
            ))}

          {key === 'experience' &&
            EXPERIENCE_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                mode="radio"
                label={o.label}
                description={o.description}
                selected={experience === o.value}
                onPress={() => select({ experience: o.value })}
              />
            ))}

          {key === 'days' &&
            DAYS_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                mode="radio"
                label={o.label}
                selected={trainingDaysPerWeek === o.value}
                onPress={() => select({ trainingDaysPerWeek: o.value })}
              />
            ))}

          {key === 'equipment' &&
            EQUIPMENT_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                label={o.label}
                selected={availableEquipment.includes(o.value)}
                onPress={() => toggleEquipment(o.value)}
              />
            ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.base }]}>
        <Button
          label={isLast ? STEPS.finalCta : STEPS.primaryCta}
          fullWidth
          size="lg"
          disabled={!answered[key]}
          onPress={next}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.lg },
  title: { marginTop: space.sm },
  body: { marginTop: space.sm, maxWidth: 340 },
  options: { marginTop: space.xl, gap: space.md },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    backgroundColor: color.bg,
  },
});
