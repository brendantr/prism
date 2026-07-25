import { useId } from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { spectrum } from '@/theme';

export interface LinearSpectrumProps {
  height?: number;
  tone?: 'brand' | 'warm' | 'cool';
  /** 0-1. Fills only this fraction of the width -- turns the band into a meter. */
  progress?: number;
  rounded?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONE_STOPS = {
  brand: spectrum.stops,
  warm: spectrum.warm,
  cool: spectrum.cool,
} as const;

/**
 * The refracted band: a thin horizontal spectral gradient.
 *
 * This is PRism's signature mark. It appears as a 2px card edge, a progress
 * fill, or a divider -- never as a large filled area, which would turn the
 * whole app into a gradient poster.
 */
export function LinearSpectrum({
  height = 2,
  tone = 'brand',
  progress,
  rounded = false,
  style,
}: LinearSpectrumProps) {
  // Each instance needs a stable, unique gradient id or SVG defs collide.
  const id = `spectrum${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stops = TONE_STOPS[tone];
  const width = progress == null ? 1 : Math.max(0, Math.min(1, progress));

  return (
    <View
      style={[{ height, width: '100%', overflow: 'hidden', borderRadius: rounded ? height / 2 : 0 }, style]}
      pointerEvents="none"
    >
      <Svg width="100%" height={height} viewBox="0 0 100 1" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            {stops.map((stopColor, i) => (
              <Stop key={i} offset={`${(i / (stops.length - 1)) * 100}%`} stopColor={stopColor} stopOpacity={1} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width * 100} height="1" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
