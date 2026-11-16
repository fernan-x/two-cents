/* eslint-disable @typescript-eslint/no-require-imports -- each test re-requires the module after jest.resetModules() to simulate an app restart. */
const mockStored = new Map<string, string>();

jest.mock('@/auth/secure-storage', () => ({
  secureStorage: {
    getPendingInvite: jest.fn(async () => mockStored.get('code') ?? null),
    setPendingInvite: jest.fn(async (code: string) => void mockStored.set('code', code)),
    clearPendingInvite: jest.fn(async () => void mockStored.delete('code')),
  },
}));

describe('pendingInvite (FR-015)', () => {
  beforeEach(() => {
    mockStored.clear();
    jest.resetModules();
  });

  it('keeps a normalized code through sign-up, even after an app restart, until cleared', async () => {
    const { pendingInvite } = require('./pending-invite') as typeof import('./pending-invite');
    await pendingInvite.save('abc-12o');
    expect(await pendingInvite.peek()).toBe('ABC120');

    jest.resetModules();
    const restarted = (require('./pending-invite') as typeof import('./pending-invite')).pendingInvite;
    expect(await restarted.peek()).toBe('ABC120');
    await restarted.clear();
    expect(await restarted.peek()).toBeNull();
  });

  it('ignores something that is not a code', async () => {
    const { pendingInvite } = require('./pending-invite') as typeof import('./pending-invite');
    await pendingInvite.save('not a code');
    expect(await pendingInvite.peek()).toBeNull();
  });

  it('asks for an invitation code once after sign-up (FR-016a)', async () => {
    const { signUpPrompt } = require('./pending-invite') as typeof import('./pending-invite');
    expect(signUpPrompt.consume()).toBe(false);
    signUpPrompt.mark();
    expect(signUpPrompt.consume()).toBe(true);
    expect(signUpPrompt.consume()).toBe(false);
  });
});
