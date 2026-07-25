import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { color, type, type TypeToken } from '@/theme';

export interface TextProps extends RNTextProps {
  variant?: TypeToken;
  tone?: 'primary' | 'secondary' | 'muted' | 'faint' | 'violet' | 'cyan' | 'coral' | 'positive' | 'caution' | 'onAccent';
  align?: TextStyle['textAlign'];
  /** Convenience for right-aligning numeric cells. */
  numeric?: boolean;
}

const TONE_COLOR = {
  primary: color.text,
  secondary: color.textSecondary,
  muted: color.textMuted,
  faint: color.textFaint,
  violet: color.violetBright,
  cyan: color.cyanBright,
  coral: color.coralBright,
  positive: color.positive,
  caution: color.caution,
  onAccent: color.textOnAccent,
} as const;

/**
 * The only text component in PRism. Nothing else may set fontSize or color
 * directly -- that is how a design system stays a system.
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  align,
  numeric,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      // Respect the user's font-size setting, but stop runaway scaling from
      // breaking set/rep columns.
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        type[variant] as TextStyle,
        { color: TONE_COLOR[tone] },
        align ? { textAlign: align } : null,
        numeric ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}
