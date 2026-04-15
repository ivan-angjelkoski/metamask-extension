import {
  routeTransactionToSmartTransactionIfEnabled,
  createCancelTransaction,
  createSpeedUpTransaction,
  approveTransactionsWithSameNonce,
  estimateGas,
  getExternalPendingTransactions,
  updateEditableParams,
  registerActions,
  TRANSACTION_LIFECYCLE_ACTIONS,
  type TransactionLifecycleDependencies,
} from '.';

function createMockDeps(): TransactionLifecycleDependencies {
  return {
    messenger: {
      call: jest.fn().mockResolvedValue(undefined),
      registerActionHandler: jest.fn(),
    } as unknown as TransactionLifecycleDependencies['messenger'],
  };
}

describe('routeTransactionToSmartTransactionIfEnabled', () => {
  it('submits via SmartTransactionsController when STX is enabled', async () => {
    const deps = createMockDeps();

    await routeTransactionToSmartTransactionIfEnabled(deps, 'tx-1', {
      useSmartTransaction: true,
    });

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'SmartTransactionsController:submitSignedTransactions',
      'tx-1',
    );
    expect(deps.messenger.call).not.toHaveBeenCalledWith(
      'TransactionController:approveTransaction',
      'tx-1',
    );
  });

  it('approves via TransactionController when STX is disabled', async () => {
    const deps = createMockDeps();

    await routeTransactionToSmartTransactionIfEnabled(deps, 'tx-2', {
      useSmartTransaction: false,
    });

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'TransactionController:approveTransaction',
      'tx-2',
    );
    expect(deps.messenger.call).not.toHaveBeenCalledWith(
      'SmartTransactionsController:submitSignedTransactions',
      expect.anything(),
    );
  });
});

describe('createCancelTransaction', () => {
  it('delegates to TransactionController:stopTransaction', async () => {
    const deps = createMockDeps();
    const gasSettings = { maxFeePerGas: '0x1' };
    const options = { estimatedBaseFee: '0x1' };

    await createCancelTransaction(deps, 'orig-tx-id', gasSettings, options);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'TransactionController:stopTransaction',
      'orig-tx-id',
      gasSettings,
      options,
    );
  });
});

describe('createSpeedUpTransaction', () => {
  it('delegates to TransactionController:speedUpTransaction', async () => {
    const deps = createMockDeps();
    const gasSettings = { maxPriorityFeePerGas: '0x2' };
    const options = {};

    await createSpeedUpTransaction(deps, 'orig-tx-id', gasSettings, options);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'TransactionController:speedUpTransaction',
      'orig-tx-id',
      gasSettings,
      options,
    );
  });
});

describe('approveTransactionsWithSameNonce', () => {
  it('delegates to TransactionController:approveTransactionsWithSameNonce', async () => {
    const deps = createMockDeps();

    await approveTransactionsWithSameNonce(deps, ['tx-a', 'tx-b']);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'TransactionController:approveTransactionsWithSameNonce',
      ['tx-a', 'tx-b'],
    );
  });
});

describe('estimateGas', () => {
  it('delegates to NetworkController:estimateGas', async () => {
    const deps = createMockDeps();
    (deps.messenger.call as jest.Mock).mockResolvedValue('0x5208');

    const result = await estimateGas(deps, {
      to: '0xrecipient',
      value: '0x0',
    });

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'NetworkController:estimateGas',
      { to: '0xrecipient', value: '0x0' },
    );
    expect(result).toBe('0x5208');
  });
});

describe('getExternalPendingTransactions', () => {
  it('returns pending STX for the given address', () => {
    const deps = createMockDeps();
    const pending = [{ id: 'stx-1' }, { id: 'stx-2' }];
    (deps.messenger.call as jest.Mock).mockReturnValue(pending);

    const result = getExternalPendingTransactions(deps, '0xuser');

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'SmartTransactionsController:getTransactions',
      { addressFrom: '0xuser', status: 'pending' },
    );
    expect(result).toBe(pending);
  });
});

describe('updateEditableParams', () => {
  it('delegates to TransactionController:updateEditableParams', async () => {
    const deps = createMockDeps();
    const params = { gasLimit: '0x5208' };

    await updateEditableParams(deps, 'tx-id', params);

    expect(deps.messenger.call).toHaveBeenCalledWith(
      'TransactionController:updateEditableParams',
      'tx-id',
      params,
    );
  });
});

describe('registerActions', () => {
  it('registers all transaction-lifecycle action handlers', () => {
    const messenger = {
      call: jest.fn(),
      registerActionHandler: jest.fn(),
    } as unknown as TransactionLifecycleDependencies['messenger'];

    registerActions(messenger);

    const expectedCount = Object.keys(TRANSACTION_LIFECYCLE_ACTIONS).length;
    expect(messenger.registerActionHandler).toHaveBeenCalledTimes(
      expectedCount,
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      TRANSACTION_LIFECYCLE_ACTIONS.routeTransactionToSmartTransactionIfEnabled,
      expect.any(Function),
    );
    expect(messenger.registerActionHandler).toHaveBeenCalledWith(
      TRANSACTION_LIFECYCLE_ACTIONS.estimateGas,
      expect.any(Function),
    );
  });
});
