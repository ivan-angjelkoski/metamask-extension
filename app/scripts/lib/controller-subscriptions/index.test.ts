import {
  registerSubscriptions,
  configureControllersOnNetworkChange,
  type ControllerSubscriptionsDependencies,
} from '.';

function createMockDeps(): ControllerSubscriptionsDependencies {
  return {
    messenger: {
      call: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
    } as unknown as ControllerSubscriptionsDependencies['messenger'],
  };
}

describe('registerSubscriptions', () => {
  it('subscribes to all four expected events', () => {
    const deps = createMockDeps();

    registerSubscriptions(deps);

    const subscribe = deps.messenger.subscribe as jest.Mock;
    const subscribedEvents = subscribe.mock.calls.map(
      ([event]: [string]) => event,
    );
    expect(subscribedEvents).toContain('KeyringController:lock');
    expect(subscribedEvents).toContain('KeyringController:unlock');
    expect(subscribedEvents).toContain('NetworkController:networkDidChange');
    expect(subscribedEvents).toContain(
      'AccountsController:selectedAccountChange',
    );
  });

  it('returns an array of unsubscriber functions', () => {
    const deps = createMockDeps();

    const unsubscribers = registerSubscriptions(deps);

    expect(Array.isArray(unsubscribers)).toBe(true);
  });

  it('KeyringController:lock callback calls SessionManager:onLock', () => {
    const deps = createMockDeps();

    registerSubscriptions(deps);

    const subscribe = deps.messenger.subscribe as jest.Mock;
    const lockEntry = subscribe.mock.calls.find(
      ([event]: [string]) => event === 'KeyringController:lock',
    );
    expect(lockEntry).toBeDefined();
    const callback = lockEntry[1] as () => void;
    callback();

    expect(deps.messenger.call).toHaveBeenCalledWith('SessionManager:onLock');
  });

  it('KeyringController:unlock callback calls SessionManager:onUnlock', () => {
    const deps = createMockDeps();

    registerSubscriptions(deps);

    const subscribe = deps.messenger.subscribe as jest.Mock;
    const unlockEntry = subscribe.mock.calls.find(
      ([event]: [string]) => event === 'KeyringController:unlock',
    );
    const callback = unlockEntry[1] as () => void;
    callback();

    expect(deps.messenger.call).toHaveBeenCalledWith('SessionManager:onUnlock');
  });

  it('NetworkController:networkDidChange callback refreshes AccountTracker', () => {
    const deps = createMockDeps();

    registerSubscriptions(deps);

    const subscribe = deps.messenger.subscribe as jest.Mock;
    const networkEntry = subscribe.mock.calls.find(
      ([event]: [string]) => event === 'NetworkController:networkDidChange',
    );
    const callback = networkEntry[1] as () => void;
    callback();

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountTrackerController:refresh',
    );
  });
});

describe('configureControllersOnNetworkChange', () => {
  it('refreshes AccountTracker and restarts token detection', async () => {
    const deps = createMockDeps();

    await configureControllersOnNetworkChange(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountTrackerController:refresh',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'TokenDetectionController:restart',
    );
  });
});
