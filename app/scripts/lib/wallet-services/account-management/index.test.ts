import {
  setSelectedAccount,
  setAccountLabel,
  removeAccount,
  sortEvmAccountsByLastSelected,
  sortAddressesWithInternalAccounts,
  registerActions,
  ACCOUNT_MANAGEMENT_ACTIONS,
  type AccountManagementDependencies,
} from '.';

function createMockDeps(): AccountManagementDependencies {
  return {
    messenger: {
      call: jest.fn().mockResolvedValue(undefined),
      registerActionHandler: jest.fn(),
    } as unknown as AccountManagementDependencies['messenger'],
  };
}

describe('setSelectedAccount', () => {
  it('calls AccountsController:setSelectedAccount with the account id', () => {
    const deps = createMockDeps();

    setSelectedAccount(deps, 'account-uuid-123');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountsController:setSelectedAccount',
      'account-uuid-123',
    );
  });
});

describe('setAccountLabel', () => {
  it('looks up the account and sets its name', () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'AccountsController:getAccountByAddress')
        return { id: 'uuid-abc' };
      return undefined;
    });

    setAccountLabel(deps, '0xabc', 'My Account');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountsController:getAccountByAddress',
      '0xabc',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountsController:setAccountName',
      'uuid-abc',
      'My Account',
    );
  });

  it('throws when no account is found for the address', () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation(() => undefined);

    expect(() => setAccountLabel(deps, '0xunknown', 'label')).toThrow(
      'No account found for address: 0xunknown',
    );
  });
});

describe('removeAccount', () => {
  it('revokes permissions then removes the keyring entry', async () => {
    const deps = createMockDeps();

    const result = await removeAccount(deps, '0xdeadbeef');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PermissionController:removeAllAccountPermissions',
      '0xdeadbeef',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'KeyringController:removeAccount',
      '0xdeadbeef',
    );
    expect(result).toBe('0xdeadbeef');
  });
});

describe('sortEvmAccountsByLastSelected', () => {
  it('sorts addresses by lastSelected timestamp (most recent first)', () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'AccountsController:listAccounts') {
        return [
          { address: '0xaaa', metadata: { lastSelected: 1000 } },
          { address: '0xbbb', metadata: { lastSelected: 3000 } },
          { address: '0xccc', metadata: { lastSelected: 2000 } },
        ];
      }
      return undefined;
    });

    const result = sortEvmAccountsByLastSelected(deps, [
      '0xaaa',
      '0xbbb',
      '0xccc',
    ]);

    expect(result).toStrictEqual(['0xbbb', '0xccc', '0xaaa']);
  });
});

describe('sortAddressesWithInternalAccounts', () => {
  it('throws when an address has no matching internal account', () => {
    const deps = createMockDeps();
    // Two addresses are needed — the sort comparator only fires with ≥2 elements.
    // The missing address is encountered as firstAddress in the first comparison.
    expect(() =>
      sortAddressesWithInternalAccounts(deps, ['0xunknown', '0xother'], []),
    ).toThrow(/Missing identity for address:/);
  });

  it('places addresses without lastSelected at the end', () => {
    const deps = createMockDeps();
    const accounts = [
      { address: '0xaaa', metadata: {} },
      { address: '0xbbb', metadata: { lastSelected: 5000 } },
    ];

    const result = sortAddressesWithInternalAccounts(
      deps,
      ['0xaaa', '0xbbb'],
      accounts,
    );

    expect(result).toStrictEqual(['0xbbb', '0xaaa']);
  });
});

describe('registerActions', () => {
  it('registers all account-management action handlers', () => {
    const messenger = {
      call: jest.fn(),
      registerActionHandler: jest.fn(),
    } as unknown as AccountManagementDependencies['messenger'];

    registerActions(messenger);

    const expectedCount = Object.keys(ACCOUNT_MANAGEMENT_ACTIONS).length;
    expect(messenger.registerActionHandler).toHaveBeenCalledTimes(
      expectedCount,
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      ACCOUNT_MANAGEMENT_ACTIONS.setSelectedAccount,
      expect.any(Function),
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      ACCOUNT_MANAGEMENT_ACTIONS.removeAccount,
      expect.any(Function),
    );
  });

  it('registered setSelectedAccount handler delegates to the function', () => {
    const messenger = {
      call: jest.fn(),
      registerActionHandler: jest.fn(),
    } as unknown as AccountManagementDependencies['messenger'];

    registerActions(messenger);

    const mockRegister =
      messenger.registerActionHandler as unknown as jest.Mock;
    const entry = mockRegister.mock.calls.find(
      ([name]: [string]) =>
        name === ACCOUNT_MANAGEMENT_ACTIONS.setSelectedAccount,
    );
    const handler = entry[1] as (id: string) => void;
    handler('my-account-id');

    expect(messenger.call).toHaveBeenCalledWith(
      'AccountsController:setSelectedAccount',
      'my-account-id',
    );
  });
});
