import { Test, TestingModule } from '@nestjs/testing';
import { I18nModule, I18nService, AcceptLanguageResolver } from 'nestjs-i18n';
import { join } from 'path';

/**
 * Integration tests for the application's i18n configuration.
 *
 * These tests load the real translation files from `i18n/` (no mocking)
 * to verify that:
 *  - the module boots correctly with the configured loader/resolver,
 *  - keys resolve to the expected string in every supported locale,
 *  - missing keys and unsupported locales fall back gracefully instead
 *    of throwing.
 */
describe('I18n Integration', () => {
  let i18nService: I18nService;
  let moduleRef: TestingModule;

  const LOGIN_OTP_SENT_KEY = 'auth.LOGIN_OTP_SENT';
  const FALLBACK_LANGUAGE = 'en';

  // Table of supported locales and their expected translation.
  // Add a new row here whenever a locale is added to the i18n/ directory.
  const EXPECTED_TRANSLATIONS: Record<string, string> = {
    en: 'If an account exists with this email, an OTP has been sent.',
    fr: 'Si un compte existe avec cet e-mail, un code OTP a été envoyé.',
    ar: 'إذا كان الحساب موجودًا بهذا البريد الإلكتروني، فقد تم إرسال رمز التحقق.',
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        I18nModule.forRootAsync({
          useFactory: () => ({
            fallbackLanguage: FALLBACK_LANGUAGE,
            loaderOptions: {
              path: join(__dirname, '/i18n/'),
              // File watching is only useful for local dev hot-reload.
              // Leaving it on in tests spins up a chokidar watcher that
              // keeps an open handle alive and can make Jest hang or
              // report "did not exit" warnings after the suite finishes.
              watch: false,
            },
          }),
          resolvers: [AcceptLanguageResolver],
        }),
      ],
    }).compile();

    i18nService = moduleRef.get<I18nService>(I18nService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should be defined', () => {
    expect(i18nService).toBeDefined();
  });

  describe('supported locales', () => {
    it.each(Object.entries(EXPECTED_TRANSLATIONS))(
      'should translate "%s" correctly',
      async (lang, expected) => {
        const text = await i18nService.translate(LOGIN_OTP_SENT_KEY, { lang });
        expect(text).toBe(expected);
      },
    );
  });

  describe('fallback behaviour', () => {
    it('should silently fall back to the default language for a missing key', async () => {
      const text = await i18nService.translate('errors.NON_EXISTENT_KEY', { lang: 'fr' });
      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    });

    it('should fall back to the default language for an unsupported locale', async () => {
      const text = await i18nService.translate(LOGIN_OTP_SENT_KEY, { lang: 'zz' });
      expect(text).toBe(EXPECTED_TRANSLATIONS[FALLBACK_LANGUAGE]);
    });

    it('should not throw when translating with no lang option provided', async () => {
      await expect(i18nService.translate(LOGIN_OTP_SENT_KEY)).resolves.toBeDefined();
    });
  });

  // Interpolation is a common source of regressions (missing `{args}`
  // placeholders, wrong casing, etc.). Wire this up once you have a
  // real interpolated key in your translation files, e.g.:
  //   auth.WELCOME_USER: "Welcome, {name}!"
  describe.skip('interpolation', () => {
    it('should interpolate args into the translated string', async () => {
      const text = await i18nService.translate('auth.WELCOME_USER', {
        lang: 'en',
        args: { name: 'Jane' },
      });
      expect(text).toContain('Jane');
    });
  });
});