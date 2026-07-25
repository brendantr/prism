import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Text } from './Text';
import { color, spectrum } from '@/theme';

export interface ReadinessRingProps {
  /** 0-100. */
  score: number;
  size?: number;
  strokeWidth?: number;
  caption?: string;
  /** Announced by screen readers instead of the raw number. */
  accessibilityLabel?: string;
}

/**
 * The readiness dial. An arc drawn with the spectral gradient -- violet at
 * empty, cyan at full -- so the colour itself encodes the score, not just the
 * arc length.
 *
 * Original geometry: a 270-degree open arc starting at the lower-left, which
 * leaves a gap at the bottom for the caption and keeps the number optically
 * centred.
 */
export function ReadinessRing({
  score,
  size = 168,
  strokeWidth = 12,
  caption,
  accessibilityLabel,
}: ReadinessRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // 270 degrees of the circle are usable; the remaining 90 is the bottom gap.
  const arcFraction = 0.75;
  const arcLength = circumference * arcFraction;
  const filled = arcLength * (clamped / 100);

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `Readiness estimate ${Math.round(clamped)} out of 100`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="readinessArc" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0%" stopColor={spectrum.stops[0]} />
            <Stop offset="55%" stopColor={spectrum.stops[1]} />
            <Stop offset="100%" stopColor={spectrum.stops[2]} />
          </LinearGradient>
        </Defs>

        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color.inset}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          fill="none"
          // Rotate so the gap sits at the bottom.
          transform={`rotate(135 ${center} ${center})`}
        />

        {/* Fill */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#readinessArc)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(135 ${center} ${center})`}
        />
      </Svg>

      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text variant="hero">{Math.round(clamped)}</Text>
        {caption ? (
          <Text variant="eyebrow" tone="muted" style={styles.caption}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  caption: { marginTop: 2 },
});
