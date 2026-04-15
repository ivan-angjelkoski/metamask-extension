import {
  getTokenStandardAndDetails,
  getBalancesInSingleCall,
  getERC20TokenInfo,
  registerActions,
  TOKEN_RESOLUTION_ACTIONS,
  type TokenResolutionDependencies,
} from '.';

function createMockDeps(): TokenResolutionDependencies {
  return {
    messenger: {
      call: jest.fn().mockResolvedValue(undefined),
      registerActionHandler: jest.fn(),
    } as unknown as TokenResolutionDependencies['messenger'],
  };
}

describe('getTokenStandardAndDetails', () => {
  it('delegates to AssetsContractController:getTokenStandardAndDetails', async () => {
    const deps = createMockDeps();
    const details = { standard: 'ERC20', symbol: 'TEST', decimals: '18' };
    (deps.messenger.call as jest.Mock).mockResolvedValue(details);

    const result = await getTokenStandardAndDetails(
      deps,
      '0xtoken',
      '0xuser',
      undefined,
    );

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AssetsContractController:getTokenStandardAndDetails',
      '0xtoken',
      '0xuser',
      undefined,
    );
    expect(result).toStrictEqual(details);
  });

  it('passes tokenId when provided', async () => {
    const deps = createMockDeps();
    (deps.messenger.call as jest.Mock).mockResolvedValue({
      standard: 'ERC721',
    });

    await getTokenStandardAndDetails(deps, '0xnft', '0xuser', '42');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AssetsContractController:getTokenStandardAndDetails',
      '0xnft',
      '0xuser',
      '42',
    );
  });
});

describe('getBalancesInSingleCall', () => {
  it('delegates to AssetsContractController:getBalancesInSingleCall', async () => {
    const deps = createMockDeps();
    const balances = { '0xtokenA': '0x100', '0xtokenB': '0x200' };
    (deps.messenger.call as jest.Mock).mockResolvedValue(balances);

    const result = await getBalancesInSingleCall(
      deps,
      ['0xtokenA', '0xtokenB'],
      '0xuser',
    );

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AssetsContractController:getBalancesInSingleCall',
      ['0xtokenA', '0xtokenB'],
      '0xuser',
    );
    expect(result).toStrictEqual(balances);
  });
});

describe('getERC20TokenInfo', () => {
  it('delegates to AssetsContractController:getERC20TokenInfo', async () => {
    const deps = createMockDeps();
    const info = { symbol: 'TEST', decimals: 18, name: 'Test Token' };
    (deps.messenger.call as jest.Mock).mockResolvedValue(info);

    const result = await getERC20TokenInfo(deps, '0xtoken');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'AssetsContractController:getERC20TokenInfo',
      '0xtoken',
    );
    expect(result).toStrictEqual(info);
  });
});

describe('registerActions', () => {
  it('registers all token-resolution action handlers', () => {
    const messenger = {
      call: jest.fn(),
      registerActionHandler: jest.fn(),
    } as unknown as TokenResolutionDependencies['messenger'];

    registerActions(messenger);

    const expectedCount = Object.keys(TOKEN_RESOLUTION_ACTIONS).length;
    expect(messenger.registerActionHandler).toHaveBeenCalledTimes(
      expectedCount,
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      TOKEN_RESOLUTION_ACTIONS.getTokenStandardAndDetails,
      expect.any(Function),
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      TOKEN_RESOLUTION_ACTIONS.getERC20TokenInfo,
      expect.any(Function),
    );
  });
});
