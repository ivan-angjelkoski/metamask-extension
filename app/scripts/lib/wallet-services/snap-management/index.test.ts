import {
  getSnapKeyring,
  getSnapPreferences,
  handleSnapRequest,
  getSnapState,
  updateSnapState,
  handleWatchAssetRequest,
  registerActions,
  SNAP_MANAGEMENT_ACTIONS,
  type SnapManagementDependencies,
} from '.';

function createMockDeps(): SnapManagementDependencies {
  return {
    messenger: {
      call: jest.fn().mockResolvedValue(undefined),
      registerActionHandler: jest.fn(),
    } as unknown as SnapManagementDependencies['messenger'],
  };
}

describe('getSnapKeyring', () => {
  it('calls SnapController:getKeyringForType with Snap Account type', async () => {
    const deps = createMockDeps();
    const mockKeyring = { type: 'Snap Account' };
    (deps.messenger.call as jest.Mock).mockResolvedValue(mockKeyring);

    const result = await getSnapKeyring(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'SnapController:getKeyringForType',
      'Snap Account',
    );
    expect(result).toBe(mockKeyring);
  });
});

describe('getSnapPreferences', () => {
  it('extracts locale, currency, and useTokenDetection from PreferencesController', () => {
    const deps = createMockDeps();
    (deps.messenger.call as jest.Mock).mockReturnValue({
      currentLocale: 'en',
      currentCurrency: 'usd',
      useTokenDetection: true,
    });

    const result = getSnapPreferences(deps);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'PreferencesController:getState',
    );
    expect(result).toStrictEqual({
      locale: 'en',
      currency: 'usd',
      useTokenDetection: true,
    });
  });
});

describe('handleSnapRequest', () => {
  it('delegates to SnapController:handleRequest', async () => {
    const deps = createMockDeps();
    const mockResult = { response: 'ok' };
    (deps.messenger.call as jest.Mock).mockResolvedValue(mockResult);
    const args = {
      snapId: 'npm:@metamask/test-snap',
      origin: 'metamask',
      handler: 'onRpcRequest',
      request: { method: 'testMethod', params: {} },
    };

    const result = await handleSnapRequest(deps, args);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'SnapController:handleRequest',
      args,
    );
    expect(result).toBe(mockResult);
  });
});

describe('getSnapState', () => {
  it('delegates to SnapController:getSnapState', async () => {
    const deps = createMockDeps();
    const state = { counter: 1 };
    (deps.messenger.call as jest.Mock).mockResolvedValue(state);

    const result = await getSnapState(deps, 'npm:@test/snap', true);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'SnapController:getSnapState',
      'npm:@test/snap',
      true,
    );
    expect(result).toBe(state);
  });
});

describe('updateSnapState', () => {
  it('delegates to SnapController:updateSnapState', async () => {
    const deps = createMockDeps();
    const newState = { counter: 2 };

    await updateSnapState(deps, 'npm:@test/snap', newState, false);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'SnapController:updateSnapState',
      'npm:@test/snap',
      newState,
      false,
    );
  });
});

describe('handleWatchAssetRequest', () => {
  it('routes ERC20 assets to TokensController:watchAsset', async () => {
    const deps = createMockDeps();

    await handleWatchAssetRequest(deps, {
      asset: { address: '0xtoken' },
      type: 'ERC20',
      origin: 'example.com',
    });

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'TokensController:watchAsset',
      expect.objectContaining({ type: 'ERC20' }),
    );
  });

  it('routes ERC721 assets to NftController:watchNft', async () => {
    const deps = createMockDeps();

    await handleWatchAssetRequest(deps, {
      asset: { address: '0xnft', tokenId: '1' },
      type: 'ERC721',
      origin: 'example.com',
    });

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'NftController:watchNft',
      { address: '0xnft', tokenId: '1' },
      'ERC721',
      'example.com',
      undefined,
    );
  });

  it('throws for unsupported asset types', async () => {
    const deps = createMockDeps();

    await expect(
      handleWatchAssetRequest(deps, {
        asset: {},
        type: 'ERC777',
        origin: 'example.com',
      }),
    ).rejects.toThrow('Asset type ERC777 not supported');
  });
});

describe('registerActions', () => {
  it('registers all snap-management action handlers', () => {
    const messenger = {
      call: jest.fn(),
      registerActionHandler: jest.fn(),
    } as unknown as SnapManagementDependencies['messenger'];

    registerActions(messenger);

    const expectedCount = Object.keys(SNAP_MANAGEMENT_ACTIONS).length;
    expect(messenger.registerActionHandler).toHaveBeenCalledTimes(
      expectedCount,
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      SNAP_MANAGEMENT_ACTIONS.handleWatchAssetRequest,
      expect.any(Function),
    );
  });
});
