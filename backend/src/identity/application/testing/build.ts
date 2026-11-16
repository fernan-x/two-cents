// Builds services and use cases on top of the fakes, mirroring IdentityModule's wiring.
import { Authenticator } from '../services/authenticator';
import { EmailConfirmationSender } from '../services/email-confirmation-sender';
import { EmailTokenIssuer } from '../services/email-token-issuer';
import { MeView } from '../services/me-view';
import { PasswordVerifier } from '../services/password-verifier';
import { SessionIssuer } from '../services/session-issuer';
import { createFakes, type Fakes } from './fakes';

export function buildServices(f: Fakes = createFakes()) {
  const meView = new MeView(f.budgets, f.identities);
  const sessionIssuer = new SessionIssuer(
    f.sessions,
    f.secrets,
    f.accessTokens,
    f.ids,
    f.clock,
    meView,
  );
  const emailTokens = new EmailTokenIssuer(
    f.emailTokens,
    f.secrets,
    f.ids,
    f.clock,
  );
  const confirmation = new EmailConfirmationSender(
    emailTokens,
    f.mailer,
    f.links,
  );
  const passwords = new PasswordVerifier(
    f.users,
    f.hasher,
    f.events,
    f.mailer,
    f.tx,
    f.clock,
  );
  const authenticator = new Authenticator(
    f.accessTokens,
    f.sessions,
    f.users,
    f.clock,
  );
  return {
    f,
    meView,
    sessionIssuer,
    emailTokens,
    confirmation,
    passwords,
    authenticator,
  };
}
export type Services = ReturnType<typeof buildServices>;
