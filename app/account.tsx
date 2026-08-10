import { useState } from 'react';
import { Alert, Share, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, ListRow, Screen, Text } from '@/components/ui';
import { ACCOUNT } from '@/content/account';
import { PAYWALL, PURCHASE_OUTCOME_COPY, PURCHASE_OUTCOME_TITLE } from '@/content/paywall';
import { countCompletedSets, shouldConfirmSignOut } from '@/domain/account';
import {
  isEmptyExport,
  serialiseAccountExport,
  summariseAccountExport,
} from '@/domain/accountExport';
import { getRepository } from '@/data/repository';
import { reportHandledError } from '@/observability/telemetry';
import {
  AccountDeletedLocalCleanupError,
  deleteAccountAndTearDown,
  signOutAndTearDown,
} from '@/store/authActions';
import { useActiveWorkoutStore } from '@/store/activeWorkoutStore';
import { useSessionStore } from '@/store/sessionStore';
import { useTrainingStore } from '@/store/trainingStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { space } from '@/theme';

/**
 * ACCOUNT
 * =======
 * Deliberately not a settings screen. Everything here is **account lifecycle**:
 * who you are signed in as, a way out, a copy of your data, and a way to erase
 * the account entirely.
 *
 * ON THE "FOURTH ITEM" RULE
 * -------------------------
 * The sign-out sprint left this screen with a standing instruction: *"if this
 * grows a fourth item it has become the settings surface this sprint was scoped
 * not to build."* This sprint adds two rows, so that rule deserves an answer
 * rather than a quiet edit.
 *
 * The rule's target was **settings** -- units, notification preferences, theme,
 * the long tail that turns a focused sheet into a junk drawer. Export and
 * deletion are not settings; they are the other two things you can do to an
 * account, and `Docs/invariants.md` I-10 makes both blocking requirements with
 * no exception process. Putting them behind a separate "Privacy" screen would
 * satisfy the letter of a three-item limit while making the one irreversible
 * action in the product harder to find, which is the opposite of what a store
 * reviewer and a worried lifter both need.
 *
 * So the rule is restated rather than broken: **this screen holds account
 * lifecycle and nothing else.** A preference belongs somewhere else, and the
 * first one that appears here is the one that has made this a settings surface.
 *
 * The teardown (`signOutAndTearDown`) and the deletion path
 * (`deleteAccountAndTearDown`) both live in `src/store/authActions.ts`. This is
 * the affordance, not the mechanism.
 */
export default function AccountScreen() {
  const router = useRouter();

  const phase = useSessionStore((s) => s.phase);
  const email = useSessionStore((s) => s.email);
  const displayName = useTrainingStore((s) => s.profile?.displayName ?? null);
  const workout = useActiveWorkoutStore((s) => s.workout);
  const entitlementPhase = useEntitlementStore((s) => s.phase);
  const restorePurchase = useEntitlementStore((s) => s.restore);
  const clearPurchaseOutcome = useEntitlementStore((s) => s.clearOutcome);

  /**
   * Which long-running action is in flight, if any.
   *
   * One value rather than two booleans: exporting and deleting must never be
   * startable at the same time, and a single field makes that structural
   * instead of a pair of flags someone has to remember to check together.
   */
  const [busy, setBusy] = useState<'restore' | 'export' | 'delete' | null>(null);

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

  /**
   * Export: read everything, hand it to the OS.
   *
   * `Share` from `react-native` rather than a file written with
   * `expo-file-system` and handed to `expo-sharing` -- neither is a dependency
   * of this project, and adding one is behind `CLAUDE.md`'s approval gate. This
   * works today with nothing new: the share sheet routes to Files, Mail, or
   * anything else that accepts text. The file-based path is the better long-term
   * answer for a large history and is recommended in the sprint record.
   */
  const onExportPressed = async () => {
    setBusy('export');
    try {
      const exported = await getRepository().exportAccountData();

      if (isEmptyExport(exported)) {
        // Not an error, and not worth opening a share sheet over an empty file.
        Alert.alert(ACCOUNT.exportEmptyTitle, ACCOUNT.exportEmptyMessage);
        return;
      }

      await Share.share({
        title: ACCOUNT.exportShareTitle,
        message: serialiseAccountExport(exported),
      });
    } catch (e) {
      // The underlying error can carry schema detail, so it goes to the log and
      // never to the screen -- same rule as CheckInPrompt.
      reportHandledError('account', 'export failed', e);
      Alert.alert(ACCOUNT.exportFailedTitle, ACCOUNT.exportFailedMessage);
    } finally {
      setBusy(null);
    }
  };

  const onRestorePressed = async () => {
    setBusy('restore');
    clearPurchaseOutcome();
    try {
      const restored = await restorePurchase();
      if (restored) {
        Alert.alert(PAYWALL.restoredTitle, PAYWALL.restoredMessage);
        return;
      }
      const failure = useEntitlementStore.getState().lastFailure;
      if (failure && failure !== 'cancelled') {
        Alert.alert(PURCHASE_OUTCOME_TITLE[failure], PURCHASE_OUTCOME_COPY[failure]);
      }
    } finally {
      setBusy(null);
    }
  };

  /**
   * Delete: two prompts, then the irreversible call.
   *
   * The counts in the first prompt are read from the export document rather
   * than from the store, so the number a lifter is shown before erasing
   * everything is the same number that would have been in the file they could
   * have taken with them. If that read fails, the flow still proceeds -- on the
   * copy that names no counts. Refusing to let someone delete their account
   * because a *count* could not be fetched would be the wrong trade.
   */
  const onDeletePressed = async () => {
    setBusy('delete');
    let message: string = ACCOUNT.deleteConfirmMessageEmpty;
    try {
      const summary = summariseAccountExport(await getRepository().exportAccountData());
      if (summary.workouts > 0 || summary.sets > 0 || summary.checkIns > 0) {
        message = ACCOUNT.deleteConfirmMessage(summary);
      }
    } catch (e) {
      reportHandledError('account', 'could not summarise before delete', e);
    } finally {
      setBusy(null);
    }

    Alert.alert(ACCOUNT.deleteConfirmTitle, message, [
      { text: ACCOUNT.deleteConfirmCancel, style: 'cancel' },
      {
        text: ACCOUNT.deleteConfirmContinue,
        style: 'destructive',
        // Second gate. Deletion is the only action in PRism with no undo, no
        // backup and no support path, so a single mis-tap must not reach it.
        onPress: () =>
          Alert.alert(ACCOUNT.deleteFinalTitle, ACCOUNT.deleteFinalMessage, [
            { text: ACCOUNT.deleteFinalCancel, style: 'cancel' },
            { text: ACCOUNT.deleteFinalConfirm, style: 'destructive', onPress: confirmDelete },
          ]),
      },
    ]);
  };

  const confirmDelete = async () => {
    setBusy('delete');
    try {
      await deleteAccountAndTearDown();
      // No success message and no navigation, for the same reason as sign-out:
      // teardown flips the phase last and the route gate unmounts this modal.
      // Someone who just confirmed twice does not need a third screen.
    } catch (e) {
      reportHandledError('account', 'delete failed', e);
      // TWO different failures, and telling them apart is the point.
      //
      // `AccountDeletedLocalCleanupError` means the account is gone and only
      // the device cleanup fell short. Showing the "your data is unchanged"
      // copy here would be a lie -- which is what this screen did before a
      // review caught it, because it caught every rejection identically.
      if (e instanceof AccountDeletedLocalCleanupError) {
        Alert.alert(ACCOUNT.deletedCleanupFailedTitle, ACCOUNT.deletedCleanupFailedMessage);
        // No `setBusy(null)`: the session is already unauthenticated, so the
        // route gate is unmounting this modal regardless.
        return;
      }
      Alert.alert(ACCOUNT.deleteFailedTitle, ACCOUNT.deleteFailedMessage);
      setBusy(null);
    }
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

      {entitlementPhase !== 'disabled' ? (
        <Card style={styles.gutter} padding="none">
          <ListRow
            title={busy === 'restore' ? PAYWALL.restoreBusyLabel : PAYWALL.restoreLabel}
            subtitle={PAYWALL.restoreSubtitle}
            icon="refresh-outline"
            iconTone="violet"
            accessibilityLabel={PAYWALL.restoreLabel}
            disabled={busy !== null}
            busy={busy === 'restore'}
            onPress={() => void onRestorePressed()}
          />
        </Card>
      ) : null}

      {/*
        Export sits ABOVE delete, and the order is the design.

        The two rows are the two halves of I-10, and a lifter who wants their
        data out is very often on the way to erasing it. Putting the reversible
        one first means the destructive one is never the first thing under the
        thumb, and the deletion confirmation names the same counts the export
        would have contained.
      */}
      <Card style={styles.gutter} padding="none">
        <ListRow
          title={busy === 'export' ? ACCOUNT.exportBusyLabel : ACCOUNT.exportLabel}
          subtitle={ACCOUNT.exportSubtitle}
          icon="download-outline"
          accessibilityLabel={ACCOUNT.exportLabel}
          disabled={busy !== null}
          busy={busy === 'export'}
          onPress={onExportPressed}
        />
        <ListRow
          title={busy === 'delete' ? ACCOUNT.deleteBusyLabel : ACCOUNT.deleteLabel}
          subtitle={ACCOUNT.deleteSubtitle}
          icon="trash-outline"
          iconTone="coral"
          accessibilityLabel={ACCOUNT.deleteLabel}
          disabled={busy !== null}
          busy={busy === 'delete'}
          divided
          onPress={onDeletePressed}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg, marginTop: space.base },
  explanation: { marginHorizontal: space.lg, marginTop: space.lg },
});
