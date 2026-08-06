import { AuthTokenPurpose } from './entities/auth-token.entity';

export type AuthMailContent = {
  subject: string;
  text: string;
  html: string;
};

export function authActionUrl(
  frontendUrl: string,
  purpose: AuthTokenPurpose,
  token: string,
): string {
  const path =
    purpose === AuthTokenPurpose.PASSWORD_RESET
      ? '/reset-password'
      : '/verify-email';
  const url = new URL(path, frontendUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export function buildAuthMailContent(
  purpose: AuthTokenPurpose,
  actionUrl: string,
  expiresAt: Date,
): AuthMailContent {
  const expires = expiresAt.toISOString();
  if (purpose === AuthTokenPurpose.PASSWORD_RESET) {
    return {
      subject: 'Đặt lại mật khẩu MiniShop',
      text: `Mở liên kết sau để đặt lại mật khẩu: ${actionUrl}\nLiên kết hết hạn lúc ${expires}. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
      html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu MiniShop.</p><p><a href="${actionUrl}">Đặt lại mật khẩu</a></p><p>Liên kết hết hạn lúc ${expires}. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
    };
  }
  return {
    subject: 'Xác minh email MiniShop',
    text: `Mở liên kết sau để xác minh email: ${actionUrl}\nLiên kết hết hạn lúc ${expires}.`,
    html: `<p>Hãy xác minh địa chỉ email của bạn để hoàn tất hồ sơ MiniShop.</p><p><a href="${actionUrl}">Xác minh email</a></p><p>Liên kết hết hạn lúc ${expires}.</p>`,
  };
}
