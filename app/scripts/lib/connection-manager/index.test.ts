import type { Runtime } from 'webextension-polyfill';
import { ConnectionManager } from '.';

function createMockMessenger() {
  return {
    call: jest.fn(),
  };
}

function createMockPort(url = 'https://example.com', tabId = 1): Runtime.Port {
  return {
    sender: { url, tab: { id: tabId } },
    onDisconnect: { addListener: jest.fn() },
    onMessage: { addListener: jest.fn() },
    postMessage: jest.fn(),
    disconnect: jest.fn(),
    name: 'metamask-contentscript',
  } as unknown as Runtime.Port;
}

describe('ConnectionManager', () => {
  describe('setupUntrustedEip1193', () => {
    it('runs a phishing check before wiring the connection', () => {
      const messenger = createMockMessenger();
      const manager = new ConnectionManager({
        messenger: messenger as never,
      });
      const port = createMockPort();

      manager.setupUntrustedEip1193(port);

      expect(messenger.call).toHaveBeenCalledWith(
        'PhishingController:maybeUpdateState',
      );
    });

    it('registers a disconnect listener on the port', () => {
      const messenger = createMockMessenger();
      const manager = new ConnectionManager({
        messenger: messenger as never,
      });
      const port = createMockPort();

      manager.setupUntrustedEip1193(port);

      expect(port.onDisconnect.addListener).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('increments connectionCount after setup', () => {
      const messenger = createMockMessenger();
      const manager = new ConnectionManager({
        messenger: messenger as never,
      });

      expect(manager.connectionCount).toBe(0);
      manager.setupUntrustedEip1193(createMockPort('https://a.com', 1));
      manager.setupUntrustedEip1193(createMockPort('https://b.com', 2));
      expect(manager.connectionCount).toBe(2);
    });
  });

  describe('connectionCount', () => {
    it('decrements after port disconnects', () => {
      const messenger = createMockMessenger();
      const manager = new ConnectionManager({
        messenger: messenger as never,
      });
      const port = createMockPort();

      manager.setupUntrustedEip1193(port);
      expect(manager.connectionCount).toBe(1);

      // Trigger the disconnect listener
      const addListener = port.onDisconnect.addListener as jest.Mock;
      const disconnectCallback = addListener.mock.calls[0][0] as () => void;
      disconnectCallback();

      expect(manager.connectionCount).toBe(0);
    });
  });

  describe('notifyConnections / notifyAllConnections', () => {
    it('notifyConnections does not throw for unknown origin', () => {
      const messenger = createMockMessenger();
      const manager = new ConnectionManager({
        messenger: messenger as never,
      });

      expect(() =>
        manager.notifyConnections('no-connections-origin', {
          method: 'accountsChanged',
        }),
      ).not.toThrow();
    });

    it('notifyAllConnections does not throw with no active connections', () => {
      const messenger = createMockMessenger();
      const manager = new ConnectionManager({
        messenger: messenger as never,
      });

      expect(() =>
        manager.notifyAllConnections({
          method: 'metamask_unlockStateChanged',
          params: { isUnlocked: true },
        }),
      ).not.toThrow();
    });
  });
});
