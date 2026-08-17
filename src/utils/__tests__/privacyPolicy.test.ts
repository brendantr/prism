import fs from 'node:fs';
import path from 'node:path';
import { PRIVACY_POLICY_URL, openPrivacyPolicy } from '../privacyPolicy';

const settingsSource = fs.readFileSync(
  path.resolve(process.cwd(), 'app/settings.tsx'),
  'utf8',
);

describe('privacy policy link', () => {
  it('opens the exact public policy URL through the native opener', async () => {
    const openUrl = jest.fn().mockResolvedValue(undefined);

    await openPrivacyPolicy(openUrl);

    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  });

  it('propagates native opener failures to the settings error boundary', async () => {
    const failure = new Error('native URL opener unavailable');
    const openUrl = jest.fn().mockRejectedValue(failure);

    await expect(openPrivacyPolicy(openUrl)).rejects.toBe(failure);
  });

  it('wires a labelled control and handled failure path into Settings', () => {
    expect(settingsSource).toContain('title={SETTINGS_COPY.privacyPolicyLabel}');
    expect(settingsSource).toContain(
      'accessibilityLabel={SETTINGS_COPY.privacyPolicyLabel}',
    );
    expect(settingsSource).toContain('openPrivacyPolicy()');
    expect(settingsSource).toContain('SETTINGS_COPY.privacyPolicyFailedTitle');
  });
});
