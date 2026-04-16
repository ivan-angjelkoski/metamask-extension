import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { renderWithProvider } from '../../../../test/lib/render-helpers-navigate';
import WebcamUtils from '../../../helpers/utils/webcam-utils';
import {
  getChromiumExtensionCameraSiteSettingsUrl,
  getMozExtensionOriginForDisplay,
  isFirefoxBrowser,
} from '../../../../shared/lib/browser-runtime.utils';
import { enLocale as messages } from '../../../../test/lib/i18n-helpers';
import {
  ENVIRONMENT_TYPE_FULLSCREEN,
  ENVIRONMENT_TYPE_POPUP,
} from '../../../../shared/constants/app';
import { getEnvironmentType } from '../../../../shared/lib/environment-type';
import type { BaseReaderProps } from './base-reader.types';
import BaseReader from './base-reader';
import EnhancedReader from './enhanced-reader';

jest.mock('../../../../shared/lib/environment-type', () => ({
  getEnvironmentType: jest.fn(),
}));

jest.mock('../../../../shared/lib/browser-runtime.utils', () => ({
  ...jest.requireActual('../../../../shared/lib/browser-runtime.utils'),
  getChromiumExtensionCameraSiteSettingsUrl: jest.fn(
    () =>
      'chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2Fmock%2F',
  ),
  isFirefoxBrowser: jest.fn(() => false),
  getMozExtensionOriginForDisplay: jest.fn(
    () => 'moz-extension://ab5f75ae…d4aa03',
  ),
}));

jest.mock('../../../helpers/utils/webcam-utils');

jest.mock('./enhanced-reader');

const mockGetEnvironmentType = jest.mocked(getEnvironmentType);
const mockGetChromiumExtensionCameraSiteSettingsUrl = jest.mocked(
  getChromiumExtensionCameraSiteSettingsUrl,
);
const mockIsFirefoxBrowser = jest.mocked(isFirefoxBrowser);
const mockGetMozExtensionOriginForDisplay = jest.mocked(
  getMozExtensionOriginForDisplay,
);
const mockEnhancedReader = jest.mocked(EnhancedReader);

const mockCheckStatus = jest.mocked(WebcamUtils.checkStatus);
const mockQueryCameraPermission = jest.mocked(
  WebcamUtils.queryCameraPermission,
);
const mockRequestVideoStream = jest.mocked(WebcamUtils.requestVideoStream);
const mockStopVideoStream = jest.mocked(WebcamUtils.stopVideoStream);

const mockStream = {
  getTracks: () => [{ stop: jest.fn() }],
};

/**
 * Sets up `WebcamUtils` mocks for the happy path: fullscreen, prompt permission, stream OK.
 */
function setupWebcamUtilsSuccess() {
  mockCheckStatus.mockResolvedValue({
    permissions: true,
    environmentReady: true,
  });
  mockQueryCameraPermission.mockResolvedValue({
    state: 'prompt',
    permissionStatus: null,
  });
  mockRequestVideoStream.mockResolvedValue(
    mockStream as unknown as MediaStream,
  );
  mockStopVideoStream.mockImplementation(() => undefined);
}

describe('BaseReader', () => {
  const defaultProps: BaseReaderProps = {
    isReadingWallet: true,
    handleCancel: jest.fn(),
    handleSuccess: jest.fn(),
    setErrorTitle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEnvironmentType.mockReturnValue(ENVIRONMENT_TYPE_FULLSCREEN);
    // @ts-expect-error mocking platform
    global.platform = {
      openTab: jest.fn(),
      openExtensionInBrowser: jest.fn(),
    };
    mockGetChromiumExtensionCameraSiteSettingsUrl.mockReturnValue(
      'chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2Fmock%2F',
    );
    mockIsFirefoxBrowser.mockReturnValue(false);
    mockGetMozExtensionOriginForDisplay.mockReturnValue(
      'moz-extension://ab5f75ae…d4aa03',
    );
  });

  // ---- Happy-path scanning ------------------------------------------------

  it('renders scan instructions when camera is ready', async () => {
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    setupWebcamUtilsSuccess();

    renderWithProvider(<BaseReader {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText(messages.QRHardwareScanInstructions.message),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('qr-reader-progress-bar')).toBeNull();
  });

  it('renders progress bar when scan produces partial data', async () => {
    setupWebcamUtilsSuccess();
    mockEnhancedReader.mockImplementation((({
      handleScan,
    }: {
      handleScan: (data: string) => void;
    }) => {
      handleScan(
        'UR:CRYPTO-HDKEY/24-2/LPCSCSAOCSNYCYNLAMSKJPHDGTEHOEADCSFNAOAEAMTAADDYOTADLNCSDWYKCSFNYKAEYKAOCYJKSKTNBKAXAXATTAADDYOEADLRAEWKLAWKAXAEAYCYTEDMFEAYASISGRIHKKJKJYJLJTIHBKJOHSIAIAJLKPJTJYDMJKJYHSJTIEHSJPIEHTSTGSAO',
      );
      return null;
    }) as unknown as typeof EnhancedReader);
    renderWithProvider(<BaseReader {...defaultProps} />);

    expect(
      await screen.findByTestId('qr-reader-progress-bar'),
    ).toBeInTheDocument();
  });

  // ---- Environment check --------------------------------------------------

  it('redirects to fullscreen when environment is not ready in popup', async () => {
    mockGetEnvironmentType.mockReturnValue(ENVIRONMENT_TYPE_POPUP);
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    mockCheckStatus.mockResolvedValue({
      permissions: false,
      environmentReady: false,
    });

    renderWithProvider(<BaseReader {...defaultProps} />);

    await waitFor(() => {
      expect(global.platform.openExtensionInBrowser).toHaveBeenCalled();
    });
    expect(mockQueryCameraPermission).not.toHaveBeenCalled();
  });

  // ---- Permission: already granted (fast path) ---------------------------

  it('skips requestVideoStream when permission is already granted', async () => {
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    mockCheckStatus.mockResolvedValue({
      permissions: true,
      environmentReady: true,
    });
    mockQueryCameraPermission.mockResolvedValue({
      state: 'granted',
      permissionStatus: null,
    });

    renderWithProvider(<BaseReader {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText(messages.QRHardwareScanInstructions.message),
      ).toBeInTheDocument();
    });
    expect(mockRequestVideoStream).not.toHaveBeenCalled();
  });

  // ---- Permission: prompt-dismissed (needed) on Chromium ------------------

  it('shows camera-access-needed when Chromium user dismisses the prompt', async () => {
    mockIsFirefoxBrowser.mockReturnValue(false);
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    mockCheckStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    mockQueryCameraPermission.mockResolvedValue({
      state: 'prompt',
      permissionStatus: {
        state: 'prompt',
        addEventListener: jest.fn(),
      } as unknown as PermissionStatus,
    });
    const notAllowed = new Error('denied');
    notAllowed.name = 'NotAllowedError';
    mockRequestVideoStream.mockRejectedValueOnce(notAllowed);

    renderWithProvider(<BaseReader {...defaultProps} />);

    expect(
      await screen.findByTestId('qr-camera-access-needed'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('qr-reader-progress-bar')).toBeNull();
  });

  // ---- Permission: blocked -----------------------------------------------

  it('shows camera-access-blocked when permission is denied', async () => {
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    mockCheckStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    mockQueryCameraPermission.mockResolvedValue({
      state: 'denied',
      permissionStatus: {
        state: 'denied',
        addEventListener: jest.fn(),
      } as unknown as PermissionStatus,
    });

    renderWithProvider(<BaseReader {...defaultProps} />);

    expect(
      await screen.findByTestId('qr-camera-access-blocked'),
    ).toBeInTheDocument();
    expect(mockRequestVideoStream).not.toHaveBeenCalled();
  });

  it('does not poll when permission is denied', async () => {
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    mockCheckStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    mockQueryCameraPermission.mockResolvedValue({
      state: 'denied',
      permissionStatus: {
        state: 'denied',
        addEventListener: jest.fn(),
      } as unknown as PermissionStatus,
    });

    renderWithProvider(<BaseReader {...defaultProps} />);

    await screen.findByTestId('qr-camera-access-blocked');
    expect(mockRequestVideoStream).not.toHaveBeenCalled();
    expect(mockQueryCameraPermission).toHaveBeenCalledTimes(1);
  });

  // ---- Chromium "Open settings" button ------------------------------------

  it('opens Chromium camera settings when Open settings is clicked', async () => {
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    mockCheckStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    mockQueryCameraPermission.mockResolvedValue({
      state: 'denied',
      permissionStatus: {
        state: 'denied',
        addEventListener: jest.fn(),
      } as unknown as PermissionStatus,
    });

    renderWithProvider(<BaseReader {...defaultProps} />);
    await screen.findByTestId('qr-camera-access-blocked');

    await userEvent.click(screen.getByTestId('qr-camera-open-settings'));

    expect(global.platform.openTab).toHaveBeenCalledWith({
      url: 'chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2Fmock%2F',
    });
  });

  // ---- Firefox: always blocked for NotAllowedError (prompt stays prompt) --

  it('shows Firefox blocked instructions when permission stays prompt after NotAllowedError', async () => {
    mockIsFirefoxBrowser.mockReturnValue(true);
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    mockCheckStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    mockQueryCameraPermission.mockResolvedValue({
      state: 'prompt',
      permissionStatus: {
        state: 'prompt',
        addEventListener: jest.fn(),
      } as unknown as PermissionStatus,
    });
    const notAllowed = new Error('denied');
    notAllowed.name = 'NotAllowedError';
    mockRequestVideoStream.mockRejectedValueOnce(notAllowed);

    renderWithProvider(<BaseReader {...defaultProps} />);

    expect(
      await screen.findByTestId('qr-camera-access-blocked'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('qr-camera-firefox-instructions'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('qr-camera-access-needed')).toBeNull();
  });

  it('shows Firefox instructions when blocked in Firefox', async () => {
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    mockCheckStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    mockIsFirefoxBrowser.mockReturnValue(true);
    mockQueryCameraPermission.mockResolvedValue({
      state: 'denied',
      permissionStatus: {
        state: 'denied',
        addEventListener: jest.fn(),
      } as unknown as PermissionStatus,
    });

    renderWithProvider(<BaseReader {...defaultProps} />);

    expect(
      await screen.findByTestId('qr-camera-firefox-instructions'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('qr-camera-open-settings')).toBeNull();
  });

  // ---- Error rendering ----------------------------------------------------

  it('renders generic camera error when requestVideoStream throws non-NotAllowedError', async () => {
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    mockCheckStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    mockQueryCameraPermission.mockResolvedValue({
      state: 'prompt',
      permissionStatus: {
        state: 'prompt',
        addEventListener: jest.fn(),
      } as unknown as PermissionStatus,
    });
    const notReadable = new Error('Could not start video source');
    notReadable.name = 'NotReadableError';
    mockRequestVideoStream.mockRejectedValueOnce(notReadable);

    renderWithProvider(<BaseReader {...defaultProps} />);

    expect(
      await screen.findByText(messages.generalCameraError.message),
    ).toBeInTheDocument();
  });

  it('renders error state when WebcamUtils.checkStatus rejects with NO_WEBCAM_FOUND', async () => {
    mockEnhancedReader.mockImplementation(
      () => null as unknown as React.ReactElement,
    );
    const webcamError = new Error('No webcam found') as Error & {
      type?: string;
    };
    webcamError.type = 'NO_WEBCAM_FOUND';
    mockCheckStatus.mockRejectedValue(webcamError);

    renderWithProvider(<BaseReader {...defaultProps} />);

    expect(
      await screen.findByText(messages.noWebcamFound.message),
    ).toBeInTheDocument();
  });
});
