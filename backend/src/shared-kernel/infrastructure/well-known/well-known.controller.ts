import { Controller, Get, Header, Inject, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ENV, type Env } from '../config/env';

/**
 * Files that let iOS (Universal Links) and Android (App Links) open email links in the app,
 * plus a fallback page for /l/* when the app is not installed (contracts/deep-links.md).
 * Served outside the /v1 prefix.
 */
@Controller()
export class WellKnownController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get('.well-known/apple-app-site-association')
  @Header('Content-Type', 'application/json')
  appleAppSiteAssociation() {
    return {
      applinks: {
        details: [
          {
            appIDs: [`${this.env.APPLE_TEAM_ID}.${this.env.APPLE_BUNDLE_ID}`],
            components: [{ '/': '/l/*' }, { '/': '/i/*' }],
          },
        ],
      },
    };
  }

  @Get('.well-known/assetlinks.json')
  @Header('Content-Type', 'application/json')
  assetLinks() {
    if (!this.env.ANDROID_CERT_SHA256) return [];
    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: this.env.APPLE_BUNDLE_ID,
          sha256_cert_fingerprints: [this.env.ANDROID_CERT_SHA256],
        },
      },
    ];
  }

  /** Never reads or consumes the token: it only tells the user to open the app. */
  @Get('l/:purpose')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  openInApp(@Param('purpose') _purpose: string, @Req() req: Request): string {
    const english = (req.headers['accept-language'] ?? '')
      .toLowerCase()
      .startsWith('en');
    const [title, body] = english
      ? [
          'Open Two Cents',
          'Open this link on the phone where Two Cents is installed. If the app is not installed yet, install it first, then open the link again.',
        ]
      : [
          'Ouvrez Two Cents',
          'Ouvrez ce lien sur le téléphone où Two Cents est installée. Si l’app n’est pas encore installée, installez-la, puis rouvrez le lien.',
        ];
    return `<!doctype html><html lang="${english ? 'en' : 'fr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;line-height:1.5"><h1>${title}</h1><p>${body}</p></body></html>`;
  }
}
