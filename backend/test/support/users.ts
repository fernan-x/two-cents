import { sql } from 'drizzle-orm';
import { device, type E2eApp } from './e2e-app';

export interface TestUser {
  userId: string;
  sessionId: string;
  token: string;
  email: string;
  firstName: string;
}

let counter = 0;

/** Signs up through the API, then marks the email as confirmed (001 FR-011 gates invitations on it). */
export async function signUpUser(
  e2e: E2eApp,
  options: { firstName?: string; email?: string; confirmed?: boolean } = {},
): Promise<TestUser> {
  counter += 1;
  const firstName = options.firstName ?? `Personne${counter}`;
  const email = options.email ?? `user${counter}-${Date.now()}@example.com`;
  const res = await e2e.client().post('/v1/auth/signup').send({
    email,
    password: 'un mot de passe solide',
    firstName,
    locale: 'fr',
    device,
  });
  if (res.status !== 201)
    throw new Error(
      `sign-up failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  const userId = res.body.me.id as string;
  if (options.confirmed !== false)
    await e2e.db.execute(
      sql`UPDATE users SET email_confirmed_at = now() WHERE id = ${userId}`,
    );
  const [session] = (
    await e2e.db.execute<{ id: string }>(
      sql`SELECT id FROM sessions WHERE user_id = ${userId} LIMIT 1`,
    )
  ).rows;
  return {
    userId,
    sessionId: session.id,
    token: res.body.tokens.accessToken as string,
    email: email.toLowerCase(),
    firstName,
  };
}

/** An HTTP client authenticated as `user`. */
export function as(e2e: E2eApp, user: TestUser) {
  const client = e2e.client();
  const auth = `Bearer ${user.token}`;
  return {
    get: (url: string) => client.get(url).set('Authorization', auth),
    post: (url: string, body?: object) =>
      client
        .post(url)
        .set('Authorization', auth)
        .send(body ?? {}),
    put: (url: string, body?: object) =>
      client
        .put(url)
        .set('Authorization', auth)
        .send(body ?? {}),
    patch: (url: string, body?: object) =>
      client
        .patch(url)
        .set('Authorization', auth)
        .send(body ?? {}),
    delete: (url: string, body?: object) =>
      client
        .delete(url)
        .set('Authorization', auth)
        .send(body ?? {}),
  };
}
