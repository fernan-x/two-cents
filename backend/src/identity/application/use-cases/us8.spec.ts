import { buildServices } from '../testing/build';
import {
  CancelDeletion,
  CancelDeletionByLink,
  FinalizeDeletion,
  RequestDeletion,
} from './account-deletion';
import { ExportData } from './export-data';
import { ReauthTokenChecker } from './reauthenticate';
import { SignUp } from './sign-up';

const device = { deviceName: 'iPhone', platform: 'ios' as const };

async function setup() {
  const s = buildServices();
  const { f } = s;
  const signUp = new SignUp(
    f.users,
    f.hasher,
    f.breach,
    f.events,
    f.tx,
    f.ids,
    f.clock,
    s.sessionIssuer,
    s.confirmation,
  );
  const created = await signUp.execute({
    email: 'u@example.com',
    password: 'un mot de passe solide',
    firstName: 'U',
    locale: 'fr',
    device,
  });
  const userId = created.me.id;
  const sessionId = [...f.sessions.rows.keys()][0];
  const checker = new ReauthTokenChecker(f.sessions, f.secrets, f.clock);
  const request = new RequestDeletion(
    f.users,
    f.sessions,
    f.budgets,
    f.events,
    f.mailer,
    f.links,
    f.tx,
    f.clock,
    checker,
    s.emailTokens,
  );
  const cancel = new CancelDeletion(f.users, f.events, f.tx, f.clock, s.meView);
  const cancelByLink = new CancelDeletionByLink(
    f.users,
    f.events,
    f.tx,
    f.clock,
    s.emailTokens,
  );
  const finalize = new FinalizeDeletion(
    f.users,
    f.identities,
    f.budgets,
    f.events,
    f.mailer,
    f.appleCodes,
    f.encryptor,
    f.tx,
    f.clock,
  );
  const issueReauth = async () => {
    const session = (await f.sessions.findById(sessionId))!;
    const { token, hash } = f.secrets.generate();
    session.issueReauthToken(hash, f.clock.now());
    await f.sessions.save(session);
    return token;
  };
  return {
    ...s,
    userId,
    sessionId,
    request,
    cancel,
    cancelByLink,
    finalize,
    issueReauth,
  };
}

describe('account deletion', () => {
  it('needs a valid re-auth token', async () => {
    const { request, userId, sessionId } = await setup();
    await expect(
      request.execute({ userId, sessionId }, undefined),
    ).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    await expect(
      request.execute({ userId, sessionId }, 'forged'),
    ).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
  });

  it('schedules, cancels invitations, revokes sessions and can be cancelled', async () => {
    const { f, request, cancel, userId, sessionId, issueReauth } =
      await setup();
    const { deletionScheduledAt } = await request.execute(
      { userId, sessionId },
      await issueReauth(),
    );
    expect(deletionScheduledAt).toBe('2026-11-23T10:00:00.000Z');
    expect(f.budgets.calls).toEqual([`cancelInvitations:${userId}`]);
    expect(
      [...f.sessions.rows.values()].every(
        (s) => s.revokedReason === 'account_deletion',
      ),
    ).toBe(true);
    expect((await cancel.execute(userId)).status).toBe('active');
    await expect(cancel.execute(userId)).rejects.toMatchObject({
      code: 'NOT_PENDING',
    });
  });

  it('finalizes only after 7 days, idempotently', async () => {
    const { f, request, finalize, userId, sessionId, issueReauth } =
      await setup();
    await request.execute({ userId, sessionId }, await issueReauth());
    expect(await finalize.execute()).toBe(0);
    f.clock.advance(7 * 86_400_000);
    expect(await finalize.execute()).toBe(1);
    expect(f.users.rows.size).toBe(0);
    expect(f.budgets.calls).toContain(`finalize:${userId}`);
    expect(f.mailer.last()?.mail.kind).toBe('account_deleted');
    expect(await finalize.execute()).toBe(0);
  });

  it('cancel link works until the deletion date', async () => {
    const { f, request, cancelByLink, userId, sessionId, issueReauth } =
      await setup();
    await request.execute({ userId, sessionId }, await issueReauth());
    const link = (f.mailer.last('deletion_scheduled')!.mail as { link: string })
      .link;
    const token = new URL(link).searchParams.get('t')!;
    f.clock.advance(7 * 86_400_000);
    await expect(cancelByLink.execute(token)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });
});

describe('ExportData', () => {
  it('collects profile, sign-in methods and sessions without secrets', async () => {
    const { f, userId } = await setup();
    const exporter = new ExportData(
      f.users,
      f.identities,
      f.sessions,
      f.budgets,
      { build: () => new Uint8Array() },
      f.clock,
    );
    const data = await exporter.collect(userId);
    expect(data.profile).toMatchObject({
      firstName: 'U',
      email: 'u@example.com',
    });
    expect(data.signInMethods).toEqual([
      expect.objectContaining({ method: 'password' }),
    ]);
    expect(JSON.stringify(data)).not.toContain('hashed:');
  });
});
