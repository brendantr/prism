import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  Chip,
  EmptyState,
  ListRow,
  Screen,
  ScreenState,
  SearchField,
  SegmentedControl,
  Text,
  type SegmentedOption,
} from '@/components/ui';
import { MUSCLE_META, REGION_LABEL, type MuscleRegion } from '@/domain/muscles';
import { canEditExercise } from '@/domain/customExercise';
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  type Equipment,
  type Exercise,
  type MuscleGroup,
} from '@/domain/types';
import { useActiveWorkoutStore } from '@/store/activeWorkoutStore';
import { useTrainingStore } from '@/store/trainingStore';
import { color, opacity, space } from '@/theme';

/**
 * EXERCISES
 * =========
 * Browsing the catalogue as a destination in its own right, rather than only as
 * a modal reached mid-session.
 *
 * Three ideas, in order of importance:
 *
 *   1. **Filters compose.** Text, region, equipment and favourites narrow the
 *      same set rather than replacing each other, so nothing a lifter has
 *      already typed is silently discarded by tapping a chip.
 *   2. **Grouping is separate from filtering.** A segmented control changes what
 *      the list *is* (sections by muscle, by equipment, alphabetical); chips
 *      change what it *contains*. Different controls because different jobs.
 *   3. **Two taps to training.** Open a row, tap the action, and you are in the
 *      logger -- through exactly the same active-workout calls the rest of the
 *      app uses, not a second way to create a session.
 *
 * The mid-session picker (`app/workout/picker.tsx`) stays as it is. Its job is
 * "add this to the session I am in", which wants a flat list and an instant
 * add, not sections and a detail expansion.
 */

const REGIONS: MuscleRegion[] = ['push', 'pull', 'legs', 'core'];

type GroupBy = 'muscle' | 'equipment' | 'name';

const GROUP_OPTIONS: SegmentedOption<GroupBy>[] = [
  { value: 'muscle', label: 'Muscle', accessibilityLabel: 'Group by muscle' },
  { value: 'equipment', label: 'Kit', accessibilityLabel: 'Group by equipment' },
  { value: 'name', label: 'A–Z', accessibilityLabel: 'Group alphabetically' },
];

/**
 * Display names for the equipment union. The chip rows can lean on `Chip`'s
 * uppercasing, but a section heading needs real sentence casing.
 */
const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
  smith: 'Smith machine',
};

interface Section {
  key: string;
  title: string;
  data: Exercise[];
}

export default function ExercisesScreen() {
  const router = useRouter();

  const exercises = useTrainingStore((s) => s.exercises);
  const favourites = useTrainingStore((s) => s.favouriteExerciseIds);
  const toggleFavourite = useTrainingStore((s) => s.toggleFavourite);
  const profile = useTrainingStore((s) => s.profile);
  const status = useTrainingStore((s) => s.status);
  const loadError = useTrainingStore((s) => s.error);
  const refresh = useTrainingStore((s) => s.refresh);

  const activeWorkout = useActiveWorkoutStore((s) => s.workout);
  const startWorkout = useActiveWorkoutStore((s) => s.start);
  const addExercise = useActiveWorkoutStore((s) => s.addExercise);
  const draftPendingReview = useActiveWorkoutStore((s) => s.draftPendingReview);

  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<MuscleRegion | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('muscle');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filterCount = (region ? 1 : 0) + (equipment ? 1 : 0) + (favouritesOnly ? 1 : 0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const regionMuscles: Set<MuscleGroup> | null = region
      ? new Set(MUSCLE_GROUPS.filter((m) => MUSCLE_META[m].region === region))
      : null;

    return exercises.filter((e) => {
      if (favouritesOnly && !favourites.includes(e.id)) return false;
      if (equipment && e.equipment !== equipment) return false;
      if (regionMuscles && !e.primaryMuscles.some((m) => regionMuscles.has(m))) return false;
      if (needle) {
        const haystack = `${e.name} ${e.equipment} ${e.primaryMuscles.join(' ')}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [exercises, query, region, equipment, favouritesOnly, favourites]);

  const sections = useMemo(() => buildSections(filtered, groupBy, favourites), [filtered, groupBy, favourites]);

  const clearFilters = () => {
    setQuery('');
    setRegion(null);
    setEquipment(null);
    setFavouritesOnly(false);
  };

  /**
   * Straight into the logger. Reuses the existing active-workout calls so this
   * screen adds an entry point, not a second way to build a session -- the
   * third of the three D4 names (`Docs/ui-ux-foundation-v1.md`), and the only
   * one that starts an *open* session rather than a template one.
   *
   * The one case it must not act on is a recovered draft the lifter has not
   * reviewed yet: adding a lift to it would silently accept a session they
   * have not agreed to keep, pre-empting the Resume/Discard decision Today
   * owns (D5). Adding to a session that is merely *active* is correct and
   * unchanged -- that is the intent of tapping "log this lift" mid-session.
   */
  const logExercise = (exercise: Exercise) => {
    if (!profile) return;

    if (draftPendingReview) {
      Alert.alert(
        'Recovered session waiting',
        `"${activeWorkout?.title ?? 'A session'}" was still in progress when the app closed. Resume or discard it on Today before starting something new.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Today', onPress: () => router.push('/') },
        ],
      );
      return;
    }

    if (!activeWorkout) {
      startWorkout({ profileId: profile.id, title: 'Open session', routineDay: null });
    }
    addExercise(exercise.id, { sets: 3, reps: 8, rest: 120 });
    router.push('/workout/active');
  };

  // Same chrome in every state, so the header does not move when the body
  // swaps between loading, error and the list.
  const header = { eyebrow: 'Every movement Repello knows', title: 'Exercises' } as const;

  if (status !== 'ready') {
    return (
      <Screen scroll={false} {...header}>
        <ScreenState
          phase={status}
          onRetry={() => void refresh()}
          errorMessage={loadError}
          loadingLabel="Loading the exercise library…"
        />
      </Screen>
    );
  }

  return (
    <Screen
      scroll={false}
      {...header}
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a custom movement"
          onPress={() => router.push('/exercise')}
          hitSlop={10}
          style={({ pressed }) => [styles.addButton, pressed && { opacity: opacity.pressed }]}
        >
          <Ionicons name="add" size={22} color={color.violetBright} />
        </Pressable>
      }
    >
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name, muscle or kit"
        accessibilityLabel="Search exercises by name, muscle or equipment"
        style={styles.search}
      />

      <View style={styles.group}>
        <SegmentedControl
          options={GROUP_OPTIONS}
          value={groupBy}
          onChange={setGroupBy}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        <Chip
          label="Favourites"
          icon="star"
          tone="violet"
          selected={favouritesOnly}
          onPress={() => setFavouritesOnly((v) => !v)}
        />
        {REGIONS.map((r) => (
          <Chip
            key={r}
            label={REGION_LABEL[r]}
            selected={region === r}
            onPress={() => setRegion(region === r ? null : r)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        {EQUIPMENT.map((eq) => (
          <Chip
            key={eq}
            label={eq}
            tone="cyan"
            accessibilityLabel={EQUIPMENT_LABEL[eq]}
            selected={equipment === eq}
            onPress={() => setEquipment(equipment === eq ? null : eq)}
          />
        ))}
      </ScrollView>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <Text variant="eyebrow" tone="faint" style={styles.count}>
            {`${filtered.length} ${filtered.length === 1 ? 'exercise' : 'exercises'}`}
            {filterCount > 0 ? ` · ${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}` : ''}
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            title="Nothing matches those filters"
            body="Try a muscle name like “lats”, or clear what you have set."
            actionLabel={filterCount > 0 || query.length > 0 ? 'Clear filters' : undefined}
            onAction={filterCount > 0 || query.length > 0 ? clearFilters : undefined}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <Text variant="eyebrow" tone="muted">
              {section.title}
            </Text>
            <Text variant="eyebrow" tone="faint">
              {section.data.length}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <ExerciseItem
            exercise={item}
            expanded={expandedId === item.id}
            isFavourite={favourites.includes(item.id)}
            hasActiveWorkout={activeWorkout != null}
            onToggleExpanded={() => setExpandedId((id) => (id === item.id ? null : item.id))}
            onToggleFavourite={() => toggleFavourite(item.id)}
            onLog={() => logExercise(item)}
            onEdit={() => router.push({ pathname: '/exercise', params: { id: item.id } })}
          />
        )}
      />
    </Screen>
  );
}

// --- Row -------------------------------------------------------------------

interface ExerciseItemProps {
  exercise: Exercise;
  expanded: boolean;
  isFavourite: boolean;
  hasActiveWorkout: boolean;
  onToggleExpanded: () => void;
  onToggleFavourite: () => void;
  onLog: () => void;
  onEdit: () => void;
}

/**
 * A result row, which expands in place rather than pushing a detail screen.
 * Browsing is a comparison task -- losing the list to read one cue means
 * navigating back to compare against the next candidate.
 */
function ExerciseItem({
  exercise,
  expanded,
  isFavourite,
  hasActiveWorkout,
  onToggleExpanded,
  onToggleFavourite,
  onLog,
  onEdit,
}: ExerciseItemProps) {
  const primary = exercise.primaryMuscles.map((m) => MUSCLE_META[m].label);
  const secondary = exercise.secondaryMuscles.map((m) => MUSCLE_META[m].label);

  return (
    <View style={styles.item}>
      <ListRow
        title={exercise.name}
        subtitle={`${EQUIPMENT_LABEL[exercise.equipment]} · ${primary.join(', ')}`}
        onPress={onToggleExpanded}
        accessibilityLabel={`${exercise.name}. ${EQUIPMENT_LABEL[exercise.equipment]}, targets ${primary.join(
          ', ',
        )}. ${expanded ? 'Collapse' : 'Expand'} for details`}
        style={styles.itemRow}
        trailing={
          <View style={styles.trailing}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${isFavourite ? 'Remove' : 'Add'} ${exercise.name} ${
                isFavourite ? 'from' : 'to'
              } favourites`}
              accessibilityState={{ selected: isFavourite }}
              onPress={onToggleFavourite}
              hitSlop={10}
              style={({ pressed }) => [styles.star, pressed && { opacity: opacity.pressed }]}
            >
              <Ionicons
                name={isFavourite ? 'star' : 'star-outline'}
                size={17}
                color={isFavourite ? color.violetBright : color.textFaint}
              />
            </Pressable>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={color.textFaint}
            />
          </View>
        }
      />

      {expanded ? (
        <View style={styles.detail}>
          {exercise.cue ? (
            <Text variant="bodySm" tone="secondary" style={styles.cue}>
              {exercise.cue}
            </Text>
          ) : null}

          <View style={styles.muscleRow}>
            {primary.map((label) => (
              <Chip key={label} label={label} tone="violet" />
            ))}
            {secondary.map((label) => (
              <Chip key={label} label={label} accessibilityLabel={`${label}, assisting`} />
            ))}
          </View>

          <Button
            label={hasActiveWorkout ? 'Add to current session' : 'Start a session with this'}
            variant="secondary"
            size="sm"
            icon="add"
            onPress={onLog}
            style={styles.action}
          />
          {canEditExercise(exercise) ? (
            <Button
              label="Edit movement"
              variant="ghost"
              size="sm"
              icon="create-outline"
              onPress={onEdit}
              style={styles.action}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// --- Grouping --------------------------------------------------------------

/**
 * Section the filtered results along the chosen axis.
 *
 * Favourites are lifted into their own leading section on every axis: a lifter
 * who has starred a movement is usually looking for that movement, and making
 * them find it under "Quads" defeats the point of starring it.
 */
function buildSections(exercises: Exercise[], groupBy: GroupBy, favourites: string[]): Section[] {
  if (exercises.length === 0) return [];

  const byName = (a: Exercise, b: Exercise) => a.name.localeCompare(b.name);

  const starred = exercises.filter((e) => favourites.includes(e.id)).sort(byName);
  const rest = exercises.filter((e) => !favourites.includes(e.id));

  const sections: Section[] = [];
  if (starred.length > 0) sections.push({ key: 'favourites', title: 'Favourites', data: starred });

  if (groupBy === 'muscle') {
    // MUSCLE_GROUPS order is anatomical rather than alphabetical, which keeps
    // push, pull and leg work adjacent instead of interleaved.
    for (const muscle of MUSCLE_GROUPS) {
      const data = rest.filter((e) => e.primaryMuscles[0] === muscle).sort(byName);
      if (data.length > 0) {
        sections.push({ key: muscle, title: MUSCLE_META[muscle].label, data });
      }
    }
  } else if (groupBy === 'equipment') {
    for (const eq of EQUIPMENT) {
      const data = rest.filter((e) => e.equipment === eq).sort(byName);
      if (data.length > 0) sections.push({ key: eq, title: EQUIPMENT_LABEL[eq], data });
    }
  } else {
    const letters = new Map<string, Exercise[]>();
    for (const e of rest) {
      const letter = e.name.charAt(0).toUpperCase();
      letters.set(letter, [...(letters.get(letter) ?? []), e]);
    }
    for (const letter of [...letters.keys()].sort()) {
      sections.push({ key: letter, title: letter, data: (letters.get(letter) ?? []).sort(byName) });
    }
  }

  return sections;
}

const styles = StyleSheet.create({
  search: { marginHorizontal: space.lg },
  group: { marginHorizontal: space.lg, marginTop: space.md },
  /**
   * A horizontal ScrollView inside a column flex parent will fight the list
   * below it for vertical space and end up compressed -- which clipped the
   * chips in both filter rows. flexShrink: 0 is what actually takes it out of
   * that negotiation; minHeight only sets the floor for the common case (the
   * chip's own 26pt plus the row's top padding) without capping how tall the
   * row can grow.
   *
   * This used to be a fixed `height`, which solved the squeeze but created the
   * opposite failure: at large accessibility text sizes the chip labels grow
   * taller than 26pt and the fixed box clipped their tops -- confirmed
   * on-device on Exercises' two filter rows ("FAVOURITES", "PUSH", "BARBELL",
   * etc. all cut off at accessibility-extra-large). minHeight keeps the normal
   * case identical while letting the row grow instead of clip.
   */
  filterScroll: { flexGrow: 0, flexShrink: 0, minHeight: 26 + space.md },
  filterRow: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.xs },
  list: { paddingTop: space.base, paddingBottom: space.xxl },
  count: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  item: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  itemRow: { paddingHorizontal: space.lg },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  star: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  detail: {
    paddingHorizontal: space.lg,
    paddingBottom: space.base,
    gap: space.md,
  },
  cue: { lineHeight: 19 },
  muscleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  action: { alignSelf: 'flex-start' },
  addButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
