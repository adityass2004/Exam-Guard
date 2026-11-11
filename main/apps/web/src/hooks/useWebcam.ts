'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'requesting' | 'ready' | 'error';

export interface CameraProblem {
  name: string;
  message: string;
  userInstruction: string;
}

export function mapCameraError(err: unknown): CameraProblem {
  const errorName = err instanceof Error ? err.name : 'UnknownError';
  const errorMessage = err instanceof Error ? err.message : String(err);

  switch (errorName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return {
        name: 'PERMISSION_DENIED',
        message: errorMessage,
        userInstruction:
          'Camera access was denied. Please click the camera icon in your browser address bar, choose "Always allow", and click Retry.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        name: 'NO_DEVICE_FOUND',
        message: errorMessage,
        userInstruction:
          'No camera was found on your system. Please connect an external webcam or enable your built-in camera.',
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        name: 'DEVICE_IN_USE',
        message: errorMessage,
        userInstruction:
          'The webcam is in use by another application or was not released cleanly. Please close any other app using the camera and click Retry.',
      };
    case 'OverconstrainedError':
      return {
        name: 'CONSTRAINTS_NOT_SATISFIED',
        message: errorMessage,
        userInstruction:
          'Your webcam does not support the requested video resolution. We will attempt a fallback configuration.',
      };
    default:
      return {
        name: 'CAMERA_ERROR',
        message: errorMessage,
        userInstruction: 'Could not initialize camera feed. Please check webcam connections and permissions, then click Retry.',
      };
  }
}

export interface CaptureFrameOptions {
  maxEdge?: number;
  quality?: number;
}

export interface StartCameraOptions {
  force?: boolean;
}

export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef<CameraStatus>('idle');
  const isStartingRef = useRef<boolean>(false);

  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<CameraProblem | null>(null);

  // Update status ref whenever state changes
  const updateStatus = useCallback((newStatus: CameraStatus) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  }, []);

  const stop = useCallback(() => {
    isStartingRef.current = false;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    statusRef.current = 'idle';
    setStatus('idle');
    setError(null);
  }, []);

  const start = useCallback(async (options: StartCameraOptions = {}) => {
    const { force = false } = options;

    // Check if stream is already live and active
    const currentStream = streamRef.current;
    const videoTrack = currentStream?.getVideoTracks()[0];
    const isLive = Boolean(currentStream?.active && videoTrack && videoTrack.readyState === 'live');

    if (!force && isLive && statusRef.current === 'ready') {
      // Stream is already healthy, ensure video element is attached
      if (videoRef.current && videoRef.current.srcObject !== currentStream) {
        videoRef.current.srcObject = currentStream;
        videoRef.current.play().catch(() => {});
      }
      return;
    }

    if (isStartingRef.current) {
      return;
    }

    isStartingRef.current = true;
    updateStatus('requesting');
    setError(null);

    // Stop any stale tracks first to prevent DEVICE_IN_USE conflicts
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const problem = {
        name: 'MEDIA_DEVICES_NOT_SUPPORTED',
        message: 'navigator.mediaDevices.getUserMedia is not supported in this browser environment',
        userInstruction: 'Please use a modern Chromium-based browser (Chrome, Edge) to access camera features.',
      };
      setError(problem);
      updateStatus('error');
      isStartingRef.current = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      // If stopped while awaiting getUserMedia
      if (!isStartingRef.current) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      streamRef.current = stream;

      // Attach to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Track lifecycle listeners
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          // Only flag error if stream was not intentionally stopped
          if (statusRef.current === 'ready') {
            updateStatus('error');
            setError({
              name: 'TRACK_ENDED',
              message: 'Camera video track was disconnected',
              userInstruction: 'Camera connection was interrupted. Click "Retry Connection" to re-enable camera.',
            });
          }
        };
      }

      updateStatus('ready');
      setError(null);
    } catch (err: unknown) {
      const problem = mapCameraError(err);
      setError(problem);
      updateStatus('error');
    } finally {
      isStartingRef.current = false;
    }
  }, [updateStatus]);

  // Capture current video frame as JPEG blob
  const captureFrame = useCallback(
    async (options: CaptureFrameOptions = {}): Promise<Blob> => {
      const { maxEdge = 640, quality = 0.85 } = options;
      const video = videoRef.current;

      // If video is not ready, check if we have a live stream and wait briefly for readyState
      if (!video || video.readyState < 2) {
        if (video && streamRef.current?.active) {
          if (!video.srcObject) {
            video.srcObject = streamRef.current;
            video.play().catch(() => {});
          }
          await new Promise<void>((resolve) => {
            if (video.readyState >= 2) return resolve();
            const onLoaded = () => {
              video.removeEventListener('loadeddata', onLoaded);
              resolve();
            };
            video.addEventListener('loadeddata', onLoaded);
            setTimeout(resolve, 500);
          });
        }
      }

      if (!video || video.readyState < 2) {
        throw new Error('Video stream is not ready for capture');
      }

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      let targetW = vw;
      let targetH = vh;

      if (Math.max(vw, vh) > maxEdge) {
        if (vw >= vh) {
          targetW = maxEdge;
          targetH = Math.round((vh / vw) * maxEdge);
        } else {
          targetH = maxEdge;
          targetW = Math.round((vw / vh) * maxEdge);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to acquire canvas 2D rendering context');
      }

      // Draw un-mirrored frame directly from video element
      ctx.drawImage(video, 0, 0, targetW, targetH);

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to encode canvas frame to JPEG blob'));
            }
          },
          'image/jpeg',
          quality,
        );
      });
    },
    [],
  );

  // Auto-reattach stream if video element re-mounts or re-renders while stream is active
  useEffect(() => {
    if (videoRef.current && streamRef.current?.active && status === 'ready') {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
      }
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return useMemo(
    () => ({
      videoRef,
      status,
      error,
      isReady: status === 'ready',
      start,
      stop,
      captureFrame,
    }),
    [status, error, start, stop, captureFrame],
  );
}
