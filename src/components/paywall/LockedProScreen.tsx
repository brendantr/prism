import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Screen, Text } from '@/components/ui';
import { PAYWALL, PAYWALL_ROUTE } from '@/content/paywall';
import { space } from '@/theme';

/**
 * The lock as a card, for a screen that is only PARTLY behind the unlock.
 *
 * Body is the case this exists for. Its recovery estimate is analysis and is
 * paid; the body measurements listed above it are the lifter's own entries and
 * are free (`Docs/decisions/ADR-0005-monetization.md`). Returning
 * `LockedProScreen` from Body would have taken the whole surface -- including
 * the only route to a lifter's own bodyweight log -- which is the one thing the
 * free/paid line is drawn to prevent.
 */
export function LockedProPanel() {
  const router = useRouter();
  return (
    <Card variant="raised" spectral padding="xl" style={styles.card}>
      <Text variant="title2">{PAYWALL.lockedScreenTitle}</Text>
      <Text variant="bodySm" tone="secondary" style={styles.body}>
        {PAYWALL.lockedScreenBody}
      </Text>
      <Button
        label={PAYWALL.lockedScreenAction}
        fullWidth
        style={styles.action}
        onPress={() => router.push(PAYWALL_ROUTE as never)}
      />
    </Card>
  );
}

export function LockedProScreen({
  eyebrow,
  title,
  onBack,
}: {
  eyebrow: string;
  title: string;
  onBack: () => void;
}) {
  const router = useRouter();
  return (
    <Screen
      scroll={false}
      eyebrow={eyebrow}
      title={title}
      onBack={onBack}
      backLabel="Back to Insights"
    >
      <Card variant="raised" spectral padding="xl" style={styles.card}>
        <Text variant="title2">{PAYWALL.lockedScreenTitle}</Text>
        <Text variant="bodySm" tone="secondary" style={styles.body}>
          {PAYWALL.lockedScreenBody}
        </Text>
        <Button
          label={PAYWALL.lockedScreenAction}
          fullWidth
          style={styles.action}
          onPress={() => router.push(PAYWALL_ROUTE as never)}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg },
  body: { marginTop: space.md },
  action: { marginTop: space.xl },
});
