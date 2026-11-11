'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWebcam } from '../../hooks/useWebcam';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import {
  classifyDetectionState,
  renderScrfdCanvas,
  ScrfdFace,
  ScrfdDetectionState,
  SCRFD_KEYPOINT_META,
} from '../../lib/scrfd-transform';
import { ScrfdStaticImageMask } from './ScrfdStaticImageMask';

export interface ScrfdDetectionApiResponse {
  success: boolean;
  frame_id: string;
  frame_width: number;
  frame_height: number;
  face_count: number;
  inference_time_ms: number;
  status: ScrfdDetectionState;
  message: string;
  faces: ScrfdFace[];
}

export interface EnrolledFaceSummary {
  id: string;
  label: string;
  thumbnail: string | null;
  quality: string | null;
  createdAt: string;
}

export interface ScrfdVisualizationPanelProps {
  webcam: ReturnType<typeof useWebcam>;
  isMirrored?: boolean;
  onToggleMirror?: () => void;
  enrolledFaces?: EnrolledFaceSummary[];
}

export function ScrfdVisualizationPanel({
  webcam,
  isMirrored: externalMirrored,
  onToggleMirror,
  enrolledFaces: externalEnrolledFaces,
}: ScrfdVisualizationPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // User Controls
  const [isActive, setIsActive] = useState<boolean>(true);
  const [internalMirrored, setInternalMirrored] = useState<boolean>(true);
  const isMirrored = externalMirrored !== undefined ? externalMirrored : internalMirrored;

  const handleToggleMirror = () => {
    if (onToggleMirror) {
      onToggleMirror();
    } else {
      setInternalMirrored((prev) => !prev);
    }
  };

  const [showKeypointBadges, setShowKeypointBadges] = useState<boolean>(true);
  const [showPolygonalMask, setShowPolygonalMask] = useState<boolean>(true);
  const [detectionIntervalMs, setDetectionIntervalMs] = useState<number>(200);

  // Registered Faces State
  const [fetchedFaces, setFetchedFaces] = useState<EnrolledFaceSummary[]>([]);
  const [selectedInspect, setSelectedInspect] = useState<{
    title: string;
    subtitle: string;
    imageSrc: string;
    face?: ScrfdFace;
  } | null>(null);

  // Fetch registered reference faces from isolated SQLite DB if not provided externally
  useEffect(() => {
    if (externalEnrolledFaces) return;
    fetch('/api/v1/sandbox/faces')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) setFetchedFaces(json.data);
      })
      .catch(() => {});
  }, [externalEnrolledFaces]);

  // Ensure active video element receives live stream
  useEffect(() => {
    const video = webcam.videoRef.current;
    if (video && webcam.streamRef.current && video.srcObject !== webcam.streamRef.current) {
      video.srcObject = webcam.streamRef.current;
      video.play().catch(() => {});
    }
  }, [webcam.videoRef, webcam.streamRef, webcam.isReady]);

  // Live Detection State
  const [detectionData, setDetectionData] = useState<ScrfdDetectionApiResponse | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);

  // Concurrency & Sequence Guards
  const frameSeqRef = useRef<number>(0);
  const latestCommittedSeqRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFpsTimestampRef = useRef<number>(Date.now());
  const framesCountInWindowRef = useRef<number>(0);

  // Synchronize Canvas overlay with Video stream dimensions and re-render overlay
  const syncCanvasDimensions = useCallback(() => {
    const video = webcam.videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (detectionData) {
      renderScrfdCanvas(
        ctx,
        detectionData.faces,
        { width: detectionData.frame_width, height: detectionData.frame_height },
        { width: canvas.width, height: canvas.height },
        { isMirrored, showKeypointBadges, showPolygonalMask }
      );
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [webcam.videoRef, detectionData, isMirrored, showKeypointBadges, showPolygonalMask]);

  useEffect(() => {
    syncCanvasDimensions();
  }, [syncCanvasDimensions]);

  // Real-Time Detection Inference Loop
  useEffect(() => {
    if (!isActive || !webcam.isReady) {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      return;
    }

    let isMounted = true;

    const executeInference = async () => {
      if (!isMounted || !isActive || !webcam.isReady) return;

      if (inFlightRef.current) {
        // Still processing previous frame, schedule next attempt
        loopTimerRef.current = setTimeout(executeInference, 60);
        return;
      }

      inFlightRef.current = true;
      const currentSeq = ++frameSeqRef.current;

      try {
        // Capture frame at 640px maxEdge (SCRFD standard native scale)
        const blob = await webcam.captureFrame({ maxEdge: 640, quality: 0.85 });
        if (!isMounted || !isActive) {
          inFlightRef.current = false;
          return;
        }

        const formData = new FormData();
        formData.append('frame', blob, `frame_${currentSeq}.jpg`);
        formData.append('frameId', `scrfd_${currentSeq}`);

        const response = await fetch('/api/v1/sandbox/scrfd-detect', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson?.error?.message || `Detection error (HTTP ${response.status})`);
        }

        const json: ScrfdDetectionApiResponse = await response.json();

        // Discard stale out-of-order responses
        if (isMounted && currentSeq >= latestCommittedSeqRef.current) {
          latestCommittedSeqRef.current = currentSeq;
          setDetectionData(json);
          setErrorNotice(null);

          // Update FPS calculation
          framesCountInWindowRef.current++;
          const now = Date.now();
          const elapsed = now - lastFpsTimestampRef.current;
          if (elapsed >= 1000) {
            setFps(Math.round((framesCountInWindowRef.current * 1000) / elapsed));
            framesCountInWindowRef.current = 0;
            lastFpsTimestampRef.current = now;
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorNotice(err?.message || 'Inference failed');
        }
      } finally {
        inFlightRef.current = false;
        if (isMounted && isActive) {
          loopTimerRef.current = setTimeout(executeInference, detectionIntervalMs);
        }
      }
    };

    loopTimerRef.current = setTimeout(executeInference, 100);

    return () => {
      isMounted = false;
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [isActive, webcam.isReady, webcam.captureFrame, detectionIntervalMs]);

  const stateInfo = classifyDetectionState(detectionData?.face_count ?? 0);
  const primaryFace = detectionData?.faces?.[0];

  // Expand registered faces & captured registration shots
  const sourceFaces = externalEnrolledFaces ?? fetchedFaces;
  const registeredShots: Array<{ id: string; label: string; subLabel: string; imageSrc: string }> = [];
  sourceFaces.forEach((f) => {
    let thumbs: string[] = [];
    try {
      if (f.quality) {
        const q = JSON.parse(f.quality);
        if (Array.isArray(q.thumbnails)) thumbs = q.thumbnails;
      }
    } catch {
      // ignore
    }
    if (thumbs.length === 0 && f.thumbnail) {
      thumbs = [f.thumbnail];
    }
    thumbs.forEach((src, idx) => {
      registeredShots.push({
        id: `${f.id}_shot_${idx}`,
        label: f.label,
        subLabel: thumbs.length > 1 ? `Registered Shot ${idx + 1}/${thumbs.length}` : 'Registered Reference',
        imageSrc: src,
      });
    });
  });

  return (
    <div className="space-y-6">
      {/* Feature Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#0B1F3A] text-cyan-400 font-mono text-xs font-bold">
                AI
              </span>
              <h2 className="text-lg font-bold text-[#0B1F3A]">
                Real-Time SCRFD Face Detection Visualization
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Live computer vision telemetry powered by <span className="font-semibold text-slate-700">InsightFace SCRFD</span> (Sample and Computation Redistribution for Efficient Face Detection) running on ONNX Runtime. Renders authentic bounding boxes, confidence scores, and 5 facial keypoints with zero synthetic interpolation.
            </p>
          </div>

          {/* Quick Controls Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleToggleMirror}
              className="px-3 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-medium transition"
              title="Toggle webcam mirroring"
            >
              ⇄ {isMirrored ? 'Mirrored Feed' : 'Normal Feed'}
            </button>

            <button
              onClick={() => setShowPolygonalMask(!showPolygonalMask)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                showPolygonalMask
                  ? 'bg-cyan-50 border-cyan-400 text-cyan-900 font-bold shadow-xs'
                  : 'bg-slate-100 border-slate-300 text-slate-600'
              }`}
              title="Toggle SCRFD Polygonal Face Mask"
            >
              ⬡ {showPolygonalMask ? 'Polygonal Mask ON' : 'Mask OFF'}
            </button>

            <button
              onClick={() => setShowKeypointBadges(!showKeypointBadges)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                showKeypointBadges
                  ? 'bg-cyan-50 border-cyan-300 text-cyan-800'
                  : 'bg-slate-100 border-slate-300 text-slate-600'
              }`}
              title="Toggle keypoint labels"
            >
              🏷️ {showKeypointBadges ? 'Keypoint Badges ON' : 'Badges OFF'}
            </button>

            <Button
              variant={isActive ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setIsActive(!isActive)}
            >
              {isActive ? '⏸ Pause Detection' : '▶ Resume Live Detection'}
            </Button>
          </div>
        </div>
      </div>

      {/* Detection State Dynamic Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-all ${stateInfo.badgeClass}`}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-3.5 h-3.5 rounded-full animate-pulse shadow"
            style={{ backgroundColor: stateInfo.colorHex }}
          />
          <div>
            <div className="text-xs font-bold tracking-wide uppercase">
              {stateInfo.label}
            </div>
            <div className="text-xs opacity-90 mt-0.5">
              {stateInfo.message}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="opacity-75">Detector: </span>
            <span className="font-bold">SCRFD Buffalo_L</span>
          </div>
          <div>
            <span className="opacity-75">Stream: </span>
            <span className="font-bold">{fps} FPS</span>
          </div>
        </div>
      </div>

      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorNotice}</span>
          </div>
          <button
            onClick={() => setErrorNotice(null)}
            className="text-rose-500 hover:text-rose-800 font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main 2-Column Visualization & Telemetry Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Live Webcam View with Canvas Overlay (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs font-bold text-[#0B1F3A]">Live Video Feed & Overlay</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span>Rate:</span>
              <select
                value={detectionIntervalMs}
                onChange={(e) => setDetectionIntervalMs(Number(e.target.value))}
                className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={100}>100ms (~10 FPS)</option>
                <option value={200}>200ms (~5 FPS - Recommended)</option>
                <option value={400}>400ms (~2.5 FPS)</option>
                <option value={800}>800ms (~1.2 FPS)</option>
              </select>
            </div>
          </div>

          {/* Camera Stage */}
          <div className="relative aspect-[4/3] bg-slate-900 w-full overflow-hidden flex items-center justify-center">
            {/* Native Video Element */}
            <video
              ref={webcam.videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain transition-opacity duration-300 ${
                webcam.isReady ? 'opacity-100' : 'opacity-0'
              }`}
              style={isMirrored ? { transform: 'scaleX(-1)' } : undefined}
            />

            {/* High-Accuracy Canvas Overlay */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />

            {/* Camera Requesting / Error Overlays */}
            {webcam.status === 'requesting' && (
              <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white p-4">
                <Spinner size="lg" className="text-cyan-400" />
                <p className="mt-3 text-xs font-medium">Requesting camera permissions...</p>
              </div>
            )}

            {webcam.error && (
              <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center text-center p-6 text-white space-y-3">
                <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl">
                  📷
                </div>
                <div className="font-bold text-sm text-rose-300">{webcam.error.name}</div>
                <p className="text-xs text-slate-300 max-w-sm">{webcam.error.userInstruction}</p>
                <Button size="sm" onClick={() => webcam.start({ force: true })}>
                  Retry Camera
                </Button>
              </div>
            )}

            {/* Pause indicator watermark */}
            {!isActive && webcam.isReady && (
              <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm border border-slate-700 text-amber-400 text-[11px] font-mono px-2.5 py-1 rounded-md shadow">
                ⏸ INFERENCE PAUSED
              </div>
            )}
          </div>

          {/* Legend Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A] inline-block border border-green-700" />
                Valid Detection Box
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#06B6D4] inline-block border border-cyan-700" />
                SCRFD 5-Keypoint Graph
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 inline-flex items-center justify-center text-cyan-600 font-bold text-xs">⬡</span>
                Polygonal Biometric Mask
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626] inline-block border border-red-700" />
                Multiple Faces Warning
              </span>
            </div>
            <span className="font-mono text-slate-500">
              Resolution: {detectionData ? `${detectionData.frame_width} × ${detectionData.frame_height}` : '640 × 480'}
            </span>
          </div>
        </div>

        {/* Right Column: Compact Technical Information Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Main Telemetry Specs Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-2">
                <span>🔬</span> Detection Telemetry
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                LIVE INFERENCE
              </span>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Detection Model</span>
                <span className="font-bold text-[#0B1F3A] text-xs mt-0.5 block">
                  SCRFD
                </span>
                <span className="text-[10px] text-slate-500 font-mono">buffalo_l (ONNX)</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Detection Status</span>
                <span
                  className="font-bold text-xs mt-0.5 block truncate"
                  style={{ color: stateInfo.colorHex }}
                >
                  {stateInfo.state}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {detectionData?.face_count ?? 0} face(s)
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Inference Latency</span>
                <span className="font-mono font-bold text-emerald-700 text-xs mt-0.5 block">
                  {detectionData ? `${detectionData.inference_time_ms.toFixed(1)} ms` : '--'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Model Runtime</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Input Frame</span>
                <span className="font-mono font-bold text-slate-800 text-xs mt-0.5 block">
                  {detectionData ? `${detectionData.frame_width} × ${detectionData.frame_height}` : '--'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Native RGB Tensor</span>
              </div>
            </div>

            {/* Primary Face Detection Details */}
            {primaryFace ? (
              <div className="space-y-3 pt-1">
                {/* Confidence Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700 font-bold">Detection Confidence:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {(primaryFace.confidence * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-200 rounded-full"
                      style={{ width: `${Math.min(100, primaryFace.confidence * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Bounding Box Coordinates */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">
                    Bounding Box Coordinates [x1, y1, x2, y2]
                  </span>
                  <div className="font-mono text-xs text-[#0B1F3A] bg-white px-2 py-1.5 rounded border border-slate-200">
                    [{primaryFace.bbox.map((v) => Math.round(v)).join(', ')}]
                  </div>
                  <div className="text-[10px] text-slate-500 flex justify-between font-mono pt-0.5">
                    <span>Width: {Math.round(primaryFace.bbox[2] - primaryFace.bbox[0])}px</span>
                    <span>Height: {Math.round(primaryFace.bbox[3] - primaryFace.bbox[1])}px</span>
                  </div>
                </div>

                {/* 5 Facial Keypoints Coordinates Table */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">
                      Five Facial Keypoints (SCRFD)
                    </span>
                    <span className="text-[10px] text-cyan-700 font-mono font-bold">
                      5 Landmarks
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] font-mono">
                    {primaryFace.keypoints && primaryFace.keypoints.length === 5 ? (
                      primaryFace.keypoints.map((pt, idx) => {
                        const meta = SCRFD_KEYPOINT_META[idx] || { name: `Point ${idx}`, shortName: `P${idx}` };
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-white px-2.5 py-1 rounded border border-slate-200/80"
                          >
                            <span className="text-slate-700 font-sans font-medium flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[#06B6D4]" />
                              {meta.name} ({meta.shortName}):
                            </span>
                            <span className="text-[#0B1F3A] font-bold">
                              ({pt[0].toFixed(1)}, {pt[1].toFixed(1)})
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-slate-400 italic">Keypoints unavailable</div>
                    )}
                  </div>
                </div>

                {/* Head Pose / Euler Angles if available */}
                {(primaryFace.yaw != null || primaryFace.pitch != null || primaryFace.roll != null) && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-mono flex justify-between">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Yaw (Pan)</span>
                      <span className="font-bold text-slate-800">{primaryFace.yaw?.toFixed(1)}°</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Pitch (Tilt)</span>
                      <span className="font-bold text-slate-800">{primaryFace.pitch?.toFixed(1)}°</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Roll (Lean)</span>
                      <span className="font-bold text-slate-800">{primaryFace.roll?.toFixed(1)}°</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-2">
                <span className="text-2xl">👤</span>
                <p className="text-xs text-slate-500 font-medium">
                  Position your face in front of the camera to view live SCRFD coordinates and keypoint telemetry.
                </p>
              </div>
            )}
          </div>

          {/* Research & Architectural Callout */}
          <div className="p-4 rounded-xl bg-cyan-50/60 border border-cyan-200/80 text-[11px] text-slate-700 space-y-1.5 shadow-sm">
            <div className="font-bold text-[#0B1F3A] flex items-center gap-1.5">
              <span>🧠</span> InsightFace SCRFD Architecture
            </div>
            <p className="leading-relaxed text-slate-600">
              SCRFD optimizes feature pyramid allocation for high-accuracy face detection. The five keypoints (left eye, right eye, nose tip, left mouth, right mouth) are computed during the single-stage detection pass, establishing affine similarity transforms for ArcFace face recognition.
            </p>
          </div>
        </div>
      </div>

      {/* Selected Polygonal Mask Inspector (Expanded Preview when clicking any item) */}
      {selectedInspect && (
        <div className="bg-white rounded-2xl border-2 border-cyan-500 p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-2">
                <span>🔍</span> Polygonal Mask Inspector — {selectedInspect.title}
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedInspect.subtitle}</p>
            </div>
            <button
              onClick={() => setSelectedInspect(null)}
              className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
            >
              ✕ Close Inspector
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-6">
              <ScrfdStaticImageMask
                imageSrc={selectedInspect.imageSrc}
                face={selectedInspect.face}
                showPolygonalMask={true}
                showKeypointBadges={true}
                showBoundingBox={true}
                aspectClass="aspect-[4/3]"
              />
            </div>
            <div className="md:col-span-6 space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-bold text-[#0B1F3A] flex items-center gap-1.5">
                  <span>⬡</span> Biometric Polygonal Face Mesh Verification
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  This view isolates the captured facial frame and overlays the 13-vertex, 16-facet polygonal biometric face mask generated directly from SCRFD's detected bounding box and 5 core anatomical landmarks (Eye Centers, Nose Tip, Mouth Corners).
                </p>
              </div>
              {selectedInspect.face && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 font-mono text-[11px]">
                  <div className="font-bold text-slate-800 font-sans text-xs">Captured Telemetry Snapshot:</div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Confidence Score:</span>
                    <span className="font-bold text-emerald-700">{(selectedInspect.face.confidence * 100).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Bounding Box:</span>
                    <span className="text-[#0B1F3A] font-bold">[{selectedInspect.face.bbox.map((v) => Math.round(v)).join(', ')}]</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Data Captured During Registration (Enrolled Biometric Shots + Polygonal Face Masks) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-2">
              <span>🧬</span> Registered Reference Faces (Data Captured During Registration)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Biometric enrollment images stored during Step 1 registration rendered with authentic SCRFD polygonal face masks. Click any shot to inspect geometry.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-mono font-bold">
            {registeredShots.length} Registered Image{registeredShots.length === 1 ? '' : 's'}
          </span>
        </div>

        {registeredShots.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {registeredShots.map((shot) => (
              <ScrfdStaticImageMask
                key={shot.id}
                imageSrc={shot.imageSrc}
                label={shot.label}
                subLabel={shot.subLabel}
                showPolygonalMask={showPolygonalMask}
                showKeypointBadges={false}
                isSelected={selectedInspect?.imageSrc === shot.imageSrc}
                onClick={() =>
                  setSelectedInspect({
                    title: shot.label,
                    subtitle: `${shot.subLabel} • Captured During Registration`,
                    imageSrc: shot.imageSrc,
                  })
                }
              />
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-1.5">
            <div className="text-xl">📸</div>
            <div className="text-xs font-bold text-slate-700">No Registered Faces Yet</div>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Capture and register 5 images in Step 1 (Enrollment) to inspect the registered biometric shots here with their SCRFD polygonal face masks.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
