import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Input, Text } from '@/components/ui';
import {
  AUTH,
  AUTH_ERROR_COPY,
  AUTH_OUTCOME_COPY,
  AUTH_OUTCOME_TONE,
  AUTH_RESET,
  AUTH_RESET_ERROR_COPY,
} from '@/content/onboarding';
import {
  isValidCredentials,
  validateCredentials,
  type AuthMode,
  type AuthValidationResult,
} from '@/domain/authValidation';
import {
  CODE_LENGTH,
  isValidResetConfirm,
  isValidResetRequest,
  nextResetStage,
  validateResetConfirm,
  validateResetRequest,
  type ResetConfirmValidation,
  type ResetEvent,
  type ResetRequestValidation,
  type ResetStage,
} from '@/domain/authReset';
import { useSessionStore } from '@/store/sessionStore';
import { useTrainingStore } from '@/store/trainingStore';
import { color, opacity, space } from '@/theme';

/**
 * SIGN UP / SIGN IN
 * =================
 * Real, as of the auth/session sprint. This screen used to collect nothing,
 * send nothing and store nothing, and said so in a notice under the form (UX
 * decision D2). D2's reversal clause required copy, skip semantics, the
 * completion gate and the autofill attributes to change together, and they do:
 *
 *  - the placeholder notice is gone, because it would now be false;
 *  - the "Later" skip is gone, because every data screen needs a session;
 *  - AutoFill is restored (see the fields below);
 *  - the four states are real, driven by `sessionStore`.
 *
 * Promoted out of `app/onboarding/` because a returning lifter on a fresh
 * install has already onboarded -- routing them through the first-run stack to
 * sign in would give them a back gesture into a form they finished months ago.
 * `app/onboarding/auth.tsx` is now a redirect into here.
 */
export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();

  const [mode, setMode] = useState<'signup' | 'signin' | 'reset'>(
    params.mode === 'signin' ? 'signin' : 'signup',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<AuthValidationResult>({});
  /** Errors appear on the first submit, not while someone is still typing. */
  const [submitted, setSubmitted] = useState(false);

  /*
    Reset state is local. The stage machine is navigation within one screen, not
    session lifecycle, so it has no business in `sessionStore` -- but the rules
    it follows are pure and live in `src/domain/authReset.ts`, which is what
    makes them testable without a renderer.
  */
  const [resetStage, setResetStage] = useState<ResetStage>('requestIdle');
  const [code, setCode] = useState('');
  const [resetErrors, setResetErrors] = useState<ResetConfirmValidation & ResetRequestValidation>({});
  /**
   * Shown once on the sign-in form after a completed reset. Local rather than a
   * store outcome because it belongs to this visit: leaving `/auth` and coming
   * back should not re-announce a reset that already finished.
   */
  const [justReset, setJustReset] = useState(false);

  /*
    In-flight state and the last outcome live in the store, not in `useState`.
    A sign-in that resolves while this screen is unmounted (backgrounded app,
    a redirect landing first) would otherwise strand a spinner on remount --
    the "interrupted" state §4.1 asks every surface to answer for.
  */
  const pending = useSessionStore((s) => s.pending);
  const outcome = useSessionStore((s) => s.lastFailure);
  const signIn = useSessionStore((s) => s.signIn);
  const signUp = useSessionStore((s) => s.signUp);
  const requestReset = useSessionStore((s) => s.requestReset);
  const confirmReset = useSessionStore((s) => s.confirmReset);
  const clearFailure = useSessionStore((s) => s.clearFailure);
  const refreshTraining = useTrainingStore((s) => s.refresh);

  const isSignUp = mode === 'signup';
  const isReset = mode === 'reset';
  const busy = pending !== null;
  /**
   * Reset is a mode of this screen but not a set of credential rules, so it is
   * narrowed away before reaching `validateCredentials`. Nothing below the reset
   * branch runs in reset mode; this keeps that provable rather than assumed.
   */
  const credentialMode: AuthMode = isSignUp ? 'signup' : 'signin';

  // A stale outcome from a previous visit must not greet the next one.
  useEffect(() => clearFailure, [clearFailure]);

  const revalidate = (next: { email?: string; password?: string }) => {
    if (!submitted) return;
    setErrors(validateCredentials(next.email ?? email, next.password ?? password, credentialMode));
  };

  const submit = async () => {
    if (busy) return;
    const found = validateCredentials(email, password, credentialMode);
    setSubmitted(true);
    setErrors(found);
    if (!isValidCredentials(found)) return;

    const ok = isSignUp ? await signUp(email, password) : await signIn(email, password);

    if (!ok) {
      // Failed, or succeeded into "confirm your email". Either way the lifter
      // stays here. The password survives so a typo can be corrected rather
      // than retyped in full; it is cleared on success and on unmount.
      return;
    }

    // Signed in. `refresh()` rather than `load()` on purpose: `load()`'s
    // re-entry guard returns early on a 'ready' status, and after a sign-out
    // and sign-in on the same process the store may still look loaded.
    setPassword('');
    await refreshTraining();

    // NO NAVIGATION HERE, deliberately. This used to `router.replace('/(tabs)')`,
    // which made it a second navigator competing with the route gate -- the exact
    // shape `app/_layout.tsx`'s "ONE GATE, NOT TWO" comment warns about. On a
    // first run it produced two redirects in a row, and the lifter landed back on
    // the welcome screen having just created an account.
    //
    // The phase flip to 'authenticated' is the signal; the gate is keyed on it and
    // decides where this goes -- Today when the first run is done, the setup
    // questions when it is not. One authority, and it already knows both answers.
  };

  const switchMode = () => {
    // The rules differ between modes, so stale errors would be misleading.
    setMode(isSignUp ? 'signin' : 'signup');
    setErrors({});
    setSubmitted(false);
    setJustReset(false);
    clearFailure();
  };

  // --- Password reset ------------------------------------------------------

  const leaveReset = (nextMode: 'signin' | 'signup' = 'signin') => {
    setMode(nextMode);
    setResetStage('requestIdle');
    setCode('');
    setResetErrors({});
    setSubmitted(false);
    clearFailure();
  };

  const advanceReset = (event: ResetEvent) =>
    setResetStage((current) => nextResetStage(current, event));

  const sendCode = async () => {
    if (busy) return;
    const found = validateResetRequest(email);
    setResetErrors(found);
    if (!isValidResetRequest(found)) return;

    advanceReset('requestStarted');
    const ok = await requestReset(email);
    // Either way the stage machine decides where we land -- a failure returns to
    // the form with the address still typed, so a network blip costs one tap.
    advanceReset(ok ? 'requestSucceeded' : 'requestFailed');
  };

  const submitNewPassword = async () => {
    if (busy) return;
    const found = validateResetConfirm(code, password);
    setResetErrors(found);
    if (!isValidResetConfirm(found)) return;

    advanceReset('codeStarted');
    const ok = await confirmReset(email, code, password);

    if (!ok) {
      // Back to the code form with the code intact: a wrong digit should cost a
      // correction, not a whole new email.
      advanceReset('codeFailed');
      return;
    }

    /*
      Done. The lifter is deliberately NOT signed in -- `confirmReset` hands the
      recovery session straight back. Landing on sign-in with the address
      pre-filled is the moment they prove the new password works, which is the
      one moment they should. `doneNotice` is shown by the sign-in form below.
    */
    advanceReset('codeSucceeded');
    setPassword('');
    setCode('');
    setResetErrors({});
    setMode('signin');
    setSubmitted(false);
    setJustReset(true);
  };

  /*
    "Check your email" is a distinct screen state rather than a message under
    the CTA. It is the end of the sign-up flow -- there is nothing more to do
    here until the link is opened -- and leaving the form live underneath it
    would invite a second submit that can only fail.

    Deep-link capture is deliberately NOT implemented: `detectSessionInUrl` is
    false and nothing in this repo handles an incoming link (see
    `src/data/supabase/client.ts`). Confirmation therefore ends in a manual
    sign-in, which is stated here rather than implied.
  */
  if (outcome === 'checkEmail') {
    return (
      <View style={[styles.canvas, styles.content, { paddingTop: insets.top + space.xxl }]}>
        <Text variant="eyebrow" tone="violet">
          {AUTH.eyebrow}
        </Text>
        <Text variant="display" accessibilityRole="header" style={styles.title}>
          {AUTH.checkEmailTitle}
        </Text>
        <Text variant="body" tone="secondary" style={styles.body}>
          {AUTH.checkEmailBody}
        </Text>
        <Button
          label={AUTH.checkEmailCta}
          fullWidth
          size="lg"
          style={styles.cta}
          onPress={() => {
            clearFailure();
            setMode('signin');
            setPassword('');
            setSubmitted(false);
          }}
        />
      </View>
    );
  }

  /*
    RESET — a mode within this screen, not a route.

    Three stages share one scroll view: ask for a code, wait, then enter it with
    a new password. Deliberately code-based rather than link-based: nothing in
    this repo captures a deep link (`detectSessionInUrl` is false), so a link
    would come back to nowhere. Reading six digits out of an email is the flow
    that actually completes.
  */
  if (isReset) {
    const awaitingCode = resetStage === 'codeIdle' || resetStage === 'codeSending';
    const sent = resetStage === 'requestDone';

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
            {sent ? AUTH_RESET.sentTitle : awaitingCode ? AUTH_RESET.codeTitle : AUTH_RESET.requestTitle}
          </Text>
          <Text variant="body" tone="secondary" style={styles.body}>
            {sent ? AUTH_RESET.sentBody : awaitingCode ? AUTH_RESET.codeBody : AUTH_RESET.requestBody}
          </Text>

          {!awaitingCode ? (
            <View style={styles.form}>
              <Input
                label={AUTH.emailLabel}
                placeholder={AUTH.emailPlaceholder}
                icon="mail-outline"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (resetErrors.email) setResetErrors({});
                }}
                error={resetErrors.email ? AUTH_ERROR_COPY[resetErrors.email] : undefined}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={sendCode}
                editable={!busy && !sent}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <Input
                label={AUTH_RESET.codeLabel}
                placeholder={AUTH_RESET.codePlaceholder}
                icon="keypad-outline"
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  if (resetErrors.token) setResetErrors({ ...resetErrors, token: undefined });
                }}
                error={resetErrors.token ? AUTH_RESET_ERROR_COPY[resetErrors.token] : undefined}
                keyboardType="number-pad"
                maxLength={CODE_LENGTH}
                // iOS offers the code straight from the notification banner --
                // the one genuine advantage of a code over a link here.
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                returnKeyType="next"
                editable={!busy}
              />
              <Input
                label={AUTH_RESET.newPasswordLabel}
                placeholder={AUTH.passwordPlaceholderSignUp}
                hint={AUTH.passwordHintSignUp}
                icon="lock-closed-outline"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (resetErrors.password) setResetErrors({ ...resetErrors, password: undefined });
                }}
                error={resetErrors.password ? AUTH_ERROR_COPY[resetErrors.password] : undefined}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={submitNewPassword}
                editable={!busy}
                style={styles.field}
              />
            </View>
          )}

          {outcome ? (
            <Card padding="base" style={styles.notice}>
              <Text
                variant="bodySm"
                tone={AUTH_OUTCOME_TONE[outcome] === 'error' ? 'coral' : 'muted'}
                accessibilityRole="alert"
              >
                {AUTH_OUTCOME_COPY[outcome]}
              </Text>
            </Card>
          ) : null}

          <Button
            label={
              sent
                ? AUTH_RESET.enterCodeCta
                : awaitingCode
                  ? AUTH_RESET.setPasswordCta
                  : AUTH_RESET.sendCodeCta
            }
            fullWidth
            size="lg"
            loading={busy}
            disabled={busy}
            onPress={sent ? () => advanceReset('enterCode') : awaitingCode ? submitNewPassword : sendCode}
            style={styles.cta}
          />

          {awaitingCode ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCode('');
                setResetErrors({});
                clearFailure();
                advanceReset('startOver');
              }}
              disabled={busy}
              hitSlop={10}
              style={({ pressed }) => [styles.toggle, pressed && { opacity: opacity.pressed }]}
            >
              <Text variant="label" tone="violet">
                {AUTH_RESET.resendCode}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => leaveReset('signin')}
            disabled={busy}
            hitSlop={10}
            style={({ pressed }) => [styles.toggle, pressed && { opacity: opacity.pressed }]}
          >
            <Text variant="label" tone="secondary">
              {AUTH_RESET.backToSignIn}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
            // AutoFill restored with D2. The account is real now, so offering
            // to save and refill the credential is correct rather than a prompt
            // to store something for an account that cannot exist.
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            editable={!busy}
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
            // Mode-specific so iOS offers to generate a strong password on
            // sign-up and to fill the saved one on sign-in.
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            textContentType={isSignUp ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!busy}
            style={styles.field}
          />
        </View>

        {/* Sign-in only. On sign-up there is no password to have forgotten, and
            offering a reset for an account that does not exist yet would be a
            second way to ask the server whether an address is registered. */}
        {!isSignUp ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode('reset');
              setResetStage('requestIdle');
              setPassword('');
              setJustReset(false);
              setResetErrors({});
              setSubmitted(false);
              clearFailure();
            }}
            disabled={busy}
            hitSlop={10}
            style={({ pressed }) => [styles.forgot, pressed && { opacity: opacity.pressed }]}
          >
            <Text variant="label" tone="secondary">
              {AUTH_RESET.forgotPasswordLabel}
            </Text>
          </Pressable>
        ) : null}

        {/* Survived a reset. Not an outcome from the store: it belongs to this
            visit, and re-announcing it on a later one would be noise. */}
        {justReset && !outcome ? (
          <Card padding="base" style={styles.notice}>
            <Text variant="bodySm" tone="muted" accessibilityRole="alert">
              {AUTH_RESET.doneNotice}
            </Text>
          </Card>
        ) : null}

        {/* Form-level outcome, visually distinct from the per-field validation
            above it. Never a raw error -- `toAuthFailure` has already collapsed
            whatever the server said into one of eight reviewed sentences. */}
        {outcome ? (
          <Card padding="base" style={styles.notice}>
            <Text
              variant="bodySm"
              tone={AUTH_OUTCOME_TONE[outcome] === 'error' ? 'coral' : 'muted'}
              accessibilityRole="alert"
            >
              {AUTH_OUTCOME_COPY[outcome]}
            </Text>
          </Card>
        ) : null}

        <Button
          label={isSignUp ? AUTH.primaryCtaSignUp : AUTH.primaryCtaSignIn}
          fullWidth
          size="lg"
          loading={busy}
          disabled={busy}
          onPress={submit}
          style={styles.cta}
        />

        <Pressable
          accessibilityRole="button"
          onPress={switchMode}
          disabled={busy}
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
  forgot: { alignSelf: 'flex-start', marginTop: space.md, minHeight: 44, justifyContent: 'center' },
  cta: { marginTop: space.xl },
  toggle: { alignSelf: 'center', marginTop: space.lg, minHeight: 44, justifyContent: 'center' },
});
