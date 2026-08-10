import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Chip, SearchField, Text } from '@/components/ui';
import { MUSCLE_META, REGION_LABEL, type MuscleRegion } from '@/domain/muscles';
import { EQUIPMENT, type Equipment, type Exercise, type MuscleGroup } from '@/domain/types';
import { useActiveWorkoutStore } from '@/store/activeWorkoutStore';
import { useTrainingStore } from '@/store/trainingStore';
import { a11y, color, opacity, space } from '@/theme';

/**
 * EXERCISE PICKER
 * ===============
 * Three filter axes -- text, muscle region, equipment -- that compose rather
 * than replace each other, plus favourites pinned to the top.
 *
 * Filters live above the list and stay visible while scrolling: mid-session you
 * are usually narrowing, not starting over.
 */

const REGIONS: MuscleRegion[] = ['push', 'pull', 'legs', 'core'];

export default function ExercisePickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const exercises = useTrainingStore((s) => s.exercises);
  const favourites = useTrainingStore((s) => s.favouriteExerciseIds);
  const toggleFavourite = useTrainingStore((s) => s.toggleFavourite);
  const addExercise = useActiveWorkoutStore((s) => s.addExercise);
  const activeWorkout = useActiveWorkoutStore((s) => s.workout);

  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<MuscleRegion | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [favouritesOnly, setFavouritesOnly] = useState(false);

  const alreadyAdded = useMemo(
    () => new Set(activeWorkout?.exercises.map((we) => we.exerciseId) ?? []),
    [activeWorkout],
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const regionMuscles: Set<MuscleGroup> | null = region
      ? new Set((Object.keys(MUSCLE_META) as MuscleGroup[]).filter((m) => MUSCLE_META[m].region === region))
      : null;

    const filtered = exercises.filter((e) => {
      if (favouritesOnly && !favourites.includes(e.id)) return false;
      if (equipment && e.equipment !== equipment) return false;
      if (regionMuscles && !e.primaryMuscles.some((m) => regionMuscles.has(m))) return false;
      if (needle) {
        const haystack = `${e.name} ${e.equipment} ${e.primaryMuscles.join(' ')}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    // Favourites first, then alphabetical.
    return filtered.sort((a, b) => {
      const aFav = favourites.includes(a.id) ? 0 : 1;
      const bFav = favourites.includes(b.id) ? 0 : 1;
      return aFav - bFav || a.name.localeCompare(b.name);
    });
  }, [exercises, query, region, equipment, favouritesOnly, favourites]);

  const handleAdd = (exercise: Exercise) => {
    addExercise(exercise.id, { sets: 3, reps: 8, rest: 120 });
    router.back();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.header}>
        <Text variant="title1">Add a lift</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close exercise picker"
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.close, pressed && { opacity: opacity.pressed }]}
        >
          <Ionicons name="close" size={20} color={color.text} />
        </Pressable>
      </View>

      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search exercises"
        accessibilityLabel="Search exercises by name, muscle or equipment"
        style={styles.search}
      />

      <Button
        label="Create a custom movement"
        variant="secondary"
        size="sm"
        icon="add"
        onPress={() =>
          router.push({ pathname: '/exercise', params: { addToWorkout: 'true' } })
        }
        style={styles.custom}
      />

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        {EQUIPMENT.map((eq) => (
          <Chip
            key={eq}
            label={eq}
            tone="cyan"
            selected={equipment === eq}
            onPress={() => setEquipment(equipment === eq ? null : eq)}
          />
        ))}
      </ScrollView>

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <Text variant="eyebrow" tone="faint" style={styles.count}>
            {`${results.length} ${results.length === 1 ? 'exercise' : 'exercises'}`}
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text variant="title3" tone="secondary">
              Nothing matches those filters
            </Text>
            <Text variant="bodySm" tone="faint" style={styles.emptyText}>
              Clear a filter, or search a muscle name like “lats”.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isFavourite = favourites.includes(item.id);
          const added = alreadyAdded.has(item.id);

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.name}. ${item.equipment}, targets ${item.primaryMuscles
                .map((m) => MUSCLE_META[m].label)
                .join(', ')}${added ? '. Already in this session' : ''}`}
              onPress={() => handleAdd(item)}
              style={({ pressed }) => [styles.item, pressed && { opacity: opacity.pressed }]}
            >
              <View style={styles.itemText}>
                <View style={styles.itemNameRow}>
                  <Text variant="title3" numberOfLines={1} style={styles.itemName}>
                    {item.name}
                  </Text>
                  {added ? <Chip label="In session" tone="positive" /> : null}
                </View>
                <Text variant="bodySm" tone="faint" numberOfLines={1}>
                  {`${item.equipment} · ${item.primaryMuscles.map((m) => MUSCLE_META[m].label).join(', ')}`}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${isFavourite ? 'Remove' : 'Add'} ${item.name} ${isFavourite ? 'from' : 'to'} favourites`}
                accessibilityState={{ selected: isFavourite }}
                onPress={() => toggleFavourite(item.id)}
                hitSlop={10}
                style={({ pressed }) => [styles.star, pressed && { opacity: opacity.pressed }]}
              >
                <Ionicons
                  name={isFavourite ? 'star' : 'star-outline'}
                  size={17}
                  color={isFavourite ? color.violetBright : color.textFaint}
                />
              </Pressable>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.base,
  },
  close: {
    width: a11y.minTouch,
    height: a11y.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: { marginHorizontal: space.lg },
  custom: { marginHorizontal: space.lg, marginTop: space.md, alignSelf: 'flex-start' },
  filterRow: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.xs,
  },
  list: { paddingTop: space.base },
  count: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  itemText: { flex: 1, gap: 3 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  itemName: { flexShrink: 1 },
  star: {
    width: a11y.minTouch,
    height: a11y.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: { paddingHorizontal: space.lg, paddingTop: space.xxl, alignItems: 'center' },
  emptyText: { marginTop: space.xs, textAlign: 'center' },
});
