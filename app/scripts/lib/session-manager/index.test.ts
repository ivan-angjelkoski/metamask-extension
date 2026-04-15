import {
  lockWallet,
  onLock,
  onUnlock,
  resetState,
  type SessionManagerDependencies,
} from '.';

function createMockDeps(): SessionManagerDependencies {
  return {
    messenger: {
      call: jest.fn().mockResolvedValue(undefined),
    } as unknown as SessionManagerDependencies['messenger'],
    notificationManager: {
      closeAllNotifications: jest.fn().mockResolvedValue(undefined),
    },
  };
}

describe('lockWallet', () => {
  it('locks the keyring, closes notifications, and broadcasts lock event', async () => {
    const deps = createMockDeps();

    await lockWallet(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'KeyringController:setLocked',
    );
    expect(deps.notificationManager.closeAllNotifications).toHaveBeenCalled();
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'ConnectionManager:notifyAllConnections',
      { method: 'metamask_unlockStateChanged', params: { isUnlocked: false } },
    );
  });
});

describe('onLock', () => {
  it('clears AccountTracker accounts on lock', () => {
    const deps = createMockDeps();

    onLock(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountTrackerController:clearAccounts',
    );
  });
});

describe('onUnlock', () => {
  it('broadcasts unlock event and syncs account tracker', () => {
    const deps = createMockDeps();

    onUnlock(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'ConnectionManager:notifyAllConnections',
      { method: 'metamask_unlockStateChanged', params: { isUnlocked: true } },
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountTrackerController:syncWithAddresses',
    );
  });
});

describe('resetState', () => {
  it('locks keyring, closes notifications, and clears all controller state', async () => {
    const deps = createMockDeps();

    await resetState(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'KeyringController:setLocked',
    );
    expect(deps.notificationManager.closeAllNotifications).toHaveBeenCalled();
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PreferencesController:clearState',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'TransactionController:clearState',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PermissionController:clearState',
    );
  });
});
