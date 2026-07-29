import { useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, CarouselPagination, Card, Text } from '@/components/ui';
import { FEATURES, FEATURE_SLIDES, type FeatureSlide } from '@/content/onboarding';
import { color, radius, space } from '@/theme';

/**
 * FEATURE PREVIEW
 * ===============
 * Three cards, swiped horizontally. The CTA stays pinned and keeps the same
 * label on every slide -- moving or relabelling it would make the button feel
 * like it belongs to the card rather than the flow.
 */
export default function FeaturesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<FeatureSlide>>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  };

  const isLast = index === FEATURE_SLIDES.length - 1;

  const advance = () => {
    if (isLast) {
      router.push('/onboarding/auth');
      return;
    }
    listRef.current?.scrollToOffset({ offset: (index + 1) * width, animated: true });
  };

  return (
    <View style={[styles.canvas, { paddingTop: insets.top + space.base, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.head}>
        <Button
          label={FEATURES.skipLabel}
          variant="ghost"
          size="sm"
          onPress={() => router.push('/onboarding/auth')}
        />
      </View>

      <FlatList
        ref={listRef}
        data={FEATURE_SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Card variant="raised" padding="xl" spectral style={styles.card}>
              <View style={styles.icon}>
                <Ionicons name={item.icon} size={22} color={color.violetBright} />
              </View>
              <Text variant="eyebrow" tone="violet" style={styles.slideEyebrow}>
                {item.eyebrow}
              </Text>
              <Text variant="title1" accessibilityRole="header">
                {item.title}
              </Text>
              <Text variant="body" tone="secondary" style={styles.slideBody}>
                {item.body}
              </Text>
            </Card>
          </View>
        )}
      />

      <View style={styles.footer}>
        <CarouselPagination count={FEATURE_SLIDES.length} index={index} />
        <Button label={FEATURES.primaryCta} fullWidth size="lg" onPress={advance} style={styles.cta} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bg },
  head: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.lg },
  slide: { justifyContent: 'center', paddingHorizontal: space.lg },
  card: { marginTop: space.base },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.violetWash,
    marginBottom: space.lg,
  },
  slideEyebrow: { marginBottom: space.sm },
  slideBody: { marginTop: space.md },
  footer: { alignItems: 'center', paddingHorizontal: space.lg, gap: space.lg },
  cta: { alignSelf: 'stretch' },
});
