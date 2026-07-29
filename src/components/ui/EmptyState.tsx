import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Text } from './Text';
import { color, radius, space } from '@/theme';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  /** The way out. An empty state without one is a dead end. */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * What a surface shows when it has nothing to show.
 *
 * Always names the reason and offers the way out, because "no results" with no
 * next step reads as a broken screen rather than an honest one. This is not a
 * skeleton or a placeholder chart -- see `PhasePanel` for why PRism does not
 * ship those.
 */
export function EmptyState({ icon = 'search', title, body, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.glyph}>
        <Ionicons name={icon} size={20} color={color.textMuted} />
      </View>

      <Text variant="title3" tone="secondary" align="center">
        {title}
      </Text>

      {body ? (
        <Text variant="bodySm" tone="faint" align="center" style={styles.body}>
          {body}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.xxl,
  },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.neutralWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.base,
  },
  body: { marginTop: space.sm, maxWidth: 300 },
  action: { marginTop: space.lg },
});
