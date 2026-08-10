import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { MEASUREMENT_COPY, MEASUREMENT_PROBLEM } from '@/content/userData';
import {
  draftFromMeasurement,
  emptyMeasurementDraft,
  validateMeasurement,
  type MeasurementDraft,
} from '@/domain/measurements';
import { useTrainingStore } from '@/store/trainingStore';
import { space } from '@/theme';
import { newId } from '@/utils/id';

type Params = { id?: string };

/** Add or edit one optional body-measurement record. */
export default function MeasurementEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const profile = useTrainingStore((s) => s.profile);
  const measurements = useTrainingStore((s) => s.measurements);
  const saveMeasurement = useTrainingStore((s) => s.saveMeasurement);
  const deleteMeasurement = useTrainingStore((s) => s.deleteMeasurement);
  const existing = params.id
    ? measurements.find((measurement) => measurement.id === params.id) ?? null
    : null;
  const [draft, setDraft] = useState<MeasurementDraft>(() =>
    existing && profile
      ? draftFromMeasurement(existing, profile.unit)
      : emptyMeasurementDraft(),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  if (!profile) return null;

  const change = (patch: Partial<MeasurementDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setProblem(null);
  };

  const save = async () => {
    const validated = validateMeasurement(draft, {
      id: existing?.id ?? newId('measure'),
      profileId: profile.id,
      measuredAt: existing?.measuredAt ?? new Date().toISOString(),
      unit: profile.unit,
      existing: existing ?? undefined,
    });
    if (!validated.ok) {
      setProblem(MEASUREMENT_PROBLEM[validated.problem]);
      return;
    }

    setBusy('save');
    try {
      await saveMeasurement(validated.value);
      router.back();
    } catch (error) {
      console.warn('[measurement] save failed', error);
      Alert.alert(MEASUREMENT_COPY.saveFailedTitle, MEASUREMENT_COPY.saveFailedMessage);
    } finally {
      setBusy(null);
    }
  };

  const requestDelete = () => {
    if (!existing) return;
    Alert.alert(MEASUREMENT_COPY.deleteTitle, MEASUREMENT_COPY.deleteMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void confirmDelete(existing.id),
      },
    ]);
  };

  const confirmDelete = async (id: string) => {
    setBusy('delete');
    try {
      await deleteMeasurement(id);
      router.back();
    } catch (error) {
      console.warn('[measurement] delete failed', error);
      Alert.alert(MEASUREMENT_COPY.deleteFailedTitle, MEASUREMENT_COPY.deleteFailedMessage);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      eyebrow={MEASUREMENT_COPY.eyebrow}
      title={existing ? MEASUREMENT_COPY.editTitle : MEASUREMENT_COPY.createTitle}
      onBack={() => router.back()}
      backLabel="Close measurement editor"
    >
      <Card style={styles.gutter} padding="lg">
        <Text variant="bodySm" tone="secondary" style={styles.explainer}>
          {MEASUREMENT_COPY.explainer}
        </Text>
        <Input
          label={MEASUREMENT_COPY.bodyweightLabel}
          hint={MEASUREMENT_COPY.bodyweightHint(profile.unit)}
          value={draft.bodyweight}
          onChangeText={(bodyweight) => change({ bodyweight })}
          inputMode="decimal"
          keyboardType="decimal-pad"
          style={styles.field}
        />
        <Input
          label={MEASUREMENT_COPY.bodyFatLabel}
          hint={MEASUREMENT_COPY.bodyFatHint}
          value={draft.bodyFatPct}
          onChangeText={(bodyFatPct) => change({ bodyFatPct })}
          inputMode="decimal"
          keyboardType="decimal-pad"
          style={styles.field}
        />
        <Input
          label={MEASUREMENT_COPY.waistLabel}
          hint={MEASUREMENT_COPY.waistHint}
          value={draft.waistCm}
          onChangeText={(waistCm) => change({ waistCm })}
          inputMode="decimal"
          keyboardType="decimal-pad"
          style={styles.field}
        />
      </Card>

      {problem ? (
        <Text variant="bodySm" tone="coral" accessibilityRole="alert" style={styles.problem}>
          {problem}
        </Text>
      ) : null}

      <Button
        label={existing ? MEASUREMENT_COPY.updateAction : MEASUREMENT_COPY.saveAction}
        fullWidth
        size="lg"
        loading={busy === 'save'}
        disabled={busy !== null}
        onPress={() => void save()}
        style={styles.action}
      />
      {existing ? (
        <Button
          label={MEASUREMENT_COPY.deleteAction}
          variant="danger"
          fullWidth
          loading={busy === 'delete'}
          disabled={busy !== null}
          onPress={requestDelete}
          style={styles.delete}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg },
  explainer: { lineHeight: 19 },
  field: { marginTop: space.xl },
  problem: { marginHorizontal: space.lg, marginTop: space.md },
  action: { marginHorizontal: space.lg, marginTop: space.xl },
  delete: { marginHorizontal: space.lg, marginTop: space.md, marginBottom: space.xl },
});
