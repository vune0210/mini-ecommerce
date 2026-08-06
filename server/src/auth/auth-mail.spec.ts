import { AuthTokenPurpose } from './entities/auth-token.entity';
import { authActionUrl, buildAuthMailContent } from './auth-mail';

describe('auth mail', () => {
  it('builds a password reset link on the configured frontend', () => {
    const url = authActionUrl(
      'https://shop.example.com',
      AuthTokenPurpose.PASSWORD_RESET,
      'secret_token',
    );
    expect(url).toBe(
      'https://shop.example.com/reset-password?token=secret_token',
    );
  });

  it('builds a verification link and content with the expiry', () => {
    const url = authActionUrl(
      'https://shop.example.com/',
      AuthTokenPurpose.EMAIL_VERIFICATION,
      'verify_token',
    );
    const content = buildAuthMailContent(
      AuthTokenPurpose.EMAIL_VERIFICATION,
      url,
      new Date('2026-08-06T12:00:00.000Z'),
    );
    expect(url).toBe(
      'https://shop.example.com/verify-email?token=verify_token',
    );
    expect(content.subject).toMatch(/Xác minh/);
    expect(content.text).toContain(url);
    expect(content.text).toContain('2026-08-06T12:00:00.000Z');
  });
});
