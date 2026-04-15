jest.mock('./vault-management', () => ({ registerActions: jest.fn() }));
jest.mock('./account-management', () => ({ registerActions: jest.fn() }));
jest.mock('./permission-management', () => ({ registerActions: jest.fn() }));
jest.mock('./transaction-lifecycle', () => ({ registerActions: jest.fn() }));
jest.mock('./token-resolution', () => ({ registerActions: jest.fn() }));
jest.mock('./snap-management', () => ({ registerActions: jest.fn() }));

import { registerActions as registerVaultActions } from './vault-management';
import { registerActions as registerAccountActions } from './account-management';
import { registerActions as registerPermissionActions } from './permission-management';
import { registerActions as registerTransactionActions } from './transaction-lifecycle';
import { registerActions as registerTokenActions } from './token-resolution';
import { registerActions as registerSnapActions } from './snap-management';
import { registerWalletServices } from './register';
import type { RootMessenger } from '../messenger';

describe('registerWalletServices', () => {
  it('delegates to all six module registerActions functions', () => {
    const messenger = {} as unknown as RootMessenger;

    registerWalletServices(messenger);

    expect(registerVaultActions).toHaveBeenCalledTimes(1);
    expect(registerAccountActions).toHaveBeenCalledTimes(1);
    expect(registerPermissionActions).toHaveBeenCalledTimes(1);
    expect(registerTransactionActions).toHaveBeenCalledTimes(1);
    expect(registerTokenActions).toHaveBeenCalledTimes(1);
    expect(registerSnapActions).toHaveBeenCalledTimes(1);
  });
});
