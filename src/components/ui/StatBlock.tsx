import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { color, space } from '@/theme';

export interface StatBlockProps {
  label: string;
  value: string;
  unit?: string;
  /** Signed change vs. the comparison period, already formatted. */
  delta?: { text: string; direction: 'up' | 'down' | 'flat' };
  tone?: 'primary' | 'violet' | 'cyan' | 'coral';
  align?: 'left' | 'center';
}

const DELTA_ICON = {
  up: 'arrow-up' as const,
  down: 'arrow-down' as const,
  flat: 'remove' as const,
};

/** A single number with its label. The workhorse of every summary surface. */
export function StatBlock({ label, value, unit, delta, tone = 'primary', align = 'left' }: StatBlockProps) {
  const deltaTone = delta?.direction === 'up' ? color.positive : delta?.direction === 'down' ? color.coralBright : color.textFaint;

  return (
    <View
      style={[styles.wrap, align === 'center' && styles.center]}
      accessible
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}${delta ? `, ${delta.text}` : ''}`}
    >
      <Text variant="eyebrow" tone="faint" style={styles.label}>
        {label}
      </Text>
      <View style={[styles.valueRow, align === 'center' && styles.center]}>
        {/*
          A stat block is usually one of three in a row, so the column can be
          narrower than the number it has to hold. Shrink the glyphs rather than
          wrapping: "143.7k" breaking to a second line moves every row below it,
          and truncating a number to "143…" is worse than showing it smaller.
        */}
        <Text
          variant="numericLg"
          tone={tone === 'primary' ? 'primary' : tone}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={styles.value}
        >
          {value}
        </Text>
        {unit ? (
          <Text variant="label" tone="muted" numberOfLines={1} style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
      {delta ? (
        <View style={[styles.deltaRow, align === 'center' && styles.center]}>
          <Ionicons name={DELTA_ICON[delta.direction]} size={11} color={deltaTone} />
          <Text variant="numericSm" style={{ color: deltaTone, marginLeft: 3 }}>
            {delta.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { alignItems: 'center' },
  label: { marginBottom: space.xs },
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  value: { flexShrink: 1 },
  /**
   * The unit keeps its full width and the value scales into what is left.
   * The other way round truncates "kg" to "k…" -- a short fixed label has no
   * spare characters to give up, whereas the number can simply be set smaller.
   */
  unit: { marginLeft: 4, flexShrink: 0 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
});
