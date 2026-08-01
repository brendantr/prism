import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Text } from '@/components/ui';
import { useTrainingStore } from '@/store/trainingStore';
import { newId } from '@/utils/id';
import { space } from '@/theme';
import type { CheckIn } from '@/domain/types';

/** The four scales, in the order they are asked. */
const SCALES = [
  { field: 'sleepQuality', label: 'Sleep quality' },
  { field: 'energy', label: 'Energy' },
  { field: 'soreness', label: 'Soreness' },
  { field: 'stress', label: 'Stress' },
] as const;

const VALUES = [1, 2, 3, 4, 5] as const;

/**
 * Shown when the save itself fails. Deliberately says nothing about why: the
 * underlying error can name Supabase schema constraints, which is information
 * for a log, not for someone standing in a gym.
 */
const SAVE_ERROR = "We couldn't update your check-in. Try again.";

type ScaleField = (typeof SCALES)[number]['field'];
type Draft = Record<ScaleField, number | null>;

export interface CheckInPromptProps {
  /**
   * Local draft state, not an ownership claim. The repository overwrites it
   * with the signed-in session's id before the row reaches Postgres, so this
   * value never decides who a check-in belongs to and must not gate anything.
   */
  profileId: string;
  /** Today's check-in, if the lifter has already answered anything today. */
  checkIn: CheckIn | null;
}

/**
 * CHECK-IN
 * ========
 * Four optional scales, each answered on its own. Nothing here is required:
 * a lifter who only ever taps "Sleep quality" still gets a sharper readiness
 * score than one who taps nothing, and a field left alone is recorded as
 * unanswered rather than quietly filled in with a middling number.
 *
 * Submitting again later in the day patches today's check-in instead of
 * starting a second one.
 */
export function CheckInPrompt({ profileId, checkIn }: CheckInPromptProps) {
  const saveCheckIn = useTrainingStore((s) => s.saveCheckIn);

  const answeredToday = checkIn != null && SCALES.some((s) => checkIn[s.field] != null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const initial = useMemo<Draft>(
    () => ({
      sleepQuality: checkIn?.sleepQuality ?? null,
      energy: checkIn?.energy ?? null,
      soreness: checkIn?.soreness ?? null,
      stress: checkIn?.stress ?? null,
    }),
    [checkIn],
  );
  const [draft, setDraft] = useState<Draft>(initial);

  const open = editing || !answeredToday;
  const changed = SCALES.some((s) => draft[s.field] !== initial[s.field]);
  const anyAnswered = SCALES.some((s) => draft[s.field] != null);

  const submit = async () => {
    setSaving(true);
    setFailed(false);
    try {
      await saveCheckIn({
        id: checkIn?.id ?? newId('ci'),
        profileId,
        checkedInAt: new Date().toISOString(),
        sleepQuality: draft.sleepQuality,
        energy: draft.energy,
        soreness: draft.soreness,
        stress: draft.stress,
      });
      setEditing(false);
    } catch (e) {
      // The only place the underlying error is kept. It can carry schema
      // detail, so it goes to the log and never to the screen.
      console.warn('[check-in] save failed', e);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="base" style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text variant="eyebrow" tone="muted">
            TODAY'S INPUT
          </Text>
          <Text variant="title3" style={styles.title}>
            Quick check-in
          </Text>
        </View>
        {answeredToday ? <Chip label="Checked in today" tone="cyan" icon="checkmark" /> : null}
      </View>

      {open ? (
        <>
          <Text variant="bodySm" tone="secondary" style={styles.subtitle}>
            A few taps sharpen today's guidance.
          </Text>

          <View style={styles.scales}>
            {SCALES.map((scale) => (
              <View key={scale.field} style={styles.row}>
                <Text variant="label" tone="secondary" style={styles.rowLabel}>
                  {scale.label}
                </Text>
                <View style={styles.values}>
                  {VALUES.map((value) => (
                    <Chip
                      key={value}
                      label={String(value)}
                      // `neutral` is the unselected state; Chip promotes it to
                      // violet when selected, which is the contrast we want.
                      tone="neutral"
                      selected={draft[scale.field] === value}
                      accessibilityLabel={`${scale.label}, ${value} of 5`}
                      onPress={() =>
                        setDraft((d) => ({
                          ...d,
                          // Tapping the current value clears it back to unanswered.
                          [scale.field]: d[scale.field] === value ? null : value,
                        }))
                      }
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>

          <Button
            label="Update readiness"
            variant="secondary"
            size="sm"
            loading={saving}
            disabled={saving || !anyAnswered || (answeredToday && !changed)}
            onPress={() => void submit()}
            style={styles.submit}
          />

          {failed ? (
            <Text
              variant="bodySm"
              tone="coral"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.error}
            >
              {SAVE_ERROR}
            </Text>
          ) : null}
        </>
      ) : (
        <Button
          label="Edit check-in"
          variant="ghost"
          size="sm"
          onPress={() => setEditing(true)}
          style={styles.submit}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg, marginTop: space.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  headText: { flex: 1 },
  title: { marginTop: space.xxs },
  subtitle: { marginTop: space.xs },
  scales: { marginTop: space.base, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowLabel: { flex: 1 },
  values: { flexDirection: 'row', gap: space.xs },
  submit: { marginTop: space.base },
  error: { marginTop: space.sm },
});
