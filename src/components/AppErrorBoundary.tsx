import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_ERROR } from '@/content/errors';
import { reportRenderError, TELEMETRY_ENABLED } from '@/observability/telemetry';
import { a11y, color, opacity, radius, space, type } from '@/theme';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
  resetKey: number;
}

/** Last-resort render boundary; it deliberately depends on no app UI primitive. */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, resetKey: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportRenderError(error, info.componentStack ?? null);
  }

  private retry = (): void => {
    this.setState(({ resetKey }) => ({ failed: false, resetKey: resetKey + 1 }));
  };

  override render() {
    if (!this.state.failed) {
      return (
        <View key={this.state.resetKey} style={styles.app}>
          {this.props.children}
        </View>
      );
    }

    return (
      <View
        accessibilityLiveRegion="assertive"
        style={styles.fallback}
      >
        <Text maxFontSizeMultiplier={1.6} style={styles.eyebrow}>
          {APP_ERROR.eyebrow}
        </Text>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.6} style={styles.title}>
          {APP_ERROR.title}
        </Text>
        <Text maxFontSizeMultiplier={1.6} style={styles.body}>
          {APP_ERROR.body}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={APP_ERROR.retryLabel}
          onPress={this.retry}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text maxFontSizeMultiplier={1.6} style={styles.buttonLabel}>
            {APP_ERROR.retryLabel}
          </Text>
        </Pressable>
        <Text maxFontSizeMultiplier={1.6} style={styles.note}>
          {TELEMETRY_ENABLED ? APP_ERROR.reportSentNote : APP_ERROR.reportNotSentNote}
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
    paddingHorizontal: space.xl,
  },
  eyebrow: { ...type.eyebrow, color: color.coralBright, textAlign: 'center' },
  title: { ...type.title1, color: color.text, textAlign: 'center', marginTop: space.sm },
  body: { ...type.body, color: color.textSecondary, textAlign: 'center', marginTop: space.md },
  button: {
    minHeight: a11y.minTouch,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.violetBright,
  },
  pressed: { opacity: opacity.pressed },
  buttonLabel: { ...type.title3, color: color.textOnAccent },
  note: { ...type.bodySm, color: color.textMuted, textAlign: 'center', marginTop: space.base },
});
