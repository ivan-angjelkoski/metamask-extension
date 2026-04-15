jest.mock('loglevel');

import {
  createNewVaultAndKeychain,
  createNewVaultAndRestore,
  submitPassword,
  verifyPassword,
  setLocked,
  exportAccount,
  getSeedPhrase,
  fetchAllSecretData,
  resetWallet,
  markPasswordForgotten,
  unMarkPasswordForgotten,
  getHDEntropyIndex,
  registerActions,
  VAULT_MANAGEMENT_ACTIONS,
  type VaultDependencies,
} from '.';

function createMockDeps(): VaultDependencies {
  return {
    messenger: {
      call: jest.fn().mockResolvedValue(undefined),
      registerActionHandler: jest.fn(),
    } as unknown as VaultDependencies['messenger'],
  };
}

/** Sets up messenger.call to return `value` for `action` and undefined otherwise. */
function mockCallReturn(
  deps: VaultDependencies,
  action: string,
  value: unknown,
) {
  const mockCall = deps.messenger.call as jest.Mock;
  mockCall.mockImplementation((calledAction: string) => {
    if (calledAction === action) {
      return value;
    }
    return Promise.resolve(undefined);
  });
}

describe('createNewVaultAndKeychain', () => {
  it('clears state when wallet reset is in progress', async () => {
    const deps = createMockDeps();
    mockCallReturn(deps, 'AppStateController:getIsWalletResetInProgress', true);

    await createNewVaultAndKeychain(deps, 'password');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PermissionController:clearState',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountTreeController:clearState',
    );
  });

  it('skips state clearing when wallet reset is not in progress', async () => {
    const deps = createMockDeps();
    mockCallReturn(
      deps,
      'AppStateController:getIsWalletResetInProgress',
      false,
    );

    await createNewVaultAndKeychain(deps, 'password');

    expect(deps.messenger.call).not.toHaveBeenCalledWith(
      'PermissionController:clearState',
    );
  });

  it('creates wallet, marks reset complete, and updates accounts', async () => {
    const deps = createMockDeps();
    mockCallReturn(
      deps,
      'AppStateController:getIsWalletResetInProgress',
      false,
    );

    await createNewVaultAndKeychain(deps, 'testpassword');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'MultichainAccountService:createWallet',
      { type: 'create', password: 'testpassword' },
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AppStateController:setIsWalletResetInProgress',
      false,
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountsController:updateAccounts',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountTreeController:reinit',
    );
  });
});

describe('createNewVaultAndRestore', () => {
  it('clears state and restores from seed phrase', async () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'OnboardingController:getState') {
        return { completedOnboarding: false };
      }
      return Promise.resolve(undefined);
    });
    const seedPhrase = new Uint8Array([1, 2, 3]);

    await createNewVaultAndRestore(deps, 'password', seedPhrase);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PermissionController:clearState',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'MultichainAccountService:createWallet',
      { type: 'restore', password: 'password', mnemonic: seedPhrase },
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'MultichainAccountService:init',
    );
  });

  it('enables token detection when onboarding is complete', async () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'OnboardingController:getState') {
        return { completedOnboarding: true };
      }
      return Promise.resolve(undefined);
    });

    await createNewVaultAndRestore(deps, 'password', new Uint8Array());

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'TokenDetectionController:enable',
    );
  });
});

describe('submitPassword', () => {
  it('submits password to keyring and updates accounts', async () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'OnboardingController:getIsSocialLoginFlow') return false;
      return Promise.resolve(undefined);
    });

    await submitPassword(deps, 'password123');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'KeyringController:submitPassword',
      'password123',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountsController:updateAccounts',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AccountTreeController:init',
    );
  });

  it('also submits to SeedlessOnboardingController for social login flow', async () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'OnboardingController:getIsSocialLoginFlow') return true;
      return Promise.resolve(undefined);
    });

    await submitPassword(deps, 'password123');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'SeedlessOnboardingController:submitPassword',
      'password123',
    );
  });
});

describe('verifyPassword', () => {
  it('delegates to KeyringController:verifyPassword', async () => {
    const deps = createMockDeps();

    await verifyPassword(deps, 'mypassword');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'KeyringController:verifyPassword',
      'mypassword',
    );
  });
});

describe('setLocked', () => {
  it('locks keyring for non-social-login flow', async () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'OnboardingController:getIsSocialLoginFlow') return false;
      if (action === 'AuthenticationController:getState')
        return { isSignedIn: false };
      return Promise.resolve(undefined);
    });

    await setLocked(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'KeyringController:setLocked',
    );
    expect(deps.messenger.call).not.toHaveBeenCalledWith(
      'SeedlessOnboardingController:setLocked',
    );
  });

  it('also locks SeedlessOnboardingController for social login flow', async () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'OnboardingController:getIsSocialLoginFlow') return true;
      if (action === 'AuthenticationController:getState')
        return { isSignedIn: false };
      return Promise.resolve(undefined);
    });

    await setLocked(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'SeedlessOnboardingController:setLocked',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'KeyringController:setLocked',
    );
  });

  it('signs out when user is signed in', async () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'OnboardingController:getIsSocialLoginFlow') return false;
      if (action === 'AuthenticationController:getState')
        return { isSignedIn: true };
      return Promise.resolve(undefined);
    });

    await setLocked(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AuthenticationController:performSignOut',
    );
  });
});

describe('exportAccount', () => {
  it('verifies password then exports private key', async () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'KeyringController:exportAccount')
        return Promise.resolve('0xprivkey');
      return Promise.resolve(undefined);
    });

    const result = await exportAccount(deps, '0xabc', 'password');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'KeyringController:verifyPassword',
      'password',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'KeyringController:exportAccount',
      'password',
      '0xabc',
    );
    expect(result).toBe('0xprivkey');
  });
});

describe('getSeedPhrase', () => {
  it('exports seed phrase and returns as number array', async () => {
    const deps = createMockDeps();
    const mnemonicBytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'KeyringController:exportSeedPhrase')
        return Promise.resolve(mnemonicBytes);
      return Promise.resolve(undefined);
    });

    const result = await getSeedPhrase(deps, 'password');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'KeyringController:exportSeedPhrase',
      'password',
      undefined,
    );
    expect(result).toStrictEqual(Array.from(mnemonicBytes));
  });
});

describe('fetchAllSecretData', () => {
  it('returns seed phrase data from SeedlessOnboardingController', async () => {
    const deps = createMockDeps();
    const secretData = [
      { data: new Uint8Array([1, 2]), type: 'mnemonic' },
      { data: new Uint8Array([3, 4]), type: 'privateKey' },
    ];
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'SeedlessOnboardingController:fetchAllSecretData')
        return Promise.resolve(secretData);
      return Promise.resolve(undefined);
    });

    const result = await fetchAllSecretData(deps, 'password');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'SeedlessOnboardingController:fetchAllSecretData',
      'password',
    );
    expect(result).toStrictEqual(secretData);
  });
});

describe('resetWallet', () => {
  it('clears all state and contacts', async () => {
    const deps = createMockDeps();

    await resetWallet(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AuthenticationController:performSignOut',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'SeedlessOnboardingController:clearState',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AddressBookController:clear',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PreferencesController:resetState',
    );
  });

  it('resets onboarding state when restoreOnly is false', async () => {
    const deps = createMockDeps();

    await resetWallet(deps, false);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'OnboardingController:resetOnboarding',
    );
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AppStateController:setIsWalletResetInProgress',
      true,
    );
  });

  it('skips onboarding reset when restoreOnly is true', async () => {
    const deps = createMockDeps();

    await resetWallet(deps, true);

    expect(deps.messenger.call).not.toHaveBeenCalledWith(
      'OnboardingController:resetOnboarding',
    );
  });
});

describe('markPasswordForgotten / unMarkPasswordForgotten', () => {
  it('sets passwordForgotten to true', () => {
    const deps = createMockDeps();
    markPasswordForgotten(deps);
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PreferencesController:setPasswordForgotten',
      true,
    );
  });

  it('sets passwordForgotten to false', () => {
    const deps = createMockDeps();
    unMarkPasswordForgotten(deps);
    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PreferencesController:setPasswordForgotten',
      false,
    );
  });
});

describe('getHDEntropyIndex', () => {
  it('returns the index of the HD keyring containing the selected account', () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'AccountsController:getSelectedAccount')
        return { address: '0xabc' };
      if (action === 'KeyringController:getState') {
        return {
          keyrings: [
            { type: 'HD Key Tree', accounts: ['0xabc'] },
            { type: 'HD Key Tree', accounts: ['0xdef'] },
          ],
        };
      }
      return undefined;
    });

    const result = getHDEntropyIndex(deps);

    expect(result).toBe(0);
  });

  it('returns undefined when no HD keyring contains the selected account', () => {
    const deps = createMockDeps();
    const mockCall = deps.messenger.call as jest.Mock;
    mockCall.mockImplementation((action: string) => {
      if (action === 'AccountsController:getSelectedAccount')
        return { address: '0xunknown' };
      if (action === 'KeyringController:getState') {
        return {
          keyrings: [{ type: 'HD Key Tree', accounts: ['0xabc'] }],
        };
      }
      return undefined;
    });

    const result = getHDEntropyIndex(deps);

    expect(result).toBeUndefined();
  });
});

describe('registerActions', () => {
  it('registers all vault-management action handlers', () => {
    const messenger = {
      call: jest.fn(),
      registerActionHandler: jest.fn(),
    } as unknown as VaultDependencies['messenger'];

    registerActions(messenger);

    const expectedActionCount = Object.keys(VAULT_MANAGEMENT_ACTIONS).length;
    expect(messenger.registerActionHandler).toHaveBeenCalledTimes(
      expectedActionCount,
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      VAULT_MANAGEMENT_ACTIONS.createNewVaultAndKeychain,
      expect.any(Function),
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      VAULT_MANAGEMENT_ACTIONS.submitPassword,
      expect.any(Function),
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      VAULT_MANAGEMENT_ACTIONS.setLocked,
      expect.any(Function),
    );
  });

  it('registered handlers delegate to the corresponding function', async () => {
    const messenger = {
      call: jest.fn().mockResolvedValue(undefined),
      registerActionHandler: jest.fn(),
    } as unknown as VaultDependencies['messenger'];

    registerActions(messenger);

    // Find the handler registered for verifyPassword
    const mockRegister =
      messenger.registerActionHandler as unknown as jest.Mock;
    const verifyPasswordEntry = mockRegister.mock.calls.find(
      ([name]: [string]) => name === VAULT_MANAGEMENT_ACTIONS.verifyPassword,
    );
    expect(verifyPasswordEntry).toBeDefined();
    const handler = verifyPasswordEntry[1] as (pw: string) => Promise<void>;

    await handler('testpw');

    expect(messenger.call).toHaveBeenCalledWith(
      'KeyringController:verifyPassword',
      'testpw',
    );
  });
});
