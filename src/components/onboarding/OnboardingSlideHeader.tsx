import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { space } from '@/theme';

export interface OnboardingSlideHeaderProps {
  /** e.g. "01 / LOG" -- the section-index badge. */
  eyebrow: string;
  title: string;
  body: string;
}

/**
 * The eyebrow-index / headline / body block shared by every redesigned
 * onboarding slide (Log, Progress, Readiness).
 *
 * One component so the three slides cannot drift into three slightly
 * different headline treatments -- the eyebrow always reads as a position in
 * a short, numbered sequence ("01 / LOG"), never as a generic section label.
 */
export function OnboardingSlideHeader({ eyebrow, title, body }: OnboardingSlideHeaderProps) {
  return (
    <View style={styles.wrap}>
      <Text variant="eyebrow" tone="violet" accessibilityRole="text">
        {eyebrow}
      </Text>
      <Text variant="title1" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg },
  title: { marginTop: space.sm },
  body: { marginTop: space.sm, maxWidth: 360 },
});
