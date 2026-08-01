import { useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, CarouselPagination, FadeIn } from '@/components/ui';
import { EstimatedOneRepMaxCard } from '@/components/onboarding/EstimatedOneRepMaxCard';
import { LogPreviewCard } from '@/components/onboarding/LogPreviewCard';
import { OnboardingSlideHeader } from '@/components/onboarding/OnboardingSlideHeader';
import { FEATURES, FEATURE_SLIDES, type FeatureSlide } from '@/content/onboarding';
import { color, space } from '@/theme';

/**
 * LOG / PROGRESS / READINESS
 * ===========================
 * Three slides, swiped horizontally, telling PRism's product story in
 * sequence: capture the work, interrogate the evidence, plan with humility.
 *
 * Each slide's content sits inside its own vertical `ScrollView` -- the outer
 * `FlatList` still owns horizontal paging, opposite-axis nested scrolling is
 * unproblematic -- so a small device or large accessibility text makes a
 * slide scroll rather than clip. The CTA stays pinned and keeps the same
 * position on every slide; only its final-slide label changes ("Get
 * started"), never its handler -- see `Docs/sprints/2026-08-01-onboarding-ui-redesign.md`
 * for why the last slide still hands off to `/onboarding/auth` rather than
 * completing onboarding directly.
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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.slideContent}>
              <FadeIn>
                <OnboardingSlideHeader eyebrow={item.eyebrow} title={item.title} body={item.body} />
                {item.id === 'log' ? <LogPreviewCard /> : null}
                {item.id === 'progress' ? <EstimatedOneRepMaxCard /> : null}
              </FadeIn>
            </ScrollView>
          </View>
        )}
      />

      <View style={styles.footer}>
        <CarouselPagination count={FEATURE_SLIDES.length} index={index} />
        <Button
          label={isLast ? FEATURES.finalCta : FEATURES.primaryCta}
          fullWidth
          size="lg"
          onPress={advance}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bg },
  head: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.lg },
  slide: { justifyContent: 'flex-start' },
  slideContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.lg },
  footer: { alignItems: 'center', paddingHorizontal: space.lg, gap: space.lg },
  cta: { alignSelf: 'stretch' },
});
