import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Screen, SectionHeader, Text } from '@/components/ui';
import {
  PAYWALL,
  PURCHASE_OUTCOME_COPY,
  PURCHASE_OUTCOME_TITLE,
  paywallPurchaseLabel,
} from '@/content/paywall';
import { useEntitlementStore } from '@/store/entitlementStore';
import { color, radius, space } from '@/theme';

export default function PaywallScreen() {
  const router = useRouter();
  const phase = useEntitlementStore((state) => state.phase);
  const purchaseReady = useEntitlementStore((state) => state.purchaseReady);
  const priceString = useEntitlementStore((state) => state.priceString);
  const pending = useEntitlementStore((state) => state.pending);
  const lastFailure = useEntitlementStore((state) => state.lastFailure);
  const lastSuccess = useEntitlementStore((state) => state.lastSuccess);
  const purchase = useEntitlementStore((state) => state.purchase);
  const restore = useEntitlementStore((state) => state.restore);
  const clearOutcome = useEntitlementStore((state) => state.clearOutcome);

  const close = () => {
    clearOutcome();
    router.back();
  };

  const outcome =
    lastSuccess != null
      ? {
          title: lastSuccess === 'purchased' ? PAYWALL.purchasedTitle : PAYWALL.restoredTitle,
          body: lastSuccess === 'purchased' ? PAYWALL.purchasedMessage : PAYWALL.restoredMessage,
          positive: true,
        }
      : lastFailure != null && lastFailure !== 'cancelled'
        ? {
            title: PURCHASE_OUTCOME_TITLE[lastFailure],
            body: PURCHASE_OUTCOME_COPY[lastFailure],
            positive: false,
          }
        : null;

  const alreadyOpen = phase === 'entitled';
  const resolving = phase === 'unknown';

  return (
    <Screen
      eyebrow={PAYWALL.eyebrow}
      title={PAYWALL.title}
      onBack={close}
      backLabel={PAYWALL.closeLabel}
    >
      <Card variant="raised" spectral padding="xl" style={styles.gutter}>
        <Text variant="title2">{alreadyOpen ? PAYWALL.purchasedTitle : PAYWALL.lede}</Text>
        <Text variant="bodySm" tone="secondary" style={styles.ledeDetail}>
          {alreadyOpen ? PAYWALL.purchasedMessage : PAYWALL.oneTimeNote}
        </Text>
      </Card>

      <SectionHeader title={PAYWALL.unlocksHeading} />
      <Card padding="lg" style={styles.gutter}>
        {PAYWALL.unlocks.map((item, index) => (
          <View key={item.title} style={[styles.feature, index > 0 && styles.divided]}>
            <View style={styles.icon}>
              <Ionicons name={item.icon} size={17} color={color.violetBright} />
            </View>
            <View style={styles.featureText}>
              <Text variant="title3">{item.title}</Text>
              <Text variant="bodySm" tone="secondary" style={styles.featureBody}>
                {item.body}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <SectionHeader title={PAYWALL.freeHeading} />
      <Card padding="lg" style={styles.gutter}>
        {PAYWALL.freeForever.map((item) => (
          <View key={item} style={styles.freeRow}>
            <Ionicons name="checkmark-circle" size={17} color={color.positive} />
            <Text variant="bodySm" tone="secondary" style={styles.freeText}>
              {item}
            </Text>
          </View>
        ))}
      </Card>

      {outcome ? (
        <Card variant="outline" padding="lg" style={styles.gutter}>
          <Text variant="title3" tone={outcome.positive ? 'positive' : 'coral'}>
            {outcome.title}
          </Text>
          <Text variant="bodySm" tone="secondary" style={styles.outcomeBody}>
            {outcome.body}
          </Text>
        </Card>
      ) : null}

      {!alreadyOpen && (!purchaseReady || !priceString) && !resolving ? (
        <Text variant="bodySm" tone="coral" style={styles.notice}>
          {PAYWALL.unavailableNotice}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {!alreadyOpen ? (
          <>
            <Button
              label={paywallPurchaseLabel(priceString)}
              loading={pending === 'purchase'}
              disabled={pending !== null || resolving || !purchaseReady || !priceString}
              fullWidth
              onPress={() => {
                clearOutcome();
                void purchase();
              }}
            />
            <Text variant="bodySm" tone="faint" style={styles.storeNote}>
              {PAYWALL.storeNote}
            </Text>
          </>
        ) : null}

        <Button
          label={pending === 'restore' ? PAYWALL.restoreBusyLabel : PAYWALL.restoreLabel}
          variant="secondary"
          loading={pending === 'restore'}
          disabled={pending !== null || resolving || !purchaseReady}
          fullWidth
          onPress={() => {
            clearOutcome();
            void restore();
          }}
        />
        <Button
          label={alreadyOpen ? PAYWALL.closeLabel : PAYWALL.dismissLabel}
          variant="ghost"
          disabled={pending !== null}
          fullWidth
          onPress={close}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg },
  ledeDetail: { marginTop: space.md },
  feature: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: color.violetWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1 },
  featureBody: { marginTop: space.xs },
  freeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm },
  freeText: { flex: 1 },
  outcomeBody: { marginTop: space.sm },
  notice: { marginHorizontal: space.lg, marginTop: space.base },
  actions: { marginHorizontal: space.lg, marginTop: space.xl, gap: space.sm },
  storeNote: { textAlign: 'center', paddingHorizontal: space.md },
});
