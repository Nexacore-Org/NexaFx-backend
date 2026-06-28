import { Test, TestingModule } from '@nestjs/testing';
import { I18nModule, I18nService, AcceptLanguageResolver } from 'nestjs-i18n';
import { join } from 'path';

describe('I18n Integration', () => {
  let i18nService: I18nService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        I18nModule.forRootAsync({
          useFactory: () => ({
            fallbackLanguage: 'en',
            loaderOptions: {
              path: join(__dirname, '/i18n/'),
              watch: true,
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

  it('should translate correct keys in English (fallback)', async () => {
    const text = await i18nService.translate('auth.LOGIN_OTP_SENT', { lang: 'en' });
    expect(text).toBe('If an account exists with this email, an OTP has been sent.');
  });

  it('should translate correct keys in French', async () => {
    const text = await i18nService.translate('auth.LOGIN_OTP_SENT', { lang: 'fr' });
    expect(text).toBe('Si un compte existe avec cet e-mail, un code OTP a été envoyé.');
  });

  it('should translate correct keys in Arabic', async () => {
    const text = await i18nService.translate('auth.LOGIN_OTP_SENT', { lang: 'ar' });
    expect(text).toBe('إذا كان الحساب موجودًا بهذا البريد الإلكتروني، فقد تم إرسال رمز التحقق.');
  });

  it('should silently fall back to English for missing keys', async () => {
    const text = await i18nService.translate('errors.NON_EXISTENT_KEY', { lang: 'fr' });
    expect(text).toBeDefined();
    expect(typeof text).toBe('string');
  });
});
