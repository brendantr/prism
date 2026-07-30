import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Text } from './Text';
import { color, radius, space } from '@/theme';

/** Mirrors `trainingStore.status`. */
export type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface ScreenStateProps {
  phase: LoadPhase;
  /** Re-runs the load. Only reachable from the error state. */
  onRetry: () => void;
  /** What is being fetched, in the lifter's terms. */
  loadingLabel?: string;
  /** Surfaced verbatim when the store has one. */
  errorMessage?: string | null;
  /**
   * Optional so the component can be used as a leaf: a screen that renders its
   * ready state through different chrome (a non-scrolling `Screen`, say) passes
   * no children and simply returns early while loading.
   */
  children?: ReactNode;
}

/**
 * LOADING / ERROR / READY, in one place.
 *
 * Every screen below Today reads from the same store, and until now only Today
 * checked whether that store had actually loaded. The rest rendered straight
 * away against empty arrays, so "still loading" and "we could not reach the
 * server" both came out looking like "you have no data" -- a screen confidently
 * reporting an emptiness it had not verified.
 *
 * This is deliberately body-only: the caller keeps its own `Screen` wrapper, so
 * the title and chrome stay put while the state underneath changes. Swapping the
 * whole screen would make the header jump on every load.
 */
export function ScreenState({
  phase,
  onRetry,
  loadingLabel = 'Loading…',
  errorMessage,
  children,
}: ScreenStateProps) {
  if (phase === 'error') {
    return (
      <View style={styles.centre} accessibilityRole="alert">
        <View style={styles.badge}>
          <Ionicons name="cloud-offline-outline" size={22} color={color.coral} />
        </View>
        <Text variant="title3" style={styles.title}>
          Could not load this
        </Text>
        <Text variant="bodySm" tone="secondary" style={styles.body}>
          {/* The store's message when there is one -- it is written for a person.
              Never a raw error: those name schema internals. */}
          {errorMessage ?? 'Something went wrong reaching your training data.'}
        </Text>
        <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} style={styles.action} />
      </View>
    );
  }

  if (phase === 'loading' || phase === 'idle') {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={color.violetBright} />
        <Text variant="bodySm" tone="muted" style={styles.body}>
          {loadingLabel}
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.coralWash,
    marginBottom: space.base,
  },
  title: { textAlign: 'center' },
  body: { marginTop: space.sm, textAlign: 'center', lineHeight: 18 },
  action: { marginTop: space.lg },
});
