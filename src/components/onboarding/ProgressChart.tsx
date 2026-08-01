import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { Text } from '@/components/ui';
import { color, space } from '@/theme';

export interface ProgressChartPoint {
  label: string;
  e1rmKg: number;
}

export interface ProgressChartProps {
  points: ProgressChartPoint[];
}

const VIEW_WIDTH = 300;
const VIEW_HEIGHT = 120;
const PAD_X = 10;
const PAD_Y = 14;
/** Rendered height in points. `Svg` does not infer a height from `viewBox`
 *  alone -- omitting this collapses the chart to zero height. */
const DISPLAY_HEIGHT = 96;

/**
 * A restrained cyan line chart: evidence, not decoration.
 *
 * One stroke, one baseline, no fill under the curve, no gradient, no glow --
 * per the redesign's visual rules. Points are plotted from real
 * (already-computed) estimated-1RM values; this component does no
 * calculation of its own, so it stays reusable for real chart data later,
 * not tied to onboarding's demo dataset.
 */
export function ProgressChart({ points }: ProgressChartProps) {
  if (points.length < 2) return null;

  const values = points.map((p) => p.e1rmKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const plotWidth = VIEW_WIDTH - PAD_X * 2;
  const plotHeight = VIEW_HEIGHT - PAD_Y * 2;

  const coords = points.map((p, i) => {
    const x = PAD_X + (i / (points.length - 1)) * plotWidth;
    const y = PAD_Y + (1 - (p.e1rmKg - min) / range) * plotHeight;
    return { x, y };
  });

  const first = points[0];
  const last = points[points.length - 1];
  const trendLabel = `Estimated one-rep max trending from ${Math.round(first.e1rmKg)} to ${Math.round(
    last.e1rmKg,
  )} kilograms over the last ${points.length} weeks`;

  return (
    <View style={styles.wrap}>
      <View accessible accessibilityLabel={trendLabel}>
        <Svg
          width="100%"
          height={DISPLAY_HEIGHT}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <Line
            x1={PAD_X}
            y1={VIEW_HEIGHT - PAD_Y}
            x2={VIEW_WIDTH - PAD_X}
            y2={VIEW_HEIGHT - PAD_Y}
            stroke={color.line}
            strokeWidth={1}
          />
          <Polyline
            points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
            fill="none"
            stroke={color.cyanBright}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r={3.5} fill={color.cyanBright} />
        </Svg>
      </View>

      <View style={styles.axis}>
        <Text variant="eyebrow" tone="faint">
          {first.label.toUpperCase()}
        </Text>
        <Text variant="eyebrow" tone="faint">
          {last.label.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xs,
    paddingHorizontal: 2,
  },
});
