import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, ListRow, Screen, SectionHeader, Text } from '@/components/ui';
import { PhasePanel } from '@/components/ui/PhasePanel';
import { PLANNED_SURFACES, SOCIAL } from '@/content/social';
import { useTrainingStore } from '@/store/trainingStore';
import { formatRelativeDay, formatVolume } from '@/utils/format';
import { color, space } from '@/theme';

/**
 * SOCIAL
 * ======
 * A committed navigation slot with an honest shell inside it.
 *
 * The tab exists now because retrofitting a fifth destination later forces a
 * rearrangement of the whole bar. It does not exist because the feature is
 * built: there is no account, no network call, and no persisted state behind
 * this screen, and the first card on it says so.
 *
 * Nothing on this screen depicts activity that did not happen. An earlier draft
 * carried a placeholder feed -- invented rows with placeholder identities,
 * labelled three ways -- and it was cut (owner decision, 2026-07-29): a screen
 * of invented people reads as real activity no matter how it is captioned, which
 * is the failure mode `PhasePanel` already exists to avoid, and the card preview
 * below already carries the visual weight the feed was there to provide.
 *
 * So the only data on the screen is the lifter's own: the card preview is built
 * from a record they actually set, rendered in a layout that is wired to
 * nothing and marked as such.
 */
export default function SocialScreen() {
  const profile = useTrainingStore((s) => s.profile);
  const personalRecords = useTrainingStore((s) => s.personalRecords);
  const exerciseById = useTrainingStore((s) => s.exerciseById);

  const latestPr = useMemo(
    () => [...personalRecords].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))[0] ?? null,
    [personalRecords],
  );

  return (
    <Screen eyebrow={SOCIAL.eyebrow} title={SOCIAL.title}>
      <Card variant="outline" padding="lg" style={styles.gutter}>
        <View style={styles.noticeHead}>
          <Ionicons name="information-circle-outline" size={17} color={color.cyanBright} />
          <Text variant="title3" style={styles.noticeTitle}>
            {SOCIAL.notice.title}
          </Text>
        </View>
        <Text variant="bodySm" tone="secondary" style={styles.noticeBody}>
          {SOCIAL.notice.body}
        </Text>
      </Card>

      <SectionHeader title={SOCIAL.plannedTitle} eyebrow={SOCIAL.plannedEyebrow} />
      <Card style={styles.gutter} padding="base">
        {PLANNED_SURFACES.map((surface, i) => (
          <ListRow
            key={surface.id}
            title={surface.title}
            subtitle={surface.body}
            icon={surface.icon}
            iconTone="violet"
            divided={i > 0}
          />
        ))}
      </Card>

      <SectionHeader title={SOCIAL.previewTitle} eyebrow={SOCIAL.previewEyebrow} />
      {latestPr && profile ? (
        <>
          <Card variant="raised" padding="xl" spectral style={styles.gutter}>
            <View style={styles.cardHead}>
              <Text variant="eyebrow" tone="faint">
                {latestPr.kind === 'e1rm' ? 'Estimated 1RM' : 'Heaviest set'}
              </Text>
              <Chip label="Not posted" tone="neutral" icon="lock-closed" />
            </View>

            <Text variant="hero" tone="violet" style={styles.cardValue}>
              {formatVolume(latestPr.value, profile.unit)}
              <Text variant="title2" tone="muted">{` ${profile.unit}`}</Text>
            </Text>

            <Text variant="title2" numberOfLines={2}>
              {exerciseById.get(latestPr.exerciseId)?.name ?? 'Exercise'}
            </Text>
            <Text variant="bodySm" tone="faint" style={styles.cardMeta}>
              {`${latestPr.reps != null ? `${latestPr.reps} reps · ` : ''}${formatRelativeDay(latestPr.achievedAt)}`}
            </Text>
          </Card>

          <Text variant="bodySm" tone="faint" style={styles.note}>
            {SOCIAL.previewNote}
          </Text>
        </>
      ) : (
        <Card style={styles.gutter} padding="lg">
          <Text variant="bodySm" tone="muted">
            {SOCIAL.previewEmpty}
          </Text>
        </Card>
      )}

      <SectionHeader title="Coming next" eyebrow="Roadmap" />
      <PhasePanel
        phase={7}
        summary="Nothing is committed. Before any of this is built, the question is whether a social surface belongs in PRism at all."
        deliverables={[
          'An owner decision on whether social is part of the product or a held slot',
          'A sharing model where readiness, check-ins and bodyweight are never shareable',
          'Server-side identity, which PRism does not have in any form yet',
          'A block and report path, before any user-to-user content exists',
        ]}
        readyNow={[
          'PR detection, which is what a shareable card would be built from',
          'The tab slot and this shell, so adding it later does not move the bar',
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg },
  noticeHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  noticeTitle: { flex: 1 },
  noticeBody: { marginTop: space.sm, lineHeight: 19 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  cardValue: { marginTop: space.md, marginBottom: space.xs },
  cardMeta: { marginTop: space.xs },
  note: { marginHorizontal: space.lg, marginTop: space.md, lineHeight: 18 },
});
