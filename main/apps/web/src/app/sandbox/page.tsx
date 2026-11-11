'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useWebcam } from '../../hooks/useWebcam';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { ScrfdVisualizationPanel } from '../../components/sandbox/ScrfdVisualizationPanel';

interface EnrolledFace {
  id: string;
  label: string;
  thumbnail: string | null;
  quality: string | null;
  createdAt: string;
}

interface ParsedQuality {
  sampleCount?: number;
  minObservedSimilarity?: number;
  similarities?: number[];
  thumbnails?: string[];
  qualities?: Array<{
    blur?: number;
    brightness?: number;
    faceSizeRatio?: number;
  }>;
}

interface DetectionResult {
  hasReference: boolean;
  referenceFaceId?: string;
  referenceLabel?: string;
  outcome: 'MATCH' | 'MISMATCH' | 'NO_FACE' | 'MULTIPLE_FACES' | 'IMAGE_UNCLEAR' | 'READY_TO_ENROLL';
  message: string;
  similarityPct?: number | null;
  similarityRaw?: number | null;
  thresholdPct: number;
  faceCount: number;
  quality?: {
    blur: number;
    brightness: number;
    faceSizeRatio: number;
    faceInFrame: boolean;
    poseOk: boolean;
  };
  latencyMs: number;
  timestamp: string;
}

interface PreviewFeedback {
  acceptable: boolean;
  outcome: 'READY' | 'NO_FACE' | 'MULTIPLE_FACES' | 'IMAGE_UNCLEAR';
  message: string;
  hints: string[];
}

interface ShotSlot {
  id: string;
  label: string;
  instruction: string;
  icon: string;
  blob: Blob | null;
  previewUrl: string | null;
}

const DEFAULT_SLOTS: Array<{ id: string; label: string; instruction: string; icon: string }> = [
  { id: 'shot-1', label: 'Shot 1: Front View', instruction: 'Look directly into camera center', icon: '🎯' },
  { id: 'shot-2', label: 'Shot 2: Slight Left', instruction: 'Turn your head slightly to your left (~15°)', icon: '👈' },
  { id: 'shot-3', label: 'Shot 3: Slight Right', instruction: 'Turn your head slightly to your right (~15°)', icon: '👉' },
  { id: 'shot-4', label: 'Shot 4: Tilt Up', instruction: 'Tilt your chin slightly upward (~10°)', icon: '👆' },
  { id: 'shot-5', label: 'Shot 5: Tilt Down', instruction: 'Tilt your chin slightly downward (~10°)', icon: '👇' },
];

export default function SandboxTestingPage() {
  const webcam = useWebcam();

  // Active view mode: 'enrollment' (capture 5 images) | 'testing' (live verification) | 'scrfd' (SCRFD 5-keypoint visualization)
  const [activeTab, setActiveTab] = useState<'enrollment' | 'testing' | 'scrfd'>('enrollment');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  // 5-Slot Enrollment State
  const [candidateName, setCandidateName] = useState('');
  const [slots, setSlots] = useState<ShotSlot[]>(() =>
    DEFAULT_SLOTS.map((s) => ({ ...s, blob: null, previewUrl: null }))
  );
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);
  const [isAutoBursting, setIsAutoBursting] = useState<boolean>(false);
  const [burstStepMessage, setBurstStepMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [isEnrolling, setIsEnrolling] = useState<boolean>(false);

  // Live Enrollment Guidance State (Preview Check)
  const [previewFeedback, setPreviewFeedback] = useState<PreviewFeedback | null>(null);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCheckingPreviewRef = useRef(false);

  // Live Detection State (Testing Tab)
  const [faces, setFaces] = useState<EnrolledFace[]>([]);
  const [activeFaceId, setActiveFaceId] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(75);
  const [intervalMs, setIntervalMs] = useState<number>(800);
  const [isDetecting, setIsDetecting] = useState<boolean>(true);
  const [latestDetection, setLatestDetection] = useState<DetectionResult | null>(null);

  // Notifications
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightRef = useRef(false);

  // Start webcam on mount
  useEffect(() => {
    webcam.start();
    return () => {
      webcam.stop();
    };
  }, [webcam.start, webcam.stop]);

  // Clean up slot preview URLs on unmount
  useEffect(() => {
    return () => {
      slots.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
    };
  }, [slots]);

  // Load enrolled faces from isolated SQLite database
  const loadFaces = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/sandbox/faces');
      if (res.ok) {
        const json = await res.json();
        const faceList: EnrolledFace[] = json.data || [];
        setFaces(faceList);

        if (faceList.length > 0) {
          if (!activeFaceId) {
            setActiveFaceId(faceList[0].id);
          }
          // If we already have faces and no captures in progress, default to testing tab
          setActiveTab((prev) => (prev === 'enrollment' && slots.every((s) => !s.blob) ? 'testing' : prev));
        }
      }
    } catch {
      // ignore
    }
  }, [activeFaceId, slots]);

  useEffect(() => {
    loadFaces();
  }, [loadFaces]);

  // Capture current frame into specified slot with a soft shutter flash effect
  const captureSlot = useCallback(
    async (index: number) => {
      if (!webcam.isReady) return;
      try {
        // Trigger soft shutter flash
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 150);

        const blob = await webcam.captureFrame({ maxEdge: 640, quality: 0.85 });
        const url = URL.createObjectURL(blob);

        setSlots((prev) => {
          const next = [...prev];
          if (next[index].previewUrl) {
            URL.revokeObjectURL(next[index].previewUrl!);
          }
          next[index] = { ...next[index], blob, previewUrl: url };
          return next;
        });

        // Advance to next unfilled slot if available
        const nextUnfilled = slots.findIndex((s, i) => i > index && !s.blob);
        if (nextUnfilled !== -1) {
          setActiveSlotIndex(nextUnfilled);
        } else {
          const anyUnfilled = slots.findIndex((s) => !s.blob);
          if (anyUnfilled !== -1) {
            setActiveSlotIndex(anyUnfilled);
          }
        }
      } catch (err: any) {
        setErrorNotice(err?.message || 'Failed to capture frame from webcam');
      }
    },
    [webcam, slots]
  );

  // Live preview guidance loop during enrollment mode
  useEffect(() => {
    if (activeTab !== 'enrollment' || !webcam.isReady || isAutoBursting) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      return;
    }

    let isMounted = true;

    const runPreviewCheck = async () => {
      if (!isMounted || !webcam.isReady || isCheckingPreviewRef.current || isAutoBursting || activeTab !== 'enrollment') {
        if (isMounted && activeTab === 'enrollment') {
          previewTimerRef.current = setTimeout(runPreviewCheck, 700);
        }
        return;
      }

      isCheckingPreviewRef.current = true;

      try {
        const frameBlob = await webcam.captureFrame({ maxEdge: 320, quality: 0.65 });
        if (!isMounted || activeTab !== 'enrollment') return;

        const formData = new FormData();
        formData.append('frame', frameBlob, 'preview.jpg');

        const res = await fetch('/api/v1/sandbox/preview-check', {
          method: 'POST',
          body: formData,
        });

        if (res.ok && isMounted) {
          const json = await res.json();
          setPreviewFeedback(json.data);
        }
      } catch {
        // ignore preview dropped ticks
      } finally {
        isCheckingPreviewRef.current = false;
        if (isMounted && activeTab === 'enrollment' && !isAutoBursting) {
          previewTimerRef.current = setTimeout(runPreviewCheck, 700);
        }
      }
    };

    previewTimerRef.current = setTimeout(runPreviewCheck, 400);

    return () => {
      isMounted = false;
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [activeTab, webcam.isReady, isAutoBursting]);

  // Auto-Burst 5 Frames with Step-by-Step Guidance and Voice Prompts
  const handleAutoBurst = async () => {
    if (!webcam.isReady || isAutoBursting) return;
    setIsAutoBursting(true);
    setErrorNotice(null);

    const steps = [
      { index: 0, text: 'Shot 1 of 5: Look straight into camera center...', delay: 3 },
      { index: 1, text: 'Shot 2 of 5: Now turn your head slightly to your LEFT...', delay: 2 },
      { index: 2, text: 'Shot 3 of 5: Now turn your head slightly to your RIGHT...', delay: 2 },
      { index: 3, text: 'Shot 4 of 5: Now tilt your chin slightly UPWARD...', delay: 2 },
      { index: 4, text: 'Shot 5 of 5: Now tilt your chin slightly DOWNWARD...', delay: 2 },
    ];

    for (const step of steps) {
      setActiveSlotIndex(step.index);
      setBurstStepMessage(step.text);

      // Countdown for this step
      for (let c = step.delay; c > 0; c--) {
        setCountdown(c);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(null);

      // Capture photo
      await captureSlot(step.index);
      await new Promise((r) => setTimeout(r, 500));
    }

    setBurstStepMessage(null);
    setIsAutoBursting(false);
    setStatusNotice('✓ All 5 guided images captured! Review below and click "Enroll 5 Images & Start Testing".');
  };

  // Reset current 5 slots
  const handleResetSlots = () => {
    slots.forEach((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    });
    setSlots(DEFAULT_SLOTS.map((s) => ({ ...s, blob: null, previewUrl: null })));
    setActiveSlotIndex(0);
    setStatusNotice(null);
  };

  // Submit all 5 captured frames to compute centroid and save to SQLite DB
  const handleEnroll5Shots = async () => {
    const filledBlobs = slots.map((s) => s.blob).filter(Boolean) as Blob[];
    if (filledBlobs.length < 5) {
      setErrorNotice(`Please capture all 5 images before enrolling (currently ${filledBlobs.length}/5 captured).`);
      return;
    }

    setIsEnrolling(true);
    setStatusNotice(null);
    setErrorNotice(null);

    try {
      const formData = new FormData();
      filledBlobs.forEach((b, idx) => {
        formData.append('frames', b, `image_${idx + 1}.jpg`);
      });

      const label = candidateName.trim() || `Subject ${faces.length + 1} (5-Shot Centroid)`;
      formData.append('label', label);

      const res = await fetch('/api/v1/sandbox/enroll', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message || 'Face enrollment failed');
      }

      const newFace: EnrolledFace = json.data;
      setStatusNotice(`✓ Successfully enrolled "${newFace.label}" with 5 reference images in SQLite DB!`);
      setCandidateName('');
      handleResetSlots();

      await loadFaces();
      setActiveFaceId(newFace.id);
      setActiveTab('testing');
      setIsDetecting(true);
    } catch (err: any) {
      setErrorNotice(err?.message || 'Failed to enroll 5 images. Ensure your face is clearly visible.');
    } finally {
      setIsEnrolling(false);
    }
  };

  // Reset separate SQLite database
  const handleResetSandbox = async () => {
    if (!confirm('Clear all enrolled faces and test logs from the sandbox SQLite database?')) {
      return;
    }
    try {
      await fetch('/api/v1/sandbox/reset', { method: 'POST' });
      setFaces([]);
      setActiveFaceId(null);
      setLatestDetection(null);
      handleResetSlots();
      setActiveTab('enrollment');
      setStatusNotice('Sandbox database cleared. Production MySQL database remains completely untouched.');
    } catch {
      setErrorNotice('Failed to clear sandbox database');
    }
  };

  // Delete individual face from SQLite DB
  const handleDeleteFace = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/v1/sandbox/faces/${id}`, { method: 'DELETE' });
      setFaces((prev) => prev.filter((f) => f.id !== id));
      if (activeFaceId === id) {
        setActiveFaceId(null);
      }
      setStatusNotice('Reference face removed from SQLite database.');
    } catch {
      setErrorNotice('Failed to remove face');
    }
  };

  // Continuous Live Detection & Verification Loop (active during testing tab)
  useEffect(() => {
    if (!isDetecting || !webcam.isReady || activeTab !== 'testing') {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      return;
    }

    let isMounted = true;

    const runDetectionTick = async () => {
      if (!isMounted || !webcam.isReady || inFlightRef.current || isEnrolling || activeTab !== 'testing') {
        if (isMounted && webcam.isReady && isDetecting && activeTab === 'testing') {
          loopTimerRef.current = setTimeout(runDetectionTick, intervalMs);
        }
        return;
      }

      inFlightRef.current = true;

      try {
        const frameBlob = await webcam.captureFrame({ maxEdge: 480, quality: 0.75 });
        if (!isMounted || activeTab !== 'testing') return;

        const formData = new FormData();
        formData.append('frame', frameBlob, 'probe.jpg');
        if (activeFaceId) {
          formData.append('faceId', activeFaceId);
        }
        formData.append('thresholdPct', String(threshold));

        const res = await fetch('/api/v1/sandbox/detect', {
          method: 'POST',
          body: formData,
        });

        if (res.ok && isMounted) {
          const json = await res.json();
          const detResult: DetectionResult = json.data;
          setLatestDetection(detResult);
        }
      } catch {
        // ignore tick drops
      } finally {
        inFlightRef.current = false;
        if (isMounted && isDetecting && activeTab === 'testing') {
          loopTimerRef.current = setTimeout(runDetectionTick, intervalMs);
        }
      }
    };

    loopTimerRef.current = setTimeout(runDetectionTick, 200);

    return () => {
      isMounted = false;
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [isDetecting, webcam.isReady, activeFaceId, threshold, intervalMs, isEnrolling, activeTab]);

  const activeFace = faces.find((f) => f.id === activeFaceId);
  const activeQuality: ParsedQuality = activeFace?.quality ? JSON.parse(activeFace.quality) : {};
  const filledSlotsCount = slots.filter((s) => s.blob !== null).length;
  const currentSlot = slots[activeSlotIndex] || slots[0];
  const isReadyToCapture = previewFeedback?.acceptable ?? false;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-2xl font-black text-slate-900 tracking-tight">
              Exam<span className="text-blue-600">Guard</span>
            </Link>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">
              5-Shot Testing Sandbox
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
              Unauthenticated Demo Mode
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Capture 5 images to record a reference profile, then test real-time live detections with isolated SQLite storage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="secondary" size="sm" className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs shadow-sm">
              ← Return to Login
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetSandbox}
            className="text-xs bg-white hover:bg-rose-50 border-rose-300 text-rose-600 shadow-sm"
          >
            Clear Sandbox DB
          </Button>
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="max-w-7xl mx-auto mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center p-1.5 bg-slate-200/70 border border-slate-300/80 rounded-xl shadow-inner">
          <button
            onClick={() => setActiveTab('enrollment')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'enrollment'
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📸</span>
            <span>Step 1: Capture 5 Images</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'enrollment' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
            }`}>
              {filledSlotsCount}/5
            </span>
          </button>
          <button
            onClick={() => setActiveTab('testing')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'testing'
                ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎯</span>
            <span>Step 2: Live Detection & Testing</span>
            {activeFace && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold border border-emerald-200">
                Active
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('scrfd')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'scrfd'
                ? 'bg-white text-cyan-800 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🔬</span>
            <span>Step 3: Real-Time SCRFD Detection</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'scrfd' ? 'bg-cyan-100 text-cyan-800 border border-cyan-200' : 'bg-slate-300 text-slate-700'
            }`}>
              5 Keypoints
            </span>
          </button>
        </div>

        {activeFace && (
          <div className="text-xs text-slate-600 flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm">
            <span className="font-medium text-slate-500">Active Subject:</span>
            <strong className="text-slate-900 font-bold">{activeFace.label}</strong>
            <span className="text-[11px] text-blue-600 font-mono font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {activeQuality.sampleCount || 5} images
            </span>
          </div>
        )}
      </div>

      {/* Notifications */}
      {statusNotice && (
        <div className="max-w-7xl mx-auto mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between shadow-sm">
          <span className="flex items-center gap-2">
            <span className="text-emerald-600 font-bold text-sm">✓</span>
            {statusNotice}
          </span>
          <button onClick={() => setStatusNotice(null)} className="text-emerald-700 font-bold hover:text-emerald-950 ml-2">
            ✕
          </button>
        </div>
      )}
      {errorNotice && (
        <div className="max-w-7xl mx-auto mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between shadow-sm">
          <span className="flex items-center gap-2">
            <span className="text-rose-600 font-bold text-sm">⚠️</span>
            {errorNotice}
          </span>
          <button onClick={() => setErrorNotice(null)} className="text-rose-700 font-bold hover:text-rose-950 ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Step 3: Real-Time SCRFD Face Detection Visualization */}
      {activeTab === 'scrfd' ? (
        <div className="max-w-7xl mx-auto mt-6">
          <ScrfdVisualizationPanel
            webcam={webcam}
            isMirrored={isMirrored}
            onToggleMirror={() => setIsMirrored(!isMirrored)}
            enrolledFaces={faces}
          />
        </div>
      ) : (
        /* Main Grid for Step 1 (Enrollment) & Step 2 (Verification) */
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Left Column: Live Webcam Viewport & Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm relative overflow-hidden">
            {/* Viewport Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    webcam.isReady ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                  }`}
                />
                <span className="font-bold text-slate-800">
                  {activeTab === 'enrollment'
                    ? `Enrollment Guide — Step ${activeSlotIndex + 1} of 5`
                    : 'Live Camera View'}
                </span>
              </div>
              <div className="text-slate-500 font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                {activeTab === 'testing' && latestDetection
                  ? `⚡ Latency: ${latestDetection.latencyMs.toFixed(0)}ms`
                  : '640x480 Video Stream'}
              </div>
            </div>

            {/* Video Viewport Container */}
            <div className="relative aspect-[4/3] w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-300 shadow-inner flex items-center justify-center">
              <video
                ref={webcam.videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  webcam.isReady ? 'opacity-100' : 'opacity-0'
                }`}
                style={isMirrored ? { transform: 'scaleX(-1)' } : undefined}
              />

              {/* Shutter Flash Animation */}
              {isFlashing && (
                <div className="absolute inset-0 bg-white opacity-85 transition-opacity duration-150 pointer-events-none z-30" />
              )}

              {/* Centered Face Guide Oval (Enrollment Mode Guidance) */}
              {activeTab === 'enrollment' && webcam.isReady && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 z-10">
                  {/* Subtle SVG Oval Frame */}
                  <svg className="w-full h-full max-w-[320px] max-h-[380px]" viewBox="0 0 320 380">
                    <defs>
                      <mask id="sandbox-oval-mask">
                        <rect width="100%" height="100%" fill="white" />
                        <ellipse cx="160" cy="180" rx="90" ry="125" fill="black" />
                      </mask>
                    </defs>

                    {/* Semi-transparent dark vignette outside oval for clear focus */}
                    <rect
                      width="100%"
                      height="100%"
                      fill="rgba(15, 23, 42, 0.40)"
                      mask="url(#sandbox-oval-mask)"
                    />

                    {/* Dynamic Oval Border: Green when aligned, Amber when adjusting */}
                    <ellipse
                      cx="160"
                      cy="180"
                      rx="90"
                      ry="125"
                      fill={isReadyToCapture ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.05)'}
                      stroke={isReadyToCapture ? '#10b981' : '#f59e0b'}
                      strokeWidth={isReadyToCapture ? '4' : '3'}
                      strokeDasharray={isReadyToCapture ? 'none' : '8 6'}
                      className="transition-colors duration-300"
                    />
                  </svg>

                  {/* Dynamic Positioning Status Tag inside Oval */}
                  <div className="absolute bottom-14 flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-md text-xs font-bold border transition-all">
                    {isReadyToCapture ? (
                      <span className="flex items-center gap-1.5 text-emerald-300 bg-emerald-950/80 border-emerald-500/80 px-2.5 py-0.5 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        ✓ Face Position Aligned · Ready to Capture
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-amber-200 bg-amber-950/80 border-amber-500/80 px-2.5 py-0.5 rounded-full">
                        <span>⚠️</span>
                        <span>{previewFeedback?.message || 'Align face inside center guide'}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Target Shot Header Banner (Enrollment Guidance) */}
              {activeTab === 'enrollment' && (
                <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
                  <div className="px-3.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-white text-xs font-bold shadow-lg backdrop-blur-sm flex items-center gap-2">
                    <span className="text-base">{currentSlot.icon}</span>
                    <span>{currentSlot.label}:</span>
                    <span className="text-blue-300 font-normal">{currentSlot.instruction}</span>
                  </div>

                  <span className="px-2.5 py-1 rounded-md bg-blue-600 text-white font-mono text-xs font-bold shadow">
                    #{activeSlotIndex + 1} / 5
                  </span>
                </div>
              )}

              {/* Countdown overlay during auto-burst */}
              {countdown !== null && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-30">
                  <div className="text-7xl font-black text-white animate-ping font-mono">
                    {countdown}
                  </div>
                  {burstStepMessage && (
                    <p className="text-sm font-bold text-white bg-slate-900/90 px-4 py-1.5 rounded-full mt-4 border border-slate-700">
                      {burstStepMessage}
                    </p>
                  )}
                </div>
              )}

              {!webcam.isReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-300 p-6 text-center z-10">
                  <Spinner size="lg" className="mb-3 text-blue-500" />
                  <p className="text-xs font-semibold">Initializing camera hardware...</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => webcam.start()}
                    className="mt-3 text-xs"
                  >
                    Retry Camera
                  </Button>
                </div>
              )}

              {/* Top Banner Outcome Overlay during testing mode */}
              {activeTab === 'testing' && latestDetection && (
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20">
                  <div
                    className={`px-3.5 py-1.5 rounded-lg shadow-lg backdrop-blur-md text-xs font-bold border flex items-center gap-2 ${
                      latestDetection.outcome === 'MATCH'
                        ? 'bg-emerald-600/90 border-emerald-400 text-white'
                        : latestDetection.outcome === 'MISMATCH'
                        ? 'bg-rose-600/90 border-rose-400 text-white'
                        : latestDetection.outcome === 'MULTIPLE_FACES'
                        ? 'bg-orange-600/90 border-orange-400 text-white'
                        : 'bg-amber-600/90 border-amber-400 text-white'
                    }`}
                  >
                    <span className="text-sm">
                      {latestDetection.outcome === 'MATCH'
                        ? '🟢'
                        : latestDetection.outcome === 'MISMATCH'
                        ? '🔴'
                        : latestDetection.outcome === 'MULTIPLE_FACES'
                        ? '👥'
                        : '⚠️'}
                    </span>
                    <span>{latestDetection.message}</span>
                  </div>

                  {latestDetection.similarityPct != null && (
                    <div className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-white font-mono text-xs font-black shadow-lg">
                      {latestDetection.similarityPct.toFixed(1)}% Match
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Guidance Feedback Pill Strip (Enrollment Mode) */}
            {activeTab === 'enrollment' && (
              <div className="mt-3.5 p-3 rounded-xl border text-xs flex items-center justify-between transition-colors duration-200">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{currentSlot.icon}</span>
                  <div>
                    <strong className="text-slate-800 block font-bold">
                      Target Angle: {currentSlot.label}
                    </strong>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {currentSlot.instruction}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  {isReadyToCapture ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Ready to Capture
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300">
                      <span>Adjusting...</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Quick Action Bar under camera */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-slate-100 text-xs">
              {activeTab === 'enrollment' ? (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => captureSlot(activeSlotIndex)}
                      disabled={!webcam.isReady || isAutoBursting}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                    >
                      📸 Capture {currentSlot.label}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleAutoBurst}
                      disabled={!webcam.isReady || isAutoBursting}
                      className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold shadow-sm"
                    >
                      ⚡ Auto-Burst 5 Guided Shots
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsMirrored(!isMirrored)}
                      className="px-3 py-1.5 rounded-lg text-xs bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 shadow-sm font-medium"
                      title="Toggle Camera Mirroring"
                    >
                      ⇄ {isMirrored ? 'Mirrored' : 'Normal'}
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleResetSlots}
                      disabled={filledSlotsCount === 0 || isAutoBursting}
                      className="text-xs bg-white border-slate-300 text-slate-600 hover:bg-slate-100 shadow-sm"
                    >
                      ↺ Clear
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setIsDetecting(!isDetecting)}
                      className={`text-xs font-bold shadow-sm ${
                        isDetecting
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {isDetecting ? '⏸️ Pause' : '▶️ Resume'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setActiveTab('enrollment')}
                      className="bg-white hover:bg-slate-100 text-slate-700 text-xs border border-slate-300 shadow-sm font-semibold"
                    >
                      📸 Capture 5 Images
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-slate-500">
                    <button
                      onClick={() => setIsMirrored(!isMirrored)}
                      className="px-2.5 py-1 rounded-md text-[11px] bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 shadow-sm font-medium"
                      title="Toggle Camera Mirroring"
                    >
                      ⇄ {isMirrored ? 'Mirrored' : 'Normal'}
                    </button>
                    <span className="font-medium text-xs">Speed:</span>
                    {[500, 800, 1500].map((ms) => (
                      <button
                        key={ms}
                        onClick={() => setIntervalMs(ms)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-colors shadow-sm ${
                          intervalMs === ms
                            ? 'bg-blue-600 text-white'
                            : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {ms}ms
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 5-Shot Guided Preview Strip */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 text-xs">
              <div className="font-bold text-slate-800 flex items-center gap-2">
                <span>🎞️</span> 5 Images Captured for Enrollment
              </div>
              <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                {filledSlotsCount}/5 Images Captured
              </span>
            </div>

            <div className="grid grid-cols-5 gap-3">
              {slots.map((s, idx) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setActiveSlotIndex(idx);
                    if (activeTab !== 'enrollment') setActiveTab('enrollment');
                  }}
                  className={`relative aspect-[3/4] rounded-xl border-2 overflow-hidden flex flex-col items-center justify-between p-1.5 cursor-pointer transition-all ${
                    activeSlotIndex === idx && activeTab === 'enrollment'
                      ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20 shadow-md scale-105'
                      : s.blob
                      ? 'border-emerald-500 bg-slate-900 shadow-sm'
                      : 'border-dashed border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/20'
                  }`}
                >
                  {s.previewUrl ? (
                    <>
                      <img
                        src={s.previewUrl}
                        alt={s.label}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={isMirrored ? { transform: 'scaleX(-1)' } : undefined}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
                      <div className="relative w-full flex justify-between items-center z-10">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-white shadow-sm">
                          #{idx + 1} ✓
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            captureSlot(idx);
                          }}
                          className="px-1.5 py-0.5 rounded text-[9px] bg-white/90 hover:bg-white text-slate-900 font-bold shadow-sm"
                          title="Retake Shot"
                        >
                          ↺
                        </button>
                      </div>
                      <div className="relative z-10 w-full text-center">
                        <p className="text-[10px] font-bold text-white truncate drop-shadow">
                          {s.label.split(':')[1] || s.label}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-1">
                      <span className="text-xl opacity-60">{s.icon}</span>
                      <p className="text-[10px] font-bold text-slate-700 mt-1">Shot {idx + 1}</p>
                      <p className="text-[9px] text-slate-500 line-clamp-1">{s.instruction}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Complete Enrollment Action Button */}
            {activeTab === 'enrollment' && (
              <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  {filledSlotsCount === 5 ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                      <span className="text-sm">✓</span> All 5 images captured! Ready to compute 512-dim centroid embedding.
                    </span>
                  ) : (
                    <span>Capture all 5 shots above (or click Auto-Burst) to proceed.</span>
                  )}
                </div>
                <Button
                  onClick={handleEnroll5Shots}
                  disabled={filledSlotsCount < 5 || isEnrolling}
                  className={`text-xs font-bold py-2.5 px-5 shadow-md ${
                    filledSlotsCount === 5
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  }`}
                >
                  {isEnrolling ? <Spinner size="sm" className="mr-2" /> : '✨ '}
                  {isEnrolling ? 'Computing Centroid...' : 'Enroll 5 Images & Start Testing →'}
                </Button>
              </div>
            )}
          </div>

          {/* Test Scenarios Checklist */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm text-xs space-y-3">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
              <span>🎯</span> Live Proctoring Scenarios to Demonstrate
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-600 pt-1">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
                <span className="text-emerald-600 font-bold text-sm">1.</span>
                <div>
                  <strong className="text-slate-800">Normal Match:</strong>
                  <p className="text-[11px] mt-0.5 text-slate-500">Stay facing camera $\rightarrow$ Green Match indicator with high similarity percentage.</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
                <span className="text-amber-600 font-bold text-sm">2.</span>
                <div>
                  <strong className="text-slate-800">Candidate Leaves:</strong>
                  <p className="text-[11px] mt-0.5 text-slate-500">Cover camera or step out $\rightarrow$ Amber `NO_FACE` trigger fires immediately.</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
                <span className="text-orange-600 font-bold text-sm">3.</span>
                <div>
                  <strong className="text-slate-800">Second Person In View:</strong>
                  <p className="text-[11px] mt-0.5 text-slate-500">A colleague steps into frame $\rightarrow$ Orange `MULTIPLE_FACES` alert triggers.</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
                <span className="text-rose-600 font-bold text-sm">4.</span>
                <div>
                  <strong className="text-slate-800">Impersonation / Substitute:</strong>
                  <p className="text-[11px] mt-0.5 text-slate-500">Someone else sits in front $\rightarrow$ Red `MISMATCH` alert triggers.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Controls, Reference Face Gallery & Telemetry (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Panel 1: Subject Setup / Active Reference Profile */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span>👤</span> Biometric Profile
              </h2>
              <span className="text-[11px] text-slate-600 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                SQLite DB
              </span>
            </div>

            {activeTab === 'enrollment' ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Enter candidate name for the 5-shot biometric profile stored in the dedicated SQLite database.
                </p>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Candidate / Subject Name
                  </label>
                  <input
                    type="text"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="e.g. Aditya (Primary Student)"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {activeFace ? (
                  <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        {activeFace.label}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-600 text-white font-mono font-bold shadow-sm">
                        ACTIVE REFERENCE
                      </span>
                    </div>

                    {/* Reference Face Thumbnails Gallery */}
                    {activeQuality.thumbnails && activeQuality.thumbnails.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-slate-600 uppercase block mb-1.5">
                          5 Reference Images in Profile:
                        </span>
                        <div className="grid grid-cols-5 gap-2">
                          {activeQuality.thumbnails.map((t, idx) => (
                            <img
                              key={idx}
                              src={t}
                              alt={`Sample ${idx + 1}`}
                              className="aspect-[3/4] rounded-lg object-cover border border-slate-300 shadow-sm"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {activeQuality.minObservedSimilarity != null && (
                      <div className="flex justify-between text-[11px] text-slate-600 font-mono pt-2 border-t border-blue-200/60">
                        <span>Consistency Score:</span>
                        <span className="text-emerald-700 font-bold">
                          {(activeQuality.minObservedSimilarity * 100).toFixed(1)}% Min Similarity
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-5 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500">
                    No active profile. Switch to &quot;Step 1: Capture 5 Images&quot; to enroll!
                  </div>
                )}
              </div>
            )}

            {/* Enrolled Faces List in SQLite DB */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-bold">Saved Profiles in SQLite DB:</span>
                <span className="font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {faces.length} Saved
                </span>
              </div>

              {faces.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center text-[11px] text-slate-500">
                  SQLite sandbox database is currently empty.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {faces.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => {
                        setActiveFaceId(f.id);
                        setActiveTab('testing');
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        activeFaceId === f.id
                          ? 'bg-blue-50 border-blue-500 shadow-sm'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {f.thumbnail ? (
                          <img
                            src={f.thumbnail}
                            alt={f.label}
                            className="w-10 h-10 rounded-lg object-cover border border-slate-300 shadow-sm shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                            👤
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                            {f.label}
                            {activeFaceId === f.id && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-600 text-white font-mono font-bold">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {new Date(f.createdAt).toLocaleTimeString()} · 5-Shot Centroid
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleDeleteFace(f.id, e)}
                        className="text-slate-400 hover:text-rose-600 p-1 text-xs"
                        title="Delete Profile"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Panel 2: Live Verification Telemetry & Threshold Calibration */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span>📊</span> Live Detection Telemetry
              </h2>
              <span className="text-[11px] text-slate-600 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                Real-time
              </span>
            </div>

            {/* Threshold Calibration Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-700 font-bold">Matching Threshold:</span>
                <span className="font-mono text-blue-700 font-bold">{threshold}% Similarity</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="1"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>50% (Loose)</span>
                <span>75% (Standard Default)</span>
                <span>95% (Strict)</span>
              </div>
            </div>

            {/* Real-time Match Percentage Bar */}
            {latestDetection && latestDetection.similarityPct != null && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-700 font-bold">Observed Similarity:</span>
                  <span
                    className={`font-mono font-bold ${
                      latestDetection.similarityPct >= threshold ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {latestDetection.similarityPct.toFixed(1)}% / 100%
                  </span>
                </div>
                <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden border border-slate-300 relative shadow-inner">
                  <div
                    className={`h-full transition-all duration-300 ${
                      latestDetection.similarityPct >= threshold ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, latestDetection.similarityPct)}%` }}
                  />
                  {/* Threshold marker pin */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-slate-900 shadow"
                    style={{ left: `${threshold}%` }}
                    title={`Threshold: ${threshold}%`}
                  />
                </div>
              </div>
            )}

            {/* Telemetry Stats Grid */}
            <div className="grid grid-cols-2 gap-2.5 text-xs pt-1">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Status</span>
                <span className="font-bold text-slate-900 text-xs mt-0.5 block truncate">
                  {latestDetection?.outcome || (activeTab === 'testing' ? 'CHECKING' : 'IDLE')}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Faces Detected</span>
                <span className="font-mono font-bold text-slate-900 text-xs mt-0.5 block">
                  {latestDetection?.faceCount ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Active Reference</span>
                <span className="font-bold text-blue-700 text-xs mt-0.5 block truncate">
                  {activeFace ? activeFace.label : 'None (Quality Mode)'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Inference Speed</span>
                <span className="font-mono font-bold text-emerald-700 text-xs mt-0.5 block">
                  {latestDetection ? `${latestDetection.latencyMs.toFixed(0)} ms` : '--'}
                </span>
              </div>
            </div>

            {/* Quality Metrics */}
            {latestDetection?.quality && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-[11px] text-slate-600 font-mono">
                <div className="text-slate-800 font-bold text-xs pb-1.5 border-b border-slate-200 font-sans">
                  InsightFace Quality Sensors
                </div>
                <div className="flex justify-between">
                  <span>Sharpness / Blur:</span>
                  <span className={latestDetection.quality.blur >= 80 ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                    {latestDetection.quality.blur?.toFixed(1)} {latestDetection.quality.blur >= 80 ? '✓' : '(Blurry)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Lighting / Brightness:</span>
                  <span className="text-slate-800">
                    {latestDetection.quality.brightness?.toFixed(0)} / 255
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Face Size Ratio:</span>
                  <span className="text-slate-800">
                    {((latestDetection.quality.faceSizeRatio || 0) * 100).toFixed(1)}% of frame
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Database Invariant Callout */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-[11px] text-slate-700 space-y-1 shadow-sm">
            <div className="font-bold text-blue-950 flex items-center gap-1.5">
              <span>🛡️</span> Architecture & Separate DB Guarantee
            </div>
            <p className="leading-relaxed text-slate-600">
              This sandbox is backed by its own dedicated SQLite database located at <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 text-blue-700 font-mono">storage/sandbox/sandbox.db</code>.
              Your official MySQL production tables, candidates, exams, and audit logs remain strictly untouched.
            </p>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
