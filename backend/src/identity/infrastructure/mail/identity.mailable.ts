import {
  html,
  type Mailable,
  type MailContent,
  type MailRenderContext,
} from '@nestjs/mail';
import type { MailText } from './identity-mail-content';

/** Renders any identity email; values are escaped by the `html` tag (research R20). */
export class IdentityMailable implements Mailable<MailText> {
  render(data: MailText, _context: MailRenderContext): MailContent {
    const paragraphs = data.paragraphs.map(
      (p) => html`<p style="margin:0 0 16px">${p}</p>`,
    );
    const action = data.action
      ? html`<p style="margin:24px 0">
          <a
            href="${data.action.url}"
            style="background:#2457D6;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;display:inline-block"
            >${data.action.label}</a
          >
        </p>`
      : html``;
    const text = [
      ...data.paragraphs,
      ...(data.action ? [`${data.action.label} : ${data.action.url}`] : []),
    ].join('\n\n');
    return {
      subject: data.subject,
      html: html`<!doctype html>
        <html>
          <body
            style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px"
          >
            ${paragraphs}${action}
            <p style="color:#60646C;font-size:13px">Two Cents</p>
          </body>
        </html>`,
      text,
    };
  }
}
