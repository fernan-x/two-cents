/** Which external providers are linked to a user (implemented over auth_identities). */
export interface SignInMethodsReader {
  providersFor(userId: string): Promise<Array<'apple' | 'google'>>;
}
export const SIGN_IN_METHODS_READER = Symbol('SignInMethodsReader');
