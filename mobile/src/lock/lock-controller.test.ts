import { createLockController } from './lock-controller';

function setup(requireOnEveryOpen = true) {
  let now = new Date('2026-11-16T10:00:00Z');
  const lock = jest.fn();
  const controller = createLockController({
    getSettings: async () => ({ biometricEnabled: true, requireOnEveryOpen }),
    now: () => now,
    lock,
  });
  return { controller, lock, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe('lock controller', () => {
  it('locks on cold start', async () => {
    const { controller, lock } = setup();
    await controller.onColdStart();
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('does not lock after 10 s in background', async () => {
    const { controller, lock, advance } = setup();
    await controller.onAppStateChange('background');
    advance(10_000);
    await controller.onAppStateChange('active');
    expect(lock).not.toHaveBeenCalled();
  });

  it('locks after 40 s in background', async () => {
    const { controller, lock, advance } = setup();
    await controller.onAppStateChange('background');
    advance(40_000);
    await controller.onAppStateChange('active');
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('never locks when the lock is disabled', async () => {
    const { controller, lock, advance } = setup(false);
    await controller.onColdStart();
    await controller.onAppStateChange('background');
    advance(3_600_000);
    await controller.onAppStateChange('active');
    expect(lock).not.toHaveBeenCalled();
  });
});
