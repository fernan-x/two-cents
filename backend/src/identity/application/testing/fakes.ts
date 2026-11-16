// In-memory fakes of every identity port, for fast use-case unit tests (research R19).
import { AuthIdentity as AuthIdentityEntity } from '../../domain/entities/auth-identity';
import { PendingLink as PendingLinkEntity } from '../../domain/entities/pending-link';
import type {
  Clock,
  IdGenerator,
  TransactionRunner,
} from '../../../shared-kernel/application/ports';
import {
  EmailToken,
  type EmailTokenPurpose,
} from '../../domain/entities/email-token';
import {
  Session,
  type SessionRevokedReason,
} from '../../domain/entities/session';
import { User } from '../../domain/entities/user';
import type {
  EmailTokenRepository,
  SecurityEventLog,
  SecurityEventType,
  SessionRepository,
  UserRepository,
} from '../../domain/ports/repositories';
import type { PlainPassword } from '../../domain/value-objects/plain-password';
import type {
  BudgetExportPort,
  BudgetExportRow,
  BudgetMembershipPort,
} from '../ports/budgets';
import type {
  IdentityMail,
  IdentityMailer,
  LinkBuilder,
  MailRecipient,
} from '../ports/mailer';
import type {
  AccessTokenIssuer,
  BreachedPasswordChecker,
  PasswordHasher,
  SecretEncryptor,
  SecretTokenGenerator,
} from '../ports/security';
import type { SignInMethodsReader } from '../ports/sign-in-methods';

export class FakeClock implements Clock {
  constructor(public current = new Date('2026-11-16T10:00:00Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class FakeIds implements IdGenerator {
  private n = 0;
  next(): string {
    this.n += 1;
    return `00000000-0000-7000-8000-${String(this.n).padStart(12, '0')}`;
  }
}

/** Runs work directly; after-commit callbacks run when the outermost `run` succeeds. */
export class FakeTransactionRunner implements TransactionRunner {
  private depth = 0;
  private pending: Array<() => Promise<void> | void> = [];
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.depth += 1;
    try {
      const result = await work();
      if (this.depth === 1) {
        const callbacks = this.pending;
        this.pending = [];
        for (const cb of callbacks) await cb();
      }
      return result;
    } catch (error) {
      if (this.depth === 1) this.pending = [];
      throw error;
    } finally {
      this.depth -= 1;
    }
  }
  afterCommit(work: () => Promise<void> | void): void {
    if (this.depth > 0) this.pending.push(work);
    else void work();
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly rows = new Map<string, User>();
  findById(id: string) {
    const user = this.rows.get(id);
    return Promise.resolve(
      user ? User.fromPersistence(user.toSnapshot()) : null,
    );
  }
  findByNormalizedEmail(email: string) {
    const user = [...this.rows.values()].find(
      (u) => u.emailNormalized === email,
    );
    return Promise.resolve(
      user ? User.fromPersistence(user.toSnapshot()) : null,
    );
  }
  save(user: User) {
    const clash = [...this.rows.values()].find(
      (u) => u.emailNormalized === user.emailNormalized && u.id !== user.id,
    );
    if (clash)
      return Promise.reject(new Error('unique violation: email_normalized'));
    this.rows.set(user.id, User.fromPersistence(user.toSnapshot()));
    return Promise.resolve();
  }
  delete(id: string) {
    this.rows.delete(id);
    return Promise.resolve();
  }
  findDueForDeletion(now: Date) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((u) => u.isDueForDeletion(now))
        .map((u) => User.fromPersistence(u.toSnapshot())),
    );
  }
}

export class InMemorySessionRepository implements SessionRepository {
  readonly rows = new Map<string, Session>();
  private copy = (s: Session) => Session.fromPersistence(s.toSnapshot());
  findById(id: string) {
    const s = this.rows.get(id);
    return Promise.resolve(s ? this.copy(s) : null);
  }
  findByRefreshHash(hash: string) {
    const s = [...this.rows.values()].find(
      (x) => x.toSnapshot().refreshTokenHash === hash,
    );
    return Promise.resolve(s ? this.copy(s) : null);
  }
  findByPreviousRefreshHash(hash: string) {
    const s = [...this.rows.values()].find(
      (x) => x.toSnapshot().previousRefreshTokenHash === hash,
    );
    return Promise.resolve(s ? this.copy(s) : null);
  }
  listActiveByUser(userId: string, now: Date) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((s) => s.userId === userId && s.isActive(now))
        .map(this.copy),
    );
  }
  save(session: Session) {
    this.rows.set(session.id, this.copy(session));
    return Promise.resolve();
  }
  revokeAllForUser(
    userId: string,
    reason: SessionRevokedReason,
    now: Date,
    exceptSessionId?: string,
  ) {
    let count = 0;
    for (const s of this.rows.values()) {
      if (
        s.userId === userId &&
        s.id !== exceptSessionId &&
        s.toSnapshot().revokedAt === null
      ) {
        s.revoke(reason, now);
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}

export class InMemoryEmailTokenRepository implements EmailTokenRepository {
  readonly rows = new Map<string, EmailToken>();
  findByHash(hash: string) {
    const t = [...this.rows.values()].find(
      (x) => x.toSnapshot().tokenHash === hash,
    );
    return Promise.resolve(
      t ? EmailToken.fromPersistence(t.toSnapshot()) : null,
    );
  }
  save(token: EmailToken) {
    this.rows.set(token.id, EmailToken.fromPersistence(token.toSnapshot()));
    return Promise.resolve();
  }
  supersedeAll(userId: string, purpose: EmailTokenPurpose, now: Date) {
    for (const t of this.rows.values())
      if (t.userId === userId && t.purpose === purpose) t.supersede(now);
    return Promise.resolve();
  }
}

export class FakeSecurityEventLog implements SecurityEventLog {
  readonly events: Array<{
    type: SecurityEventType;
    userId?: string | null;
    sessionId?: string | null;
  }> = [];
  record(event: {
    type: SecurityEventType;
    userId?: string | null;
    sessionId?: string | null;
  }) {
    this.events.push(event);
    return Promise.resolve();
  }
  types(): SecurityEventType[] {
    return this.events.map((e) => e.type);
  }
}

export class FakePasswordHasher implements PasswordHasher {
  hash(password: PlainPassword) {
    return Promise.resolve(`hashed:${password.reveal()}`);
  }
  verify(hash: string, password: PlainPassword) {
    return Promise.resolve(hash === `hashed:${password.reveal()}`);
  }
  needsRehash() {
    return false;
  }
  verifyDummy() {
    return Promise.resolve();
  }
}

export class FakeSecretTokenGenerator implements SecretTokenGenerator {
  private n = 0;
  generate() {
    this.n += 1;
    const token = `token-${this.n}`;
    return { token, hash: this.hash(token) };
  }
  hash(token: string) {
    return `h(${token})`;
  }
}

export class FakeAccessTokenIssuer implements AccessTokenIssuer {
  issue(userId: string, sessionId: string) {
    return Promise.resolve({
      token: `access:${userId}:${sessionId}`,
      expiresAt: new Date('2026-11-16T10:15:00Z'),
    });
  }
  verify(token: string) {
    const [kind, userId, sessionId] = token.split(':');
    return Promise.resolve(
      kind === 'access' && userId && sessionId ? { userId, sessionId } : null,
    );
  }
}

export class FakeBreachedPasswordChecker implements BreachedPasswordChecker {
  readonly breached = new Set<string>(['password123', 'azertyuiop']);
  isBreached(password: PlainPassword) {
    return Promise.resolve(this.breached.has(password.reveal()));
  }
}

export class FakeSecretEncryptor implements SecretEncryptor {
  encrypt(plaintext: string) {
    return Buffer.from(`enc:${plaintext}`);
  }
  decrypt(ciphertext: Buffer) {
    return ciphertext.toString().replace(/^enc:/, '');
  }
}

export class FakeMailer implements IdentityMailer {
  readonly sent: Array<{ to: MailRecipient; mail: IdentityMail }> = [];
  send(to: MailRecipient, mail: IdentityMail) {
    this.sent.push({ to, mail });
  }
  last(kind?: IdentityMail['kind']) {
    return [...this.sent].reverse().find((m) => !kind || m.mail.kind === kind);
  }
}

export class FakeLinkBuilder implements LinkBuilder {
  build(path: string, token: string) {
    return `https://links.test/l/${path}?t=${token}`;
  }
}

export class FakeBudgetPorts implements BudgetMembershipPort, BudgetExportPort {
  readonly usersWithBudget = new Set<string>();
  readonly calls: string[] = [];
  hasAnyBudget(userId: string) {
    return Promise.resolve(this.usersWithBudget.has(userId));
  }
  cancelInvitationsSentBy(userId: string) {
    this.calls.push(`cancelInvitations:${userId}`);
    return Promise.resolve();
  }
  finalizeMemberDeletion(userId: string) {
    this.calls.push(`finalize:${userId}`);
    return Promise.resolve();
  }
  previewMemberDeletion() {
    return Promise.resolve({ budgetsDeleted: [], budgetsLeft: [] });
  }
  exportForUser(): Promise<BudgetExportRow> {
    return Promise.resolve({ budgets: [], entries: [] });
  }
}

export class FakeSignInMethods implements SignInMethodsReader {
  readonly byUser = new Map<string, Array<'apple' | 'google'>>();
  providersFor(userId: string) {
    return Promise.resolve(this.byUser.get(userId) ?? []);
  }
}

/** A fully wired set of fakes. */
export function createFakes() {
  return {
    clock: new FakeClock(),
    ids: new FakeIds(),
    tx: new FakeTransactionRunner(),
    users: new InMemoryUserRepository(),
    sessions: new InMemorySessionRepository(),
    emailTokens: new InMemoryEmailTokenRepository(),
    events: new FakeSecurityEventLog(),
    hasher: new FakePasswordHasher(),
    secrets: new FakeSecretTokenGenerator(),
    accessTokens: new FakeAccessTokenIssuer(),
    breach: new FakeBreachedPasswordChecker(),
    encryptor: new FakeSecretEncryptor(),
    mailer: new FakeMailer(),
    links: new FakeLinkBuilder(),
    budgets: new FakeBudgetPorts(),
    signInMethods: new FakeSignInMethods(),
    identities: new InMemoryAuthIdentityRepository(),
    pendingLinks: new InMemoryPendingLinkRepository(),
    appleVerifier: new FakeProviderVerifier(),
    googleVerifier: new FakeProviderVerifier(),
    appleCodes: new FakeAppleCodeExchanger(),
  };
}
export type Fakes = ReturnType<typeof createFakes>;

export class InMemoryAuthIdentityRepository {
  readonly rows = new Map<
    string,
    import('../../domain/entities/auth-identity').AuthIdentity
  >();
  private copy = (
    i: import('../../domain/entities/auth-identity').AuthIdentity,
  ) => AuthIdentityEntity.fromPersistence(i.toSnapshot());
  findByProviderSubject(provider: string, subject: string) {
    const found = [...this.rows.values()].find(
      (i) =>
        i.provider === provider && i.toSnapshot().providerSubject === subject,
    );
    return Promise.resolve(found ? this.copy(found) : null);
  }
  listByUser(userId: string) {
    return Promise.resolve(
      [...this.rows.values()].filter((i) => i.userId === userId).map(this.copy),
    );
  }
  save(identity: import('../../domain/entities/auth-identity').AuthIdentity) {
    this.rows.set(identity.id, this.copy(identity));
    return Promise.resolve();
  }
  delete(id: string) {
    this.rows.delete(id);
    return Promise.resolve();
  }
  async providersFor(userId: string) {
    return (await this.listByUser(userId)).map((i) => i.provider);
  }
}

export class InMemoryPendingLinkRepository {
  readonly rows = new Map<
    string,
    import('../../domain/entities/pending-link').PendingLink
  >();
  private copy = (
    l: import('../../domain/entities/pending-link').PendingLink,
  ) => PendingLinkEntity.fromPersistence(l.toSnapshot());
  findById(id: string) {
    const l = this.rows.get(id);
    return Promise.resolve(l ? this.copy(l) : null);
  }
  findByTokenHash(hash: string) {
    const l = [...this.rows.values()].find(
      (x) => x.toSnapshot().linkTokenHash === hash,
    );
    return Promise.resolve(l ? this.copy(l) : null);
  }
  save(link: import('../../domain/entities/pending-link').PendingLink) {
    this.rows.set(link.id, this.copy(link));
    return Promise.resolve();
  }
}

export class FakeProviderVerifier {
  readonly claims = new Map<
    string,
    import('../ports/providers').ProviderClaims
  >();
  verify(token: string) {
    return Promise.resolve(this.claims.get(token) ?? null);
  }
}

export class FakeAppleCodeExchanger {
  readonly revoked: string[] = [];
  exchange(code: string) {
    return Promise.resolve(`apple-refresh:${code}`);
  }
  revoke(token: string) {
    this.revoked.push(token);
    return Promise.resolve();
  }
}
