import { Linking } from 'react-native';

export const PRIVACY_POLICY_URL = 'https://www.simulisten.com/prism-legal/';

type OpenUrl = (url: string) => Promise<unknown>;

/** Open the public policy through the platform's native URL handler. */
export async function openPrivacyPolicy(
  openUrl: OpenUrl = (url) => Linking.openURL(url),
): Promise<void> {
  await openUrl(PRIVACY_POLICY_URL);
}
