import fs from 'node:fs';
import path from 'node:path';

interface ExpoConfig {
  readonly name: string;
  readonly slug: string;
  readonly scheme: string;
  readonly ios?: { readonly bundleIdentifier?: string };
  readonly android?: { readonly package?: string };
}

interface EasProfile {
  readonly env?: Record<string, string>;
}

const appConfig = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'app.json'), 'utf8'),
) as { expo: ExpoConfig };
const easConfig = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'eas.json'), 'utf8'),
) as { build: Record<string, EasProfile> };

describe('release app identity', () => {
  it('keeps the Repello display name and stable technical identities', () => {
    expect(appConfig.expo.name).toBe('Repello');
    expect(appConfig.expo.slug).toBe('prism');
    expect(appConfig.expo.scheme).toBe('prism');
    expect(appConfig.expo.ios?.bundleIdentifier).toBe('app.prism.trainer');
    expect(appConfig.expo.android?.package).toBe('app.prism.trainer');
  });

  it('pins monetization off in review-capable EAS profiles', () => {
    expect(easConfig.build.preview?.env?.EXPO_PUBLIC_MONETIZATION_ENABLED).toBe('false');
    expect(easConfig.build.production?.env?.EXPO_PUBLIC_MONETIZATION_ENABLED).toBe('false');
  });
});
