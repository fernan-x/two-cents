import {
  createRemoteJWKSet,
  type JWTPayload,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';

/** Verifies an RS256 identity token against a provider's JWKS (keys cached by jose). */
export async function verifyWithJwks(
  token: string,
  keys: JWTVerifyGetKey,
  options: { issuer: string | string[]; audience: string },
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ['RS256'],
    });
    return payload;
  } catch {
    return null;
  }
}

export const remoteJwks = (url: string): JWTVerifyGetKey =>
  createRemoteJWKSet(new URL(url));

/** Apple sends some booleans as the strings "true"/"false" (research R8). */
export const asBoolean = (value: unknown): boolean =>
  value === true || value === 'true';
