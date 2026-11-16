const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The French install page for an invitation link (FR-016, contracts/links-and-notifications.md). */
export function renderInvitePage(input: {
  code: string | null;
  appStoreUrl: string;
  playStoreUrl: string;
}): string {
  const code = input.code
    ? `<p>Après l’installation, créez votre compte puis saisissez ce code quand l’app vous le demande :</p>
<p class="code" aria-label="Code d’invitation">${escape(input.code)}</p>`
    : `<p>Ce lien d’invitation est incomplet. Demandez un nouveau lien à la personne qui vous a invité·e.</p>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rejoindre un budget sur Two Cents</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;line-height:1.5;color:#111}
.code{font-size:2.5rem;font-weight:700;letter-spacing:.15em;text-align:center;margin:24px 0;font-variant-numeric:tabular-nums}
.stores{display:flex;flex-direction:column;gap:12px;margin-top:24px}
.stores a{display:block;text-align:center;padding:14px;border-radius:12px;background:#111;color:#fff;text-decoration:none;font-weight:600;min-height:44px}
@media (prefers-color-scheme:dark){body{background:#000;color:#eee}.stores a{background:#eee;color:#111}}</style></head>
<body><h1>On vous invite à partager un budget</h1>
<p>Two Cents s’ouvre sur l’invitation si l’app est installée. Sinon, installez-la :</p>
<div class="stores"><a href="${escape(input.appStoreUrl)}">Télécharger sur l’App Store</a><a href="${escape(input.playStoreUrl)}">Disponible sur Google Play</a></div>
${code}</body></html>`;
}
