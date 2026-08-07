import { Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, ListRow, Screen, Text } from '@/components/ui';
import { ACCOUNT } from '@/content/account';
import { countCompletedSets, shouldConfirmSignOut } from '@/domain/account';
import { signOutAndTearDown } from '@/store/authActions';
import { useActiveWorkoutStore } from '@/store/activeWorkoutStore';
import { useSessionStore } from '@/store/sessionStore';
import { useTrainingStore } from '@/store/trainingStore';
import { space } from '@/theme';

/**
 * ACCOUNT
 * =======
 * Deliberately not a settings screen. Three things and nothing else: who you are
 * signed in as, a way out, and one honest sentence about what leaving does.
 *
 * The teardown it calls (`signOutAndTearDown`) has existed and been tested since
 * the auth sprint; until this screen it was unreachable, so a lifter could sign
 * in and not sign out. This is the affordance, not the mechanism -- nothing in
 * `authActions.ts` changed.
 *
 * If this grows a fourth item it has become the settings surface this sprint was
 * scoped not to build.
 */
export default function AccountScreen() {
  const router = useRouter();

  const phase = useSessionStore((s) => s.phase);
  const email = useSessionStore((s) => s.email);
  const displayName = useTrainingStore((s) => s.profile?.displayName ?? null);
  const workout = useActiveWorkoutStore((s) => s.workout);

  /*
    Only reachable when authenticated -- Today's control is gated on the same
    condition, and the route gate sends everyone else to /auth. This is the
    belt to that braces: a deep link or a phase that changed while the modal
    was open (a revoked token, a sign-out completing) closes the sheet rather
    than leaving a "Sign out" button over a session that no longer exists.
  */
  if (phase !== 'authenticated') {
    if (router.canGoBack()) router.back();
    return null;
  }

  const identity = email ?? displayName;

  const signOut = () => {
    void signOutAndTearDown();
    // No success message and no manual navigation: teardown flips the phase
    // last, and the route gate redirects to /auth, unmounting this modal with
    // it. Someone who just tapped "Sign out" does not need to be told they
    // signed out -- the involuntary case (`sessionExpired`) is the one that
    // gets a notice, on the auth screen.
  };

  const onSignOutPressed = () => {
    if (!shouldConfirmSignOut(workout)) {
      signOut();
      return;
    }

    // D6: confirm only when logged work would be lost. An untouched session is
    // a plan, not a record, and stopping to ask about it is friction with
    // nothing behind it. Sets that are ticked off are the whole point.
    Alert.alert(
      ACCOUNT.confirmTitle,
      ACCOUNT.confirmMessage(countCompletedSets(workout), workout?.title ?? ''),
      [
        { text: ACCOUNT.confirmCancel, style: 'cancel' },
        { text: ACCOUNT.confirmSignOut, style: 'destructive', onPress: signOut },
      ],
    );
  };

  return (
    <Screen
      eyebrow={ACCOUNT.eyebrow}
      title={ACCOUNT.title}
      onBack={() => router.back()}
      backLabel="Close account"
    >
      <Card style={styles.gutter} padding="lg">
        <Text variant="bodySm" tone="secondary">
          {identity ? ACCOUNT.signedInAs(identity) : ACCOUNT.signedInFallback}
        </Text>
      </Card>

      <Card style={styles.gutter} padding="none">
        <ListRow
          title={ACCOUNT.signOutLabel}
          subtitle={ACCOUNT.signOutSubtitle}
          icon="log-out-outline"
          iconTone="coral"
          accessibilityLabel={ACCOUNT.signOutLabel}
          onPress={onSignOutPressed}
        />
      </Card>

      <Text variant="bodySm" tone="faint" style={styles.explanation}>
        {ACCOUNT.explanation}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg, marginTop: space.base },
  explanation: { marginHorizontal: space.lg, marginTop: space.lg },
});
