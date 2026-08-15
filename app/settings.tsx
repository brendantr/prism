import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Card,
  Chip,
  Input,
  ListRow,
  OptionRow,
  Screen,
  SectionHeader,
  SegmentedControl,
  Text,
  type SegmentedOption,
} from '@/components/ui';
import {
  EQUIPMENT_LABEL,
  EXPERIENCE_LABEL,
  GOAL_LABEL,
  SETTINGS_COPY,
  UNIT_LABEL,
  WEEKDAY_LABEL,
} from '@/content/userData';
import {
  bodyweightFieldValue,
  parseBodyweight,
  planSelectionWrite,
  toggleWeekday,
  validateDisplayName,
} from '@/domain/settings';
import {
  EQUIPMENT,
  type Equipment,
  type Experience,
  type Goal,
  type Unit,
} from '@/domain/types';
import { useSessionStore } from '@/store/sessionStore';
import { useTrainingStore } from '@/store/trainingStore';
import { space } from '@/theme';

const UNIT_OPTIONS: SegmentedOption<Unit>[] = [
  { value: 'kg', label: 'KG', accessibilityLabel: UNIT_LABEL.kg },
  { value: 'lb', label: 'LB', accessibilityLabel: UNIT_LABEL.lb },
];

const GOALS = Object.keys(GOAL_LABEL) as Goal[];
const EXPERIENCES = Object.keys(EXPERIENCE_LABEL) as Experience[];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const TRAINING_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Profile and training preferences. Account lifecycle stays on `/account`. */
export default function SettingsScreen() {
  const router = useRouter();
  const profile = useTrainingStore((s) => s.profile);
  const routines = useTrainingStore((s) => s.routines);
  const activeRoutine = useTrainingStore((s) => s.activeRoutine);
  const updateProfile = useTrainingStore((s) => s.updateProfile);
  const selectRoutine = useTrainingStore((s) => s.selectRoutine);
  const sessionPhase = useSessionStore((s) => s.phase);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [unit, setUnit] = useState<Unit>(profile?.unit ?? 'kg');
  const [bodyweight, setBodyweight] = useState(
    profile ? bodyweightFieldValue(profile.bodyweightKg, profile.unit) : '',
  );
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? 'hypertrophy');
  const [experience, setExperience] = useState<Experience>(
    profile?.experience ?? 'intermediate',
  );
  const [trainingDays, setTrainingDays] = useState(profile?.trainingDaysPerWeek ?? 4);
  const [weekdays, setWeekdays] = useState<number[]>(profile?.preferredWeekdays ?? []);
  const [equipment, setEquipment] = useState<Equipment[]>(profile?.availableEquipment ?? []);
  const [selectedRoutineId, setSelectedRoutineId] = useState(activeRoutine?.id ?? '');
  const [nameError, setNameError] = useState<string | undefined>();
  const [bodyweightError, setBodyweightError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const selectedRoutine = useMemo(
    () => routines.find((routine) => routine.id === selectedRoutineId) ?? null,
    [routines, selectedRoutineId],
  );

  if (!profile) return null;

  const changeUnit = (next: Unit) => {
    const parsed = parseBodyweight(bodyweight, unit);
    if (parsed.ok) setBodyweight(bodyweightFieldValue(parsed.kg, next));
    setUnit(next);
    setBodyweightError(undefined);
  };

  const choosePlan = (routineId: string) => {
    const routine = routines.find((candidate) => candidate.id === routineId);
    if (!routine) return;
    setSelectedRoutineId(routine.id);
    const write = planSelectionWrite(routine);
    if (write.kind !== 'profile') return;
    if (write.patch.trainingDaysPerWeek != null) {
      setTrainingDays(write.patch.trainingDaysPerWeek);
    }
    if (write.patch.preferredWeekdays) setWeekdays(write.patch.preferredWeekdays);
  };

  const chooseTrainingDays = (value: number) => {
    setTrainingDays(value);

    // Shared plans are selected through this same profile field. Keep the
    // radio state honest when the lifter changes the number directly. An owned
    // plan is explicitly selected via its own flag, so its selection remains.
    if (selectedRoutine?.profileId != null) return;
    const matching = routines
      .filter((routine) => routine.profileId == null && routine.daysPerWeek === value)
      .sort((a, b) => a.name.localeCompare(b.name))[0];
    setSelectedRoutineId(matching?.id ?? '');
  };

  const save = async () => {
    const checkedName = validateDisplayName(displayName);
    const checkedBodyweight = parseBodyweight(bodyweight, unit);
    setNameError(
      checkedName.ok
        ? undefined
        : checkedName.problem === 'missing'
          ? SETTINGS_COPY.displayNameRequired
          : SETTINGS_COPY.displayNameLong,
    );
    setBodyweightError(checkedBodyweight.ok ? undefined : SETTINGS_COPY.bodyweightError);
    if (!checkedName.ok || !checkedBodyweight.ok) return;

    setSaving(true);
    try {
      await updateProfile({
        displayName: checkedName.value,
        unit,
        bodyweightKg: checkedBodyweight.kg,
        goal,
        experience,
        trainingDaysPerWeek: trainingDays,
        preferredWeekdays: weekdays,
        availableEquipment: equipment,
      });

      // Shared templates are already represented by the profile patch above.
      // An owned routine uses its own `is_active` flag instead.
      if (selectedRoutine?.profileId != null && selectedRoutine.id !== activeRoutine?.id) {
        await selectRoutine(selectedRoutine.id);
      }
      router.back();
    } catch (error) {
      console.warn('[settings] save failed', error);
      Alert.alert(SETTINGS_COPY.failedTitle, SETTINGS_COPY.failedMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      eyebrow={SETTINGS_COPY.eyebrow}
      title={SETTINGS_COPY.title}
      onBack={() => router.back()}
      backLabel="Close settings"
    >
      <SectionHeader title={SETTINGS_COPY.profileSection} />
      <Card style={styles.gutter} padding="lg">
        <Input
          label={SETTINGS_COPY.displayNameLabel}
          hint={SETTINGS_COPY.displayNameHint}
          error={nameError}
          value={displayName}
          onChangeText={(value) => {
            setDisplayName(value);
            setNameError(undefined);
          }}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={80}
        />
        <View style={styles.fieldGap}>
          <SegmentedControl
            label={SETTINGS_COPY.unitLabel}
            options={UNIT_OPTIONS}
            value={unit}
            onChange={changeUnit}
          />
        </View>
        <Input
          label={SETTINGS_COPY.bodyweightLabel}
          hint={SETTINGS_COPY.bodyweightHint(unit)}
          error={bodyweightError}
          value={bodyweight}
          onChangeText={(value) => {
            setBodyweight(value);
            setBodyweightError(undefined);
          }}
          inputMode="decimal"
          keyboardType="decimal-pad"
          style={styles.fieldGap}
        />
      </Card>

      <SectionHeader title={SETTINGS_COPY.trainingSection} />
      <Text variant="eyebrow" tone="faint" style={styles.fieldLabel}>
        {SETTINGS_COPY.goalLabel}
      </Text>
      <View style={styles.optionList}>
        {GOALS.map((value) => (
          <OptionRow
            key={value}
            mode="radio"
            label={GOAL_LABEL[value]}
            selected={goal === value}
            onPress={() => setGoal(value)}
          />
        ))}
      </View>

      <Text variant="eyebrow" tone="faint" style={styles.fieldLabel}>
        {SETTINGS_COPY.experienceLabel}
      </Text>
      <View style={styles.optionList}>
        {EXPERIENCES.map((value) => (
          <OptionRow
            key={value}
            mode="radio"
            label={EXPERIENCE_LABEL[value]}
            selected={experience === value}
            onPress={() => setExperience(value)}
          />
        ))}
      </View>

      <Text variant="eyebrow" tone="faint" style={styles.fieldLabel}>
        {SETTINGS_COPY.daysLabel}
      </Text>
      <View style={styles.chips}>
        {TRAINING_DAYS.map((value) => (
          <Chip
            key={value}
            label={String(value)}
            selected={trainingDays === value}
            onPress={() => chooseTrainingDays(value)}
            accessibilityLabel={`${value} ${value === 1 ? 'session' : 'sessions'} per week`}
          />
        ))}
      </View>

      <Text variant="eyebrow" tone="faint" style={styles.fieldLabel}>
        {SETTINGS_COPY.weekdaysLabel}
      </Text>
      <Text variant="bodySm" tone="faint" style={styles.hint}>
        {SETTINGS_COPY.weekdaysHint}
      </Text>
      <View style={styles.chips}>
        {WEEKDAYS.map((value) => (
          <Chip
            key={value}
            label={WEEKDAY_LABEL[value]}
            selected={weekdays.includes(value)}
            onPress={() => setWeekdays((current) => toggleWeekday(current, value))}
          />
        ))}
      </View>

      <SectionHeader title={SETTINGS_COPY.planSection} />
      <Text variant="bodySm" tone="faint" style={styles.sectionHint}>
        {SETTINGS_COPY.planHint}
      </Text>
      <View style={styles.optionList}>
        {routines.map((routine) => (
          <OptionRow
            key={routine.id}
            mode="radio"
            label={routine.name}
            description={`${routine.daysPerWeek} sessions · ${routine.description}`}
            selected={selectedRoutineId === routine.id}
            onPress={() => choosePlan(routine.id)}
          />
        ))}
      </View>

      <SectionHeader title={SETTINGS_COPY.equipmentSection} />
      <View style={styles.optionList}>
        {EQUIPMENT.map((value) => (
          <OptionRow
            key={value}
            label={EQUIPMENT_LABEL[value]}
            selected={equipment.includes(value)}
            onPress={() =>
              setEquipment((current) =>
                current.includes(value)
                  ? current.filter((candidate) => candidate !== value)
                  : [...current, value],
              )
            }
          />
        ))}
      </View>

      {sessionPhase === 'authenticated' ? (
        <>
          <SectionHeader title={SETTINGS_COPY.accountSection} />
          <Card style={styles.gutter} padding="none">
            <ListRow
              title={SETTINGS_COPY.accountLabel}
              subtitle={SETTINGS_COPY.accountSubtitle}
              icon="person-outline"
              iconTone="violet"
              chevron
              onPress={() => router.push('/account')}
            />
          </Card>
        </>
      ) : null}

      <Button
        label={saving ? SETTINGS_COPY.saving : SETTINGS_COPY.save}
        loading={saving}
        disabled={saving}
        fullWidth
        size="lg"
        onPress={() => void save()}
        style={styles.save}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg },
  fieldGap: { marginTop: space.xl },
  fieldLabel: { marginHorizontal: space.lg, marginTop: space.xl },
  hint: { marginHorizontal: space.lg, marginTop: space.xs },
  sectionHint: { marginHorizontal: space.lg, marginBottom: space.md },
  optionList: { marginHorizontal: space.lg, gap: space.sm },
  chips: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  save: { marginHorizontal: space.lg, marginTop: space.xxl, marginBottom: space.xl },
});
