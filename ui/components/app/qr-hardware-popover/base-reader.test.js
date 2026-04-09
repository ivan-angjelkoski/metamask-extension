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
import { ENVIRONMENT_TYPE_FULLSCREEN } from '../../../../shared/constants/app';
import { getEnvironmentType } from '../../../../shared/lib/environment-type';
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

jest.mock('../../../helpers/utils/webcam-utils', () => ({
  __esModule: true,
  default: {
    checkStatus: jest.fn(),
    queryCameraPermission: jest.fn(),
    requestVideoStream: jest.fn(),
    stopVideoStream: jest.fn(),
  },
}));

jest.mock('./enhanced-reader');

const mockGetEnvironmentType = jest.mocked(getEnvironmentType);
const mockGetChromiumExtensionCameraSiteSettingsUrl = jest.mocked(
  getChromiumExtensionCameraSiteSettingsUrl,
);
const mockIsFirefoxBrowser = jest.mocked(isFirefoxBrowser);
const mockGetMozExtensionOriginForDisplay = jest.mocked(
  getMozExtensionOriginForDisplay,
);

const mockStream = {
  getTracks: () => [{ stop: jest.fn() }],
};

function setupWebcamUtilsSuccess() {
  WebcamUtils.checkStatus.mockResolvedValue({
    permissions: true,
    environmentReady: true,
  });
  WebcamUtils.queryCameraPermission.mockResolvedValue({
    state: 'prompt',
    permissionStatus: null,
  });
  WebcamUtils.requestVideoStream.mockResolvedValue(mockStream);
  WebcamUtils.stopVideoStream.mockImplementation(() => undefined);
}

describe('Base Reader', () => {
  const mockBaseReaderData = {
    isReadingWallet: true,
    handleCancel: jest.fn(),
    handleSuccess: jest.fn(),
    setErrorTitle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEnvironmentType.mockReturnValue(ENVIRONMENT_TYPE_FULLSCREEN);
    global.platform = {
      openTab: jest.fn(),
      openExtensionInBrowser: jest.fn(),
    };
    WebcamUtils.checkStatus.mockReset();
    WebcamUtils.queryCameraPermission.mockReset();
    WebcamUtils.requestVideoStream.mockReset();
    WebcamUtils.stopVideoStream.mockReset();
    mockGetChromiumExtensionCameraSiteSettingsUrl.mockReturnValue(
      'chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2Fmock%2F',
    );
    mockIsFirefoxBrowser.mockReturnValue(false);
    mockGetMozExtensionOriginForDisplay.mockReturnValue(
      'moz-extension://ab5f75ae…d4aa03',
    );
  });

  it('renders progress bar when scan completes in ready state', async () => {
    setupWebcamUtilsSuccess();
    EnhancedReader.mockImplementation(({ handleScan }) => {
      handleScan(
        'UR:CRYPTO-HDKEY/24-2/LPCSCSAOCSNYCYNLAMSKJPHDGTEHOEADCSFNAOAEAMTAADDYOTADLNCSDWYKCSFNYKAEYKAOCYJKSKTNBKAXAXATTAADDYOEADLRAEWKLAWKAXAEAYCYTEDMFEAYASISGRIHKKJKJYJLJTIHBKJOHSIAIAJLKPJTJYDMJKJYHSJTIEHSJPIEHTSTGSAO',
      );
      return null;
    });
    renderWithProvider(<BaseReader {...mockBaseReaderData} />);
    expect(
      await screen.findByTestId('qr-reader-progress-bar'),
    ).toBeInTheDocument();
  });

  it('does not render progress bar when camera access needed is shown (Chromium)', async () => {
    mockIsFirefoxBrowser.mockReturnValue(false);
    EnhancedReader.mockImplementation(() => null);
    WebcamUtils.checkStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    WebcamUtils.queryCameraPermission.mockResolvedValue({
      state: 'prompt',
      permissionStatus: { state: 'prompt', addEventListener: jest.fn() },
    });
    const err = new Error('denied');
    err.name = 'NotAllowedError';
    WebcamUtils.requestVideoStream.mockRejectedValueOnce(err);

    renderWithProvider(<BaseReader {...mockBaseReaderData} />);

    expect(
      await screen.findByTestId('qr-camera-access-needed'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('qr-reader-progress-bar')).toBeNull();
  });

  it('shows Firefox blocked instructions when permission stays prompt after NotAllowedError', async () => {
    mockIsFirefoxBrowser.mockReturnValue(true);
    EnhancedReader.mockImplementation(() => null);
    WebcamUtils.checkStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    WebcamUtils.queryCameraPermission.mockResolvedValue({
      state: 'prompt',
      permissionStatus: { state: 'prompt', addEventListener: jest.fn() },
    });
    const err = new Error('denied');
    err.name = 'NotAllowedError';
    WebcamUtils.requestVideoStream.mockRejectedValueOnce(err);

    renderWithProvider(<BaseReader {...mockBaseReaderData} />);

    expect(
      await screen.findByTestId('qr-camera-access-blocked'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('qr-camera-firefox-instructions'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('qr-camera-access-needed')).toBeNull();
  });

  it('shows camera access blocked when permission is denied', async () => {
    EnhancedReader.mockImplementation(() => null);
    WebcamUtils.checkStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    const permissionStatus = {
      state: 'denied',
      addEventListener: jest.fn(),
    };
    WebcamUtils.queryCameraPermission.mockResolvedValue({
      state: 'denied',
      permissionStatus,
    });

    renderWithProvider(<BaseReader {...mockBaseReaderData} />);

    expect(
      await screen.findByTestId('qr-camera-access-blocked'),
    ).toBeInTheDocument();
    expect(WebcamUtils.requestVideoStream).not.toHaveBeenCalled();
  });

  it('opens Chromium camera settings when Open settings is clicked', async () => {
    EnhancedReader.mockImplementation(() => null);
    WebcamUtils.checkStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    WebcamUtils.queryCameraPermission.mockResolvedValue({
      state: 'denied',
      permissionStatus: { state: 'denied', addEventListener: jest.fn() },
    });

    renderWithProvider(<BaseReader {...mockBaseReaderData} />);
    await screen.findByTestId('qr-camera-access-blocked');

    await userEvent.click(screen.getByTestId('qr-camera-open-settings'));

    expect(global.platform.openTab).toHaveBeenCalledWith({
      url: 'chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2Fmock%2F',
    });
  });

  it('shows Firefox instructions when blocked in Firefox', async () => {
    EnhancedReader.mockImplementation(() => null);
    WebcamUtils.checkStatus.mockResolvedValue({
      permissions: false,
      environmentReady: true,
    });
    mockIsFirefoxBrowser.mockReturnValue(true);
    WebcamUtils.queryCameraPermission.mockResolvedValue({
      state: 'denied',
      permissionStatus: { state: 'denied', addEventListener: jest.fn() },
    });

    renderWithProvider(<BaseReader {...mockBaseReaderData} />);

    expect(
      await screen.findByTestId('qr-camera-firefox-instructions'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('qr-camera-open-settings')).toBeNull();
  });

  it('renders scan instructions when ready', async () => {
    EnhancedReader.mockImplementation(() => null);
    setupWebcamUtilsSuccess();

    renderWithProvider(<BaseReader {...mockBaseReaderData} />);

    await waitFor(() => {
      expect(
        screen.getByText(messages.QRHardwareScanInstructions.message),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('qr-reader-progress-bar')).toBeNull();
  });
});
