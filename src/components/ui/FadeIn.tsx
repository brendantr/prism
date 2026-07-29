import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { duration } from '@/theme';

export interface FadeInProps {
  children: ReactNode;
  /** Milliseconds to wait before starting, for staggering a group. */
  delay?: number;
  /** Distance in points the content rises through. */
  distance?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Entrance transition: fade up into place, once, on mount.
 *
 * Honours the system "reduce motion" setting -- with it on, the content is
 * simply present, with no fade and no movement. An entrance animation is a
 * nicety; for someone who gets motion sick from it, it is not.
 *
 * Uses React Native's own `Animated` on the native driver. PRism has no
 * animation dependency and this is not a reason to add one.
 */
export function FadeIn({ children, delay = 0, distance = 12, style }: FadeInProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      // A failed query must not leave the content invisible forever, so treat
      // an unknown answer as "animate".
      .catch(() => {
        if (!cancelled) setReduceMotion(false);
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    // Still waiting on the accessibility answer: hold, do not guess.
    if (reduceMotion == null) return;

    if (reduceMotion) {
      progress.setValue(1);
      return;
    }

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: duration.slow,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay, reduceMotion]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: reduceMotion
                ? 0
                : progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
