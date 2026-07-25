import { View, StyleSheet, type ViewProps } from 'react-native';
import { LinearSpectrum } from './LinearSpectrum';
import { color, elevation, radius, space } from '@/theme';

export interface CardProps extends ViewProps {
  /** `flat` sits quietly; `raised` lifts off the canvas; `outline` is a hairline shell. */
  variant?: 'flat' | 'raised' | 'outline';
  padding?: keyof typeof space;
  /** Adds the 2px refracted band across the top edge. Use sparingly. */
  spectral?: boolean;
  spectralTone?: 'brand' | 'warm' | 'cool';
}

/**
 * The PRism surface. Rounded to `radius.lg` with a very low-contrast hairline
 * -- on a near-black canvas the corner radius does more work than the border.
 */
export function Card({
  variant = 'flat',
  padding = 'lg',
  spectral = false,
  spectralTone = 'brand',
  style,
  children,
  ...rest
}: CardProps) {
  return (
    <View
      {...rest}
      style={[
        styles.base,
        variant === 'raised' && styles.raised,
        variant === 'outline' && styles.outline,
        style,
      ]}
    >
      {spectral ? <LinearSpectrum tone={spectralTone} height={2} style={styles.band} /> : null}
      <View style={{ padding: space[padding] }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: color.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: 'hidden',
  },
  raised: {
    backgroundColor: color.cardRaised,
    ...elevation.card,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: color.lineStrong,
  },
  band: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
