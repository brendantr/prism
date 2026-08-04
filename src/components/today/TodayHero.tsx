import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, StatBlock, Text } from '@/components/ui';
import { color, space } from '@/theme';

export interface TodayHeroProps {
  /** Date line, already formatted for display. */
  dateLabel: string;
  /**
   * 0-100, or null when there is too little input to publish a score.
   *
   * A null score is not a zero score (`Docs/invariants.md` I-18): this card
   * renders an em dash and the "not enough input" band rather than a number.
   */
  readinessScore: number | null;
  /** Band title, or the insufficient-input title when there is no score. */
  readinessBand: string;
  sessionsDone: number;
  sessionsTarget: number;
  /** Already formatted and unit-converted by the caller. */
  volume: string;
  volumeUnit: string;
  volumeDelta?: { text: string; direction: 'up' | 'down' | 'flat' };
  /**
   * The periods the three numbers above cover, in words.
   *
   * Required rather than optional because the row mixes spans that look alike
   * and are not: readiness is right now, sessions are the calendar week, volume
   * is a rolling seven days. Insights states the rule this satisfies -- every
   * number names the span it covers, next to the number itself -- and its own
   * summary card and History's carry the same line. This card was the only one
   * of the three without it.
   */
  spanNote: string;
  /** What the plan says is next, in one line. */
  upNext: string;
  /** Shape of that session -- lifts, sets, estimated minutes. */
  upNextDetail: string | null;
}

/**
 * TODAY, AT A GLANCE
 * ==================
 * The state block. Three numbers and one line of "what's next", answering
 * "where do I stand" before the screen asks the lifter to do anything.
 *
 * It deliberately carries NO call to action. The session card immediately below
 * owns the only filled button on Today -- a summary block with its own start
 * button would give the screen two competing primary actions, which is exactly
 * what the one-dominant-action rule exists to prevent.
 *
 * Every value here is passed in already derived. This component computes
 * nothing, so the numbers it shows cannot drift from the numbers the rest of
 * the screen shows.
 */
export function TodayHero({
  dateLabel,
  readinessScore,
  readinessBand,
  sessionsDone,
  sessionsTarget,
  volume,
  volumeUnit,
  volumeDelta,
  spanNote,
  upNext,
  upNextDetail,
}: TodayHeroProps) {
  const onTarget = sessionsDone >= sessionsTarget;

  return (
    <Card variant="raised" padding="lg" spectral style={styles.card}>
      <Text variant="eyebrow" tone="faint">
        {dateLabel}
      </Text>

      <View style={styles.stats}>
        <StatBlock
          label="Readiness"
          value={readinessScore != null ? String(readinessScore) : '—'}
          unit={readinessScore != null ? readinessBand : undefined}
          tone={readinessScore != null ? 'violet' : 'primary'}
        />
        <View style={styles.divider} />
        {/*
          No `unit` here on purpose. It used to carry "this week" / "on target",
          which the note below now says once for the whole card -- and a phrase
          in that slot breaks `StatBlock`'s layout contract: the unit holds its
          full width and the value shrinks into what is left, which is right for
          "kg" and wrong for two words. At the accessibility text sizes it
          squeezed "0/4" down to almost nothing. Being on target is carried by
          the cyan tone instead.
        */}
        <StatBlock
          label="Sessions"
          value={`${sessionsDone}/${sessionsTarget}`}
          tone={onTarget ? 'cyan' : 'primary'}
        />
        <View style={styles.divider} />
        <StatBlock label="Volume" value={volume} unit={volumeUnit} delta={volumeDelta} />
      </View>

      {readinessScore == null ? (
        <Text variant="bodySm" tone="muted" style={styles.noScore}>
          {readinessBand}
        </Text>
      ) : null}

      <Text variant="bodySm" tone="faint" style={styles.spanNote}>
        {spanNote}
      </Text>

      <View style={styles.next}>
        <Ionicons name="arrow-forward-circle-outline" size={15} color={color.violetBright} />
        <View style={styles.nextText}>
          <Text variant="label" numberOfLines={1}>
            {upNext}
          </Text>
          {upNextDetail ? (
            <Text variant="bodySm" tone="faint" numberOfLines={1}>
              {upNextDetail}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg },
  stats: { flexDirection: 'row', marginTop: space.base },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.line,
    marginHorizontal: space.md,
  },
  noScore: { marginTop: space.md },
  spanNote: { marginTop: space.md, lineHeight: 18 },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  nextText: { flex: 1 },
});
