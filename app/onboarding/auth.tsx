import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Input, Text } from '@/components/ui';
import { AUTH, AUTH_ERROR_COPY } from '@/content/onboarding';
import {
  isValidCredentials,
  validateCredentials,
  type AuthValidationResult,
} from '@/domain/authValidation';
import { color, opacity, space } from '@/theme';

/**
 * SIGN UP / SIGN IN
 * =================
 * Presentation only. No account system is wired up yet, so this screen collects
 * nothing, sends nothing, and stores nothing -- the notice says so outright
 * rather than letting the form imply an account was created.
 *
 * The fields exist so the layout is real and reviewable. Wiring them is a
 * separate sprint, gated behind verified RLS (`Docs/invariants.md` I-1, I-6).
 */
export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();

  const [mode, setMode] = useState<'signup' | 'signin'>(
    params.mode === 'signin' ? 'signin' : 'signup',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<AuthValidationResult>({});
  /** Errors appear on the first submit, not while someone is still typing. */
  const [submitted, setSubmitted] = useState(false);

  const isSignUp = mode === 'signup';

  const revalidate = (next: { email?: string; password?: string }) => {
    if (!submitted) return;
    setErrors(validateCredentials(next.email ?? email, next.password ?? password, mode));
  };

  const submit = () => {
    const found = validateCredentials(email, password, mode);
    setSubmitted(true);
    setErrors(found);
    // Nothing is created or sent -- see the notice below. The gate exists so the
    // flow cannot advance on input that would never have been accepted.
    if (!isValidCredentials(found)) return;
    router.push('/onboarding/steps');
  };

  const switchMode = () => {
    // The rules differ between modes, so stale errors would be misleading.
    setMode(isSignUp ? 'signin' : 'signup');
    setErrors({});
    setSubmitted(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.canvas}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="eyebrow" tone="violet">
          {AUTH.eyebrow}
        </Text>
        <Text variant="display" accessibilityRole="header" style={styles.title}>
          {isSignUp ? AUTH.titleSignUp : AUTH.titleSignIn}
        </Text>
        <Text variant="body" tone="secondary" style={styles.body}>
          {isSignUp ? AUTH.bodySignUp : AUTH.bodySignIn}
        </Text>

        <View style={styles.form}>
          <Input
            label={AUTH.emailLabel}
            placeholder={AUTH.emailPlaceholder}
            icon="mail-outline"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              revalidate({ email: v });
            }}
            error={errors.email ? AUTH_ERROR_COPY[errors.email] : undefined}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <Input
            label={AUTH.passwordLabel}
            placeholder={isSignUp ? AUTH.passwordPlaceholderSignUp : AUTH.passwordPlaceholderSignIn}
            hint={isSignUp ? AUTH.passwordHintSignUp : undefined}
            icon="lock-closed-outline"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              revalidate({ password: v });
            }}
            error={errors.password ? AUTH_ERROR_COPY[errors.password] : undefined}
            secureTextEntry
            autoCapitalize="none"
            textContentType={isSignUp ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={submit}
            style={styles.field}
          />
        </View>

        <Card padding="base" style={styles.notice}>
          <Text variant="bodySm" tone="muted">
            {AUTH.placeholderNotice}
          </Text>
        </Card>

        <Button
          label={isSignUp ? AUTH.primaryCtaSignUp : AUTH.primaryCtaSignIn}
          fullWidth
          size="lg"
          onPress={submit}
          style={styles.cta}
        />

        <Pressable
          accessibilityRole="button"
          onPress={switchMode}
          hitSlop={10}
          style={({ pressed }) => [styles.toggle, pressed && { opacity: opacity.pressed }]}
        >
          <Text variant="label" tone="violet">
            {isSignUp ? AUTH.toggleToSignIn : AUTH.toggleToSignUp}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.lg },
  title: { marginTop: space.base },
  body: { marginTop: space.md, maxWidth: 340 },
  form: { marginTop: space.xxl },
  field: { marginTop: space.lg },
  notice: { marginTop: space.lg },
  cta: { marginTop: space.xl },
  toggle: { alignSelf: 'center', marginTop: space.lg, minHeight: 44, justifyContent: 'center' },
});
