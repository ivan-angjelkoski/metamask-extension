import {
  removePermissionsFor,
  resolvePendingApproval,
  rejectPendingApproval,
  updateCaveat,
  removeAllAccountPermissions,
  updateNetworksList,
  setEnabledNetworks,
  registerActions,
  PERMISSION_MANAGEMENT_ACTIONS,
  type PermissionManagementDependencies,
} from '.';

function createMockDeps(): PermissionManagementDependencies {
  return {
    messenger: {
      call: jest.fn().mockResolvedValue(undefined),
      registerActionHandler: jest.fn(),
    } as unknown as PermissionManagementDependencies['messenger'],
  };
}

describe('removePermissionsFor', () => {
  it('delegates to PermissionController:revokePermissions', () => {
    const deps = createMockDeps();
    const subjects = { 'example.com': ['eth_accounts'] };

    removePermissionsFor(deps, subjects);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PermissionController:revokePermissions',
      subjects,
    );
  });
});

describe('resolvePendingApproval', () => {
  it('accepts the approval with the given value', async () => {
    const deps = createMockDeps();

    await resolvePendingApproval(deps, 'approval-id', { result: 'ok' });

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'ApprovalController:accept',
      'approval-id',
      { result: 'ok' },
      undefined,
    );
  });

  it('passes waitForResult option when provided', async () => {
    const deps = createMockDeps();

    await resolvePendingApproval(deps, 'approval-id', null, {
      waitForResult: true,
    });

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'ApprovalController:accept',
      'approval-id',
      null,
      { waitForResult: true },
    );
  });
});

describe('rejectPendingApproval', () => {
  it('rejects the approval with the given error', () => {
    const deps = createMockDeps();
    const error = { code: 4001, message: 'User rejected' };

    rejectPendingApproval(deps, 'approval-id', error);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'ApprovalController:reject',
      'approval-id',
      error,
    );
  });
});

describe('updateCaveat', () => {
  it('delegates to PermissionController:updateCaveat', () => {
    const deps = createMockDeps();

    updateCaveat(
      deps,
      'example.com',
      'eth_accounts',
      'restrictReturnedAccounts',
      ['0xabc'],
    );

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PermissionController:updateCaveat',
      'example.com',
      'eth_accounts',
      'restrictReturnedAccounts',
      ['0xabc'],
    );
  });
});

describe('removeAllAccountPermissions', () => {
  it('delegates to PermissionController:removeAllAccountPermissions', () => {
    const deps = createMockDeps();

    removeAllAccountPermissions(deps, '0xdeadbeef');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PermissionController:removeAllAccountPermissions',
      '0xdeadbeef',
    );
  });
});

describe('updateNetworksList', () => {
  it('delegates to NetworkOrderController:updateNetworksList', () => {
    const deps = createMockDeps();

    updateNetworksList(deps, ['0x1', '0x89']);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'NetworkOrderController:updateNetworksList',
      ['0x1', '0x89'],
    );
  });
});

describe('setEnabledNetworks', () => {
  it('enables the network then refreshes via lookupNetwork', async () => {
    const deps = createMockDeps();

    await setEnabledNetworks(deps, '0x1');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'NetworkEnablementController:enableNetwork',
      '0x1',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'NetworkController:lookupNetwork',
    );
  });
});

describe('registerActions', () => {
  it('registers all permission-management action handlers', () => {
    const messenger = {
      call: jest.fn(),
      registerActionHandler: jest.fn(),
    } as unknown as PermissionManagementDependencies['messenger'];

    registerActions(messenger);

    const expectedCount = Object.keys(PERMISSION_MANAGEMENT_ACTIONS).length;
    expect(messenger.registerActionHandler).toHaveBeenCalledTimes(
      expectedCount,
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      PERMISSION_MANAGEMENT_ACTIONS.removePermissionsFor,
      expect.any(Function),
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      PERMISSION_MANAGEMENT_ACTIONS.setEnabledNetworks,
      expect.any(Function),
    );
  });
});
