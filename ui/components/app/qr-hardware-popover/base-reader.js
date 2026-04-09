import React, { useEffect, useRef, useState, useCallback } from 'react';
import log from 'loglevel';
import { URDecoder } from '@ngraveio/bc-ur';
import PropTypes from 'prop-types';
import { ENVIRONMENT_TYPE_FULLSCREEN } from '../../../../shared/constants/app';
import { getEnvironmentType } from '../../../../shared/lib/environment-type';
import {
  getChromiumExtensionCameraSiteSettingsUrl,
  getMozExtensionOriginForDisplay,
  isFirefoxBrowser,
} from '../../../../shared/lib/browser-runtime.utils';
import WebcamUtils from '../../../helpers/utils/webcam-utils';
import PageContainerFooter from '../../ui/page-container/page-container-footer/page-container-footer.component';
import { useI18nContext } from '../../../hooks/useI18nContext';
import {
  CameraAccessErrorContent,
  CameraAccessErrorContentVariant,
} from '../camera-access-error-content';
import EnhancedReader from './enhanced-reader';

const READY_STATE = {
  ACCESSING_CAMERA: 'ACCESSING_CAMERA',
  /** User dismissed the permission prompt; permission can be requested again */
  CAMERA_ACCESS_NEEDED: 'CAMERA_ACCESS_NEEDED',
  /** Persistent block — user must change browser settings */
  CAMERA_ACCESS_BLOCKED: 'CAMERA_ACCESS_BLOCKED',
  READY: 'READY',
};

const BaseReader = ({
  isReadingWallet,
  handleCancel,
  handleSuccess,
  setErrorTitle,
}) => {
  const t = useI18nContext();
  const [ready, setReady] = useState(READY_STATE.ACCESSING_CAMERA);
  const [error, setError] = useState(null);
  const [urDecoder, setURDecoder] = useState(new URDecoder());
  const [progress, setProgress] = useState(0);
  const [permissionActionLoading, setPermissionActionLoading] = useState(false);

  const mounted = useRef(false);
  const permissionStatusRef = useRef(null);
  const permissionChangeHandlerRef = useRef(null);

  const cleanupPermissionListener = useCallback(() => {
    const status = permissionStatusRef.current;
    const handler = permissionChangeHandlerRef.current;
    if (status && handler) {
      if (typeof status.removeEventListener === 'function') {
        status.removeEventListener('change', handler);
      } else {
        status.onchange = null;
      }
    }
    permissionStatusRef.current = null;
    permissionChangeHandlerRef.current = null;
  }, []);

  const tryAcquireCameraAndEnterReady = useCallback(async () => {
    try {
      const stream = await WebcamUtils.requestVideoStream();
      WebcamUtils.stopVideoStream(stream);
      if (mounted.current) {
        cleanupPermissionListener();
        setReady(READY_STATE.READY);
      }
    } catch (e) {
      log.info('QR camera: could not acquire stream after permission grant', e);
    }
  }, [cleanupPermissionListener]);

  const attachPermissionGrantedListener = useCallback(
    (permissionStatus) => {
      cleanupPermissionListener();
      if (!permissionStatus) {
        return;
      }
      permissionStatusRef.current = permissionStatus;
      const handler = () => {
        if (permissionStatus.state === 'granted') {
          tryAcquireCameraAndEnterReady();
        }
      };
      permissionChangeHandlerRef.current = handler;
      if (typeof permissionStatus.addEventListener === 'function') {
        permissionStatus.addEventListener('change', handler);
      } else {
        permissionStatus.onchange = handler;
      }
    },
    [cleanupPermissionListener, tryAcquireCameraAndEnterReady],
  );

  /**
   * After getUserMedia throws NotAllowedError, re-query permission and subscribe for grant.
   *
   * @returns {Promise<'denied' | 'prompt' | 'granted'>}
   */
  const reconcileNotAllowedPermission = useCallback(async () => {
    const { state, permissionStatus } =
      await WebcamUtils.queryCameraPermission();
    attachPermissionGrantedListener(permissionStatus);
    return state;
  }, [attachPermissionGrantedListener]);

  const reset = () => {
    cleanupPermissionListener();
    setReady(READY_STATE.ACCESSING_CAMERA);
    setError(null);
    setURDecoder(new URDecoder());
    setProgress(0);
    setPermissionActionLoading(false);
  };

  const startCameraPermissionFlow = useCallback(async () => {
    const { state, permissionStatus } =
      await WebcamUtils.queryCameraPermission();

    if (state === 'denied') {
      attachPermissionGrantedListener(permissionStatus);
      if (mounted.current) {
        setReady(READY_STATE.CAMERA_ACCESS_BLOCKED);
      }
      return;
    }

    try {
      const stream = await WebcamUtils.requestVideoStream();
      WebcamUtils.stopVideoStream(stream);
      if (mounted.current) {
        cleanupPermissionListener();
        setReady(READY_STATE.READY);
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        const nextState = await reconcileNotAllowedPermission();
        if (mounted.current) {
          const useBlockedUi = nextState === 'denied' || isFirefoxBrowser();
          setReady(
            useBlockedUi
              ? READY_STATE.CAMERA_ACCESS_BLOCKED
              : READY_STATE.CAMERA_ACCESS_NEEDED,
          );
        }
      } else if (mounted.current) {
        setError(e);
      }
    }
  }, [cleanupPermissionListener, reconcileNotAllowedPermission]);

  const checkEnvironment = useCallback(async () => {
    try {
      const { environmentReady } = await WebcamUtils.checkStatus();
      if (
        !environmentReady &&
        getEnvironmentType() !== ENVIRONMENT_TYPE_FULLSCREEN
      ) {
        const currentUrl = new URL(window.location.href);
        const currentHash = currentUrl.hash;
        const currentRoute = currentHash ? currentHash.substring(1) : null;
        global.platform.openExtensionInBrowser(currentRoute);
        return;
      }
    } catch (e) {
      if (mounted.current) {
        setError(e);
      }
      return;
    }
    await startCameraPermissionFlow();
  }, [startCameraPermissionFlow]);

  const handleCameraAccessNeededContinue = useCallback(async () => {
    setPermissionActionLoading(true);
    try {
      const stream = await WebcamUtils.requestVideoStream();
      WebcamUtils.stopVideoStream(stream);
      if (mounted.current) {
        cleanupPermissionListener();
        setReady(READY_STATE.READY);
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        const nextState = await reconcileNotAllowedPermission();
        if (mounted.current && (nextState === 'denied' || isFirefoxBrowser())) {
          setReady(READY_STATE.CAMERA_ACCESS_BLOCKED);
        }
      } else if (mounted.current) {
        setError(e);
      }
    } finally {
      if (mounted.current) {
        setPermissionActionLoading(false);
      }
    }
  }, [cleanupPermissionListener, reconcileNotAllowedPermission]);

  const handleCameraAccessBlockedContinue = useCallback(async () => {
    setPermissionActionLoading(true);
    try {
      const { state } = await WebcamUtils.queryCameraPermission();
      if (state === 'denied') {
        return;
      }
      const stream = await WebcamUtils.requestVideoStream();
      WebcamUtils.stopVideoStream(stream);
      if (mounted.current) {
        cleanupPermissionListener();
        setReady(READY_STATE.READY);
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        await reconcileNotAllowedPermission();
      } else if (mounted.current) {
        setError(e);
      }
    } finally {
      if (mounted.current) {
        setPermissionActionLoading(false);
      }
    }
  }, [cleanupPermissionListener, reconcileNotAllowedPermission]);

  const handleOpenChromiumCameraSettings = useCallback(() => {
    global.platform.openTab({
      url: getChromiumExtensionCameraSiteSettingsUrl(),
    });
  }, []);

  const handleScan = useCallback(
    (data) => {
      try {
        if (!data || urDecoder.isComplete()) {
          return;
        }
        urDecoder.receivePart(data);
        setProgress(urDecoder.estimatedPercentComplete());
        if (urDecoder.isComplete()) {
          const result = urDecoder.resultUR();
          handleSuccess(result).catch(setError);
        }
      } catch (e) {
        if (isReadingWallet) {
          setErrorTitle(t('QRHardwareUnknownQRCodeTitle'));
        } else {
          setErrorTitle(t('QRHardwareInvalidTransactionTitle'));
        }
        setError(new Error(t('unknownQrCode')));
      }
    },
    [handleSuccess, isReadingWallet, setErrorTitle, t, urDecoder],
  );

  useEffect(() => {
    mounted.current = true;
    checkEnvironment();
    return () => {
      mounted.current = false;
      cleanupPermissionListener();
    };
  }, [checkEnvironment, cleanupPermissionListener]);

  const tryAgain = () => {
    reset();
    checkEnvironment();
  };

  const renderError = () => {
    let title, msg;
    if (error.type === 'NO_WEBCAM_FOUND') {
      title = t('noWebcamFoundTitle');
      msg = t('noWebcamFound');
    } else if (error.message === t('unknownQrCode')) {
      if (isReadingWallet) {
        msg = t('QRHardwareUnknownWalletQRCode');
      } else {
        msg = t('unknownQrCode');
      }
    } else if (error.message === t('QRHardwareMismatchedSignId')) {
      msg = t('QRHardwareMismatchedSignId');
    } else {
      title = t('generalCameraErrorTitle');
      msg = t('generalCameraError');
    }

    return (
      <>
        <div className="qr-scanner__image">
          <img src="images/webcam.svg" width="70" height="70" alt="" />
        </div>
        {title ? <div className="qr-scanner__title">{title}</div> : null}
        <div className="qr-scanner__error" data-testid="qr-scanner__error">
          {msg}
        </div>
        <PageContainerFooter
          onCancel={() => {
            setErrorTitle('');
            handleCancel();
          }}
          onSubmit={() => {
            setErrorTitle('');
            tryAgain();
          }}
          cancelText={t('cancel')}
          submitText={t('tryAgain')}
          submitButtonType="confirm"
        />
      </>
    );
  };

  const renderVideo = () => {
    if (ready === READY_STATE.CAMERA_ACCESS_NEEDED) {
      return (
        <CameraAccessErrorContent
          variant={CameraAccessErrorContentVariant.Needed}
          onContinue={handleCameraAccessNeededContinue}
          continueLoading={permissionActionLoading}
        />
      );
    }
    if (ready === READY_STATE.CAMERA_ACCESS_BLOCKED) {
      return (
        <CameraAccessErrorContent
          variant={CameraAccessErrorContentVariant.Blocked}
          isFirefox={isFirefoxBrowser()}
          mozExtensionDisplay={getMozExtensionOriginForDisplay()}
          onOpenSettings={handleOpenChromiumCameraSettings}
          onContinue={handleCameraAccessBlockedContinue}
          continueLoading={permissionActionLoading}
        />
      );
    }

    let message;
    if (ready === READY_STATE.ACCESSING_CAMERA) {
      message = t('accessingYourCamera');
    } else if (ready === READY_STATE.READY) {
      message = t('QRHardwareScanInstructions');
    }
    return (
      <>
        <div className="qr-scanner__content">
          {ready === READY_STATE.READY ? (
            <EnhancedReader handleScan={handleScan} />
          ) : null}
        </div>
        {progress > 0 && (
          <div
            className="qr-scanner__progress"
            data-testid="qr-reader-progress-bar"
            style={{ '--progress': `${Math.floor(progress * 100)}%` }}
          ></div>
        )}
        {message && <div className="qr-scanner__status">{message}</div>}
      </>
    );
  };

  return (
    <div className="qr-scanner">{error ? renderError() : renderVideo()}</div>
  );
};

BaseReader.propTypes = {
  isReadingWallet: PropTypes.bool.isRequired,
  handleCancel: PropTypes.func.isRequired,
  handleSuccess: PropTypes.func.isRequired,
  setErrorTitle: PropTypes.func.isRequired,
};

export default BaseReader;
