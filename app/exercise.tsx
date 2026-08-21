import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  Card,
  Chip,
  Input,
  OptionRow,
  Screen,
  Text,
} from '@/components/ui';
import {
  CUSTOM_EXERCISE_PROBLEM,
  EQUIPMENT_LABEL,
  EXERCISE_COPY,
  MUSCLE_LABEL,
} from '@/content/userData';
import { isExerciseInUseError } from '@/data/repositoryErrors';
import {
  canEditExercise,
  draftFromExercise,
  emptyExerciseDraft,
  exerciseUsage,
  validateCustomExercise,
  type CustomExerciseDraft,
} from '@/domain/customExercise';
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  type Equipment,
  type MuscleGroup,
} from '@/domain/types';
import { useActiveWorkoutStore } from '@/store/activeWorkoutStore';
import { useTrainingStore } from '@/store/trainingStore';
import { space } from '@/theme';

type Params = { id?: string; addToWorkout?: string };

/** One modal for creating and editing user-owned movements. */
export default function ExerciseEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const exercises = useTrainingStore((s) => s.exercises);
  const workouts = useTrainingStore((s) => s.workouts);
  const createExercise = useTrainingStore((s) => s.createExercise);
  const updateExercise = useTrainingStore((s) => s.updateExercise);
  const deleteExercise = useTrainingStore((s) => s.deleteExercise);
  const activeWorkout = useActiveWorkoutStore((s) => s.workout);
  const addExercise = useActiveWorkoutStore((s) => s.addExercise);

  const existing = params.id ? exercises.find((exercise) => exercise.id === params.id) : null;
  const editing = existing != null;
  const [draft, setDraft] = useState<CustomExerciseDraft>(() =>
    existing ? draftFromExercise(existing) : emptyExerciseDraft(),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  if (params.id && (!existing || !canEditExercise(existing))) {
    return (
      <Screen
        eyebrow={EXERCISE_COPY.eyebrow}
        title={EXERCISE_COPY.editTitle}
        onBack={() => router.back()}
        backLabel="Close movement editor"
      >
        <Card style={styles.gutter} padding="lg">
          <Text variant="bodySm" tone="secondary">
            This Repello movement is part of the shared library and cannot be edited.
          </Text>
        </Card>
      </Screen>
    );
  }

  const patch = (next: Partial<CustomExerciseDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setProblem(null);
  };

  const toggleMuscle = (field: 'primaryMuscles' | 'secondaryMuscles', muscle: MuscleGroup) => {
    setDraft((current) => {
      const selected = current[field].includes(muscle);
      const opposite = field === 'primaryMuscles' ? 'secondaryMuscles' : 'primaryMuscles';
      return {
        ...current,
        [field]: selected
          ? current[field].filter((candidate) => candidate !== muscle)
          : [...current[field], muscle],
        [opposite]: selected
          ? current[opposite]
          : current[opposite].filter((candidate) => candidate !== muscle),
      };
    });
    setProblem(null);
  };

  const save = async () => {
    const validated = validateCustomExercise(draft);
    if (!validated.ok) {
      setProblem(CUSTOM_EXERCISE_PROBLEM[validated.problem]);
      return;
    }

    setBusy('save');
    try {
      const saved = editing
        ? await updateExercise(existing.id, validated.value)
        : await createExercise(validated.value);

      if (!editing && params.addToWorkout === 'true') {
        addExercise(saved.id, { sets: 3, reps: 8, rest: 120 });
        router.replace('/workout/active');
      } else {
        router.back();
      }
    } catch (error) {
      console.warn('[exercise] save failed', error);
      Alert.alert(EXERCISE_COPY.saveFailedTitle, EXERCISE_COPY.saveFailedMessage);
    } finally {
      setBusy(null);
    }
  };

  const requestDelete = () => {
    if (!existing) return;
    if (activeWorkout?.exercises.some((block) => block.exerciseId === existing.id)) {
      Alert.alert(EXERCISE_COPY.inUseTitle, EXERCISE_COPY.activeUseMessage(existing.name));
      return;
    }

    const usage = exerciseUsage(existing.id, workouts);
    if (usage.workouts > 0) {
      Alert.alert(
        EXERCISE_COPY.inUseTitle,
        EXERCISE_COPY.inUseMessage(existing.name, usage.workouts, usage.sets),
      );
      return;
    }

    Alert.alert(EXERCISE_COPY.deleteTitle, EXERCISE_COPY.deleteUnusedMessage(existing.name), [
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
      await deleteExercise(id);
      router.back();
    } catch (error) {
      console.warn('[exercise] delete failed', error);
      Alert.alert(
        isExerciseInUseError(error) ? EXERCISE_COPY.inUseTitle : EXERCISE_COPY.deleteFailedTitle,
        isExerciseInUseError(error)
          ? EXERCISE_COPY.inUseFallbackMessage(existing?.name ?? 'This movement')
          : EXERCISE_COPY.deleteFailedMessage,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      eyebrow={EXERCISE_COPY.eyebrow}
      title={editing ? EXERCISE_COPY.editTitle : EXERCISE_COPY.createTitle}
      onBack={() => router.back()}
      backLabel="Close movement editor"
    >
      <Card style={styles.gutter} padding="lg">
        <Input
          label={EXERCISE_COPY.nameLabel}
          value={draft.name}
          onChangeText={(name) => patch({ name })}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={80}
        />

        <Text variant="eyebrow" tone="faint" style={styles.label}>
          {EXERCISE_COPY.equipmentLabel}
        </Text>
        <View style={styles.chips}>
          {EQUIPMENT.map((value) => (
            <Chip
              key={value}
              label={EQUIPMENT_LABEL[value]}
              selected={draft.equipment === value}
              onPress={() => patch({ equipment: value as Equipment })}
            />
          ))}
        </View>

        <Text variant="eyebrow" tone="faint" style={styles.label}>
          {EXERCISE_COPY.primaryLabel}
        </Text>
        <View style={styles.chips}>
          {MUSCLE_GROUPS.map((muscle) => (
            <Chip
              key={muscle}
              label={MUSCLE_LABEL[muscle]}
              tone="violet"
              selected={draft.primaryMuscles.includes(muscle)}
              onPress={() => toggleMuscle('primaryMuscles', muscle)}
            />
          ))}
        </View>

        <Text variant="eyebrow" tone="faint" style={styles.label}>
          {EXERCISE_COPY.secondaryLabel}
        </Text>
        <View style={styles.chips}>
          {MUSCLE_GROUPS.map((muscle) => (
            <Chip
              key={muscle}
              label={MUSCLE_LABEL[muscle]}
              selected={draft.secondaryMuscles.includes(muscle)}
              onPress={() => toggleMuscle('secondaryMuscles', muscle)}
            />
          ))}
        </View>

        <View style={styles.option}>
          <OptionRow
            label={EXERCISE_COPY.unilateralLabel}
            description={EXERCISE_COPY.unilateralDescription}
            selected={draft.isUnilateral}
            onPress={() => patch({ isUnilateral: !draft.isUnilateral })}
          />
        </View>

        <Input
          label={EXERCISE_COPY.cueLabel}
          hint={EXERCISE_COPY.cueHint}
          value={draft.cue}
          onChangeText={(cue) => patch({ cue })}
          maxLength={240}
          style={styles.option}
        />
      </Card>

      {problem ? (
        <Text variant="bodySm" tone="coral" accessibilityRole="alert" style={styles.problem}>
          {problem}
        </Text>
      ) : null}

      <Button
        label={
          busy === 'save'
            ? 'Saving movement…'
            : editing
              ? EXERCISE_COPY.updateAction
              : params.addToWorkout === 'true'
                ? EXERCISE_COPY.createAndAddAction
                : EXERCISE_COPY.createAction
        }
        fullWidth
        size="lg"
        loading={busy === 'save'}
        disabled={busy !== null}
        onPress={() => void save()}
        style={styles.action}
      />

      {editing ? (
        <Button
          label={busy === 'delete' ? EXERCISE_COPY.deletingAction : EXERCISE_COPY.deleteAction}
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
  label: { marginTop: space.xl, marginBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: { marginTop: space.xl },
  problem: { marginHorizontal: space.lg, marginTop: space.md },
  action: { marginHorizontal: space.lg, marginTop: space.xl },
  delete: { marginHorizontal: space.lg, marginTop: space.md, marginBottom: space.xl },
});
