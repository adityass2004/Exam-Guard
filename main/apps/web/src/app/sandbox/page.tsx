'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useWebcam } from '../../hooks/useWebcam';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';

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

interface ShotSlot {
  label: string;
  subLabel: string;
  blob: Blob | null;
  previewUrl: string | null;
}

const DEFAULT_SLOTS: Array<{ label: string; subLabel: string }> = [
  { label: 'Image 1', subLabel: '1 of 5' },
  { label: 'Image 2', subLabel: '2 of 5' },
  { label: 'Image 3', subLabel: '3 of 5' },
  { label: 'Image 4', subLabel: '4 of 5' },
  { label: 'Image 5', subLabel: '5 of 5' },
];

export default function SandboxTestingPage() {
  const webcam = useWebcam();

  // Active view mode: 'enrollment' (capture 5 images) | 'testing' (live verification)
  const [activeTab, setActiveTab] = useState<'enrollment' | 'testing'>('enrollment');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  // 5-Slot Enrollment State
  const [candidateName, setCandidateName] = useState('');
  const [slots, setSlots] = useState<ShotSlot[]>(() =>
    DEFAULT_SLOTS.map((s) => ({ ...s, blob: null, previewUrl: null }))
  );
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);
  const [isAutoBursting, setIsAutoBursting] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isEnrolling, setIsEnrolling] = useState<boolean>(false);

  // Live Detection State
  const [faces, setFaces] = useState<EnrolledFace[]>([]);
  const [activeFaceId, setActiveFaceId] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(75);
  const [intervalMs, setIntervalMs] = useState<number>(800);
  const [isDetecting, setIsDetecting] = useState<boolean>(true);
  const [latestDetection, setLatestDetection] = useState<DetectionResult | null>(null);

  // Feedback notifications
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

  // Capture current frame into specified slot
  const captureSlot = useCallback(
    async (index: number) => {
      if (!webcam.isReady) return;
      try {
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

  // Auto-Burst 5 Frames in Sequence with countdown
  const handleAutoBurst = async () => {
    if (!webcam.isReady || isAutoBursting) return;
    setIsAutoBursting(true);
    setStatusNotice('Starting 5-image burst capture in 3 seconds...');
    setErrorNotice(null);

    // 3-second countdown
    for (let c = 3; c > 0; c--) {
      setCountdown(c);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);

    // Sequential capture for each of the 5 slots
    for (let i = 0; i < 5; i++) {
      setActiveSlotIndex(i);
      setStatusNotice(`Capturing image ${i + 1} of 5...`);
      await captureSlot(i);
      await new Promise((r) => setTimeout(r, 600));
    }

    setIsAutoBursting(false);
    setStatusNotice('All 5 images captured! Click "Enroll 5 Images & Start Testing" below.');
  };

  // Reset current 5 slots
  const handleResetSlots = () => {
    slots.forEach((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    });
    setSlots(DEFAULT_SLOTS.map((s) => ({ ...s, blob: null, previewUrl: null })));
    setActiveSlotIndex(0);
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
      setStatusNotice(`✓ Successfully enrolled "${newFace.label}" with 5 images in SQLite DB!`);
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-black text-white tracking-tight">
              Exam<span className="text-blue-500">Guard</span>
            </Link>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
              5-Shot Testing Sandbox
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Unauthenticated Demo Mode
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Capture 5 images to record a reference profile, then test real-time live detections with isolated SQLite storage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="secondary" size="sm" className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs">
              ← Return to Login
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetSandbox}
            className="text-xs border-rose-800 text-rose-400 hover:bg-rose-950/40"
          >
            Clear Sandbox DB
          </Button>
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="max-w-7xl mx-auto mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('enrollment')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'enrollment'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>📸</span>
            <span>Step 1: Capture 5 Images</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 font-mono">
              {filledSlotsCount}/5
            </span>
          </button>
          <button
            onClick={() => setActiveTab('testing')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'testing'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🎯</span>
            <span>Step 2: Live Detection & Testing</span>
            {activeFace && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-900 text-emerald-200 font-mono">
                Active
              </span>
            )}
          </button>
        </div>

        {activeFace && (
          <div className="text-xs text-slate-400 flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <span>Active Subject:</span>
            <strong className="text-white font-semibold">{activeFace.label}</strong>
            <span className="text-[10px] text-blue-400 font-mono">
              ({activeQuality.sampleCount || 5} images)
            </span>
          </div>
        )}
      </div>

      {/* Notifications */}
      {statusNotice && (
        <div className="max-w-7xl mx-auto mt-4 p-3 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-emerald-300 text-xs flex items-center justify-between">
          <span>{statusNotice}</span>
          <button onClick={() => setStatusNotice(null)} className="text-emerald-400 font-bold hover:text-white ml-2">
            ✕
          </button>
        </div>
      )}
      {errorNotice && (
        <div className="max-w-7xl mx-auto mt-4 p-3 rounded-xl bg-rose-950/50 border border-rose-700/60 text-rose-300 text-xs flex items-center justify-between">
          <span>⚠️ {errorNotice}</span>
          <button onClick={() => setErrorNotice(null)} className="text-rose-400 font-bold hover:text-white ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Left Column: Live Webcam Viewport & Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/80 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    webcam.isReady ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                  }`}
                />
                <span className="font-bold text-slate-300">
                  {activeTab === 'enrollment'
                    ? `Camera View (Slot ${activeSlotIndex + 1}: ${slots[activeSlotIndex]?.label})`
                    : 'Live Camera View'}
                </span>
              </div>
              <div className="text-slate-400 font-mono text-[11px]">
                {activeTab === 'testing' && latestDetection
                  ? `⚡ Latency: ${latestDetection.latencyMs.toFixed(0)}ms`
                  : 'Normal Video Stream'}
              </div>
            </div>

            {/* Video Viewport Container */}
            <div className="relative aspect-[4/3] w-full bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
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

              {/* Countdown overlay during auto-burst */}
              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="text-7xl font-black text-white animate-ping font-mono">
                    {countdown}
                  </div>
                </div>
              )}

              {!webcam.isReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-6 text-center">
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

              {/* Top Banner Outcome Overlay during testing */}
              {activeTab === 'testing' && latestDetection && (
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                  <div
                    className={`px-3 py-1.5 rounded-lg shadow-lg backdrop-blur-md text-xs font-bold border flex items-center gap-2 ${
                      latestDetection.outcome === 'MATCH'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                        : latestDetection.outcome === 'MISMATCH'
                        ? 'bg-rose-950/80 border-rose-500 text-rose-200'
                        : latestDetection.outcome === 'MULTIPLE_FACES'
                        ? 'bg-orange-950/80 border-orange-500 text-orange-200'
                        : 'bg-amber-950/80 border-amber-500 text-amber-200'
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
                    <div className="px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-700 text-white font-mono text-xs font-black shadow-lg">
                      {latestDetection.similarityPct.toFixed(1)}% Match
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Action Bar under camera */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
              {activeTab === 'enrollment' ? (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => captureSlot(activeSlotIndex)}
                      disabled={!webcam.isReady || isAutoBursting}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md"
                    >
                      📸 Capture {slots[activeSlotIndex]?.label}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleAutoBurst}
                      disabled={!webcam.isReady || isAutoBursting}
                      className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold"
                    >
                      ⚡ Auto-Burst 5 Images
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsMirrored(!isMirrored)}
                      className="px-2.5 py-1.5 rounded text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
                      title="Toggle Camera Mirroring"
                    >
                      ⇄ {isMirrored ? 'Mirrored' : 'Normal'}
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleResetSlots}
                      disabled={filledSlotsCount === 0 || isAutoBursting}
                      className="text-xs border-slate-700 text-slate-400 hover:text-white"
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
                      className={`text-xs font-bold ${
                        isDetecting
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {isDetecting ? '⏸️ Pause' : '▶️ Resume'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setActiveTab('enrollment')}
                      className="bg-slate-850 hover:bg-slate-800 text-slate-200 text-xs border border-slate-700"
                    >
                      📸 Capture 5 Images
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400">
                    <button
                      onClick={() => setIsMirrored(!isMirrored)}
                      className="px-2 py-1 rounded text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
                      title="Toggle Camera Mirroring"
                    >
                      ⇄ {isMirrored ? 'Mirrored' : 'Normal'}
                    </button>
                    <span>Speed:</span>
                    {[500, 800, 1500].map((ms) => (
                      <button
                        key={ms}
                        onClick={() => setIntervalMs(ms)}
                        className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-colors ${
                          intervalMs === ms
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-850 hover:bg-slate-800 text-slate-400'
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

          {/* 5-Shot Preview Strip */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800 text-xs">
              <div className="font-bold text-slate-300 flex items-center gap-2">
                <span>🎞️</span> 5 Images Captured for Enrollment
              </div>
              <span className="font-mono text-[11px] text-blue-400">
                {filledSlotsCount}/5 Images
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {slots.map((s, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setActiveSlotIndex(idx);
                    if (activeTab !== 'enrollment') setActiveTab('enrollment');
                  }}
                  className={`relative aspect-[3/4] rounded-xl border-2 overflow-hidden flex flex-col items-center justify-between p-1.5 cursor-pointer transition-all ${
                    activeSlotIndex === idx && activeTab === 'enrollment'
                      ? 'border-blue-500 bg-blue-950/30 ring-2 ring-blue-500/20'
                      : s.blob
                      ? 'border-emerald-500/60 bg-slate-900'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
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
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-black">
                          #{idx + 1} ✓
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            captureSlot(idx);
                          }}
                          className="px-1 py-0.5 rounded text-[9px] bg-slate-900/80 hover:bg-slate-800 text-slate-200"
                          title="Retake Image"
                        >
                          ↺
                        </button>
                      </div>
                      <div className="relative z-10 w-full text-center">
                        <p className="text-[10px] font-bold text-white truncate drop-shadow">
                          {s.label}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-1">
                      <span className="text-xl opacity-60">📷</span>
                      <p className="text-[10px] font-bold text-slate-400 mt-1">Image {idx + 1}</p>
                      <p className="text-[8px] text-slate-500 line-clamp-1">{s.subLabel}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Complete Enrollment Action Button */}
            {activeTab === 'enrollment' && (
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-400">
                  {filledSlotsCount === 5 ? (
                    <span className="text-emerald-400 font-bold">
                      ✓ All 5 images captured! Click button to enroll & start live testing.
                    </span>
                  ) : (
                    <span>Capture all 5 images above to proceed with enrollment.</span>
                  )}
                </div>
                <Button
                  onClick={handleEnroll5Shots}
                  disabled={filledSlotsCount < 5 || isEnrolling}
                  className={`text-xs font-bold py-2.5 px-5 shadow-lg ${
                    filledSlotsCount === 5
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isEnrolling ? <Spinner size="sm" className="mr-2" /> : '✨ '}
                  {isEnrolling ? 'Enrolling Images...' : 'Enroll 5 Images & Start Testing →'}
                </Button>
              </div>
            )}
          </div>

          {/* Test Scenarios Checklist */}
          <div className="bg-slate-950/70 rounded-2xl border border-slate-800/80 p-4 text-xs space-y-2">
            <h3 className="font-bold text-slate-200 flex items-center gap-2">
              <span>🎯</span> Live Proctoring Scenarios to Demonstrate
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400 pt-1">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-2">
                <span className="text-emerald-400 font-bold">1.</span>
                <div>
                  <strong className="text-slate-200">Normal Match:</strong>
                  <p className="text-[11px] mt-0.5">Stay facing camera $\rightarrow$ Green Match indicator with high similarity percentage.</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-2">
                <span className="text-amber-400 font-bold">2.</span>
                <div>
                  <strong className="text-slate-200">Candidate Leaves:</strong>
                  <p className="text-[11px] mt-0.5">Cover camera or step out $\rightarrow$ Amber `NO_FACE` trigger fires immediately.</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-2">
                <span className="text-orange-400 font-bold">3.</span>
                <div>
                  <strong className="text-slate-200">Second Person In View:</strong>
                  <p className="text-[11px] mt-0.5">A colleague steps into frame $\rightarrow$ Orange `MULTIPLE_FACES` alert triggers.</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-2">
                <span className="text-rose-400 font-bold">4.</span>
                <div>
                  <strong className="text-slate-200">Impersonation / Substitute:</strong>
                  <p className="text-[11px] mt-0.5">Someone else sits in front $\rightarrow$ Red `MISMATCH` alert triggers.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Controls, Reference Face Gallery & Telemetry (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Panel 1: Subject Setup / Active Reference Profile */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h2 className="font-bold text-sm text-white flex items-center gap-2">
                <span>👤</span> Biometric Profile
              </h2>
              <span className="text-[11px] text-slate-400 font-mono">SQLite DB</span>
            </div>

            {activeTab === 'enrollment' ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Enter candidate name for the 5-shot biometric profile stored in the dedicated SQLite database.
                </p>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Candidate / Subject Name
                  </label>
                  <input
                    type="text"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="e.g. Aditya (Primary Student)"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {activeFace ? (
                  <div className="p-3 rounded-xl bg-slate-900 border border-blue-500/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        {activeFace.label}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500 text-white font-mono font-bold">
                        ACTIVE REFERENCE
                      </span>
                    </div>

                    {/* Reference Face Thumbnails Gallery */}
                    {activeQuality.thumbnails && activeQuality.thumbnails.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          5 Reference Images in Profile:
                        </span>
                        <div className="grid grid-cols-5 gap-1.5">
                          {activeQuality.thumbnails.map((t, idx) => (
                            <img
                              key={idx}
                              src={t}
                              alt={`Sample ${idx + 1}`}
                              className="aspect-[3/4] rounded-lg object-cover border border-slate-700"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {activeQuality.minObservedSimilarity != null && (
                      <div className="flex justify-between text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-800">
                        <span>Consistency Score:</span>
                        <span className="text-emerald-400 font-bold">
                          {(activeQuality.minObservedSimilarity * 100).toFixed(1)}% Min Similarity
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                    No active profile. Switch to &quot;Step 1: Capture 5 Images&quot; to enroll!
                  </div>
                )}
              </div>
            )}

            {/* Enrolled Faces List in SQLite DB */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold">Saved Profiles in SQLite DB:</span>
                <span className="font-mono">{faces.length} Saved</span>
              </div>

              {faces.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-[11px] text-slate-500">
                  SQLite sandbox database is currently empty.
                </div>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {faces.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => {
                        setActiveFaceId(f.id);
                        setActiveTab('testing');
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        activeFaceId === f.id
                          ? 'bg-blue-950/40 border-blue-500 shadow-sm'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {f.thumbnail ? (
                          <img
                            src={f.thumbnail}
                            alt={f.label}
                            className="w-10 h-10 rounded-lg object-cover border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                            👤
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                            {f.label}
                            {activeFaceId === f.id && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500 text-white font-mono">
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
                        className="text-slate-500 hover:text-rose-400 p-1 text-xs"
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
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h2 className="font-bold text-sm text-white flex items-center gap-2">
                <span>📊</span> Live Detection Telemetry
              </h2>
              <span className="text-[11px] text-slate-400 font-mono">Real-time</span>
            </div>

            {/* Threshold Calibration Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-bold">Matching Threshold:</span>
                <span className="font-mono text-blue-400 font-bold">{threshold}% Similarity</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="1"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>50% (Loose)</span>
                <span>75% (Institution Default)</span>
                <span>95% (Strict)</span>
              </div>
            </div>

            {/* Real-time Match Percentage Bar */}
            {latestDetection && latestDetection.similarityPct != null && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-bold">Observed Similarity:</span>
                  <span
                    className={`font-mono font-bold ${
                      latestDetection.similarityPct >= threshold ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {latestDetection.similarityPct.toFixed(1)}% / 100%
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800 relative">
                  <div
                    className={`h-full transition-all duration-300 ${
                      latestDetection.similarityPct >= threshold ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, latestDetection.similarityPct)}%` }}
                  />
                  {/* Threshold marker pin */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow"
                    style={{ left: `${threshold}%` }}
                    title={`Threshold: ${threshold}%`}
                  />
                </div>
              </div>
            )}

            {/* Telemetry Stats Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Status</span>
                <span className="font-bold text-white text-xs mt-0.5 block truncate">
                  {latestDetection?.outcome || (activeTab === 'testing' ? 'CHECKING' : 'IDLE')}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Faces Detected</span>
                <span className="font-mono font-bold text-white text-xs mt-0.5 block">
                  {latestDetection?.faceCount ?? 0}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Active Reference</span>
                <span className="font-bold text-blue-400 text-xs mt-0.5 block truncate">
                  {activeFace ? activeFace.label : 'None (Quality Mode)'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Inference Speed</span>
                <span className="font-mono font-bold text-emerald-400 text-xs mt-0.5 block">
                  {latestDetection ? `${latestDetection.latencyMs.toFixed(0)} ms` : '--'}
                </span>
              </div>
            </div>

            {/* Quality Metrics */}
            {latestDetection?.quality && (
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5 text-[11px] text-slate-400 font-mono">
                <div className="text-slate-300 font-bold text-xs pb-1 border-b border-slate-800 font-sans">
                  InsightFace Quality Sensors
                </div>
                <div className="flex justify-between">
                  <span>Sharpness / Blur:</span>
                  <span className={latestDetection.quality.blur >= 80 ? 'text-emerald-400' : 'text-amber-400'}>
                    {latestDetection.quality.blur?.toFixed(1)} {latestDetection.quality.blur >= 80 ? '✓' : '(Blurry)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Lighting / Brightness:</span>
                  <span className="text-slate-300">
                    {latestDetection.quality.brightness?.toFixed(0)} / 255
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Face Size Ratio:</span>
                  <span className="text-slate-300">
                    {((latestDetection.quality.faceSizeRatio || 0) * 100).toFixed(1)}% of frame
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Database Invariant Callout */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="font-bold text-slate-300 flex items-center gap-1.5">
              <span>🛡️</span> Architecture & Separate DB Guarantee
            </div>
            <p className="leading-relaxed">
              This sandbox is backed by its own dedicated SQLite database located at <code className="text-blue-400 font-mono">storage/sandbox/sandbox.db</code>.
              Your official MySQL production tables, candidates, exams, and audit logs remain strictly untouched.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
