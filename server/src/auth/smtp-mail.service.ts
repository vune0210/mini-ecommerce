import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AuthTokenDelivery, maskEmail } from './token-rules';
import { authActionUrl, buildAuthMailContent } from './auth-mail';

@Injectable()
export class SmtpMailService {
  private readonly logger = new Logger(SmtpMailService.name);
  private readonly transporter?: Transporter;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) return;

    const port = Number(this.config.getOrThrow<string>('SMTP_PORT'));
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
      },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.transporter);
  }

  async sendAuthToken(delivery: AuthTokenDelivery): Promise<boolean> {
    if (!this.transporter) return false;

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const actionUrl = authActionUrl(
      frontendUrl,
      delivery.purpose,
      delivery.token,
    );
    const content = buildAuthMailContent(
      delivery.purpose,
      actionUrl,
      delivery.expiresAt,
    );
    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('SMTP_FROM'),
      to: delivery.to,
      ...content,
    });
    this.logger.log({
      message: 'Authentication email sent',
      to: maskEmail(delivery.to),
      purpose: delivery.purpose,
    });
    return true;
  }
}
