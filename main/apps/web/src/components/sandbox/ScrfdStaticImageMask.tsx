'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  renderScrfdCanvas,
  ScrfdFace,
} from '../../lib/scrfd-transform';

// Global cache for static image SCRFD detections to prevent redundant network calls
const detectionCache = new Map<string, { faces: ScrfdFace[]; width: number; height: number }>();

interface ScrfdStaticImageMaskProps {
  imageSrc: string;
  face?: ScrfdFace;
  label?: string;
  subLabel?: string;
  aspectClass?: string;
  showPolygonalMask?: boolean;
  showKeypointBadges?: boolean;
  showBoundingBox?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}

export function ScrfdStaticImageMask({
  imageSrc,
  face: precomputedFace,
  label,
  subLabel,
  aspectClass = 'aspect-[4/3]',
  showPolygonalMask = true,
  showKeypointBadges = false,
  showBoundingBox = true,
  isSelected = false,
  onClick,
}: ScrfdStaticImageMaskProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!precomputedFace);
  const [detectedFace, setDetectedFace] = useState<ScrfdFace | null>(precomputedFace || null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 640, height: 480 });

  // Fetch SCRFD detection if not precomputed
  useEffect(() => {
    let isMounted = true;

    if (precomputedFace) {
      setDetectedFace(precomputedFace);
      setIsLoading(false);
      return;
    }

    if (!imageSrc) return;

    if (detectionCache.has(imageSrc)) {
      const cached = detectionCache.get(imageSrc)!;
      setDetectedFace(cached.faces[0] || null);
      setDimensions({ width: cached.width, height: cached.height });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const runDetectionOnImage = async () => {
      try {
        // Convert imageSrc (data URL or regular URL) to Blob
        const res = await fetch(imageSrc);
        const blob = await res.blob();

        const formData = new FormData();
        formData.append('frame', blob, 'static.jpg');

        const detectRes = await fetch('/api/v1/sandbox/scrfd-detect', {
          method: 'POST',
          body: formData,
        });

        if (!detectRes.ok) throw new Error('Detection failed');

        const json = await detectRes.json();
        const primary = json.faces?.[0] || null;

        if (isMounted) {
          const dims = { width: json.frame_width || 640, height: json.frame_height || 480 };
          setDimensions(dims);
          setDetectedFace(primary);
          detectionCache.set(imageSrc, { faces: json.faces || [], width: dims.width, height: dims.height });
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    runDetectionOnImage();

    return () => {
      isMounted = false;
    };
  }, [imageSrc, precomputedFace]);

  // Draw image and polygonal mask overlay on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSrc) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;

    img.onload = () => {
      const w = img.naturalWidth || 640;
      const h = img.naturalHeight || 480;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      // 1. Draw base image
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      // 2. Render SCRFD polygonal face mask & bounding box
      if (detectedFace) {
        renderScrfdCanvas(
          ctx,
          [detectedFace],
          { width: dimensions.width || w, height: dimensions.height || h },
          { width: w, height: h },
          {
            isMirrored: false,
            showKeypointBadges,
            showPolygonalMask,
            showBoundingBox,
            clearCanvas: false, // Keep image beneath annotations
          }
        );
      }
    };
  }, [imageSrc, detectedFace, dimensions, showPolygonalMask, showKeypointBadges, showBoundingBox]);

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-xl border overflow-hidden bg-slate-900 transition-all ${aspectClass} ${
        onClick ? 'cursor-pointer' : ''
      } ${
        isSelected
          ? 'ring-2 ring-cyan-500 border-cyan-400 shadow-md'
          : 'border-slate-200 hover:border-slate-400'
      }`}
    >
      <canvas ref={canvasRef} className="w-full h-full object-contain" />

      {isLoading && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center">
          <div className="flex items-center gap-1.5 text-cyan-400 text-[10px] font-mono font-medium">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            Analyzing SCRFD...
          </div>
        </div>
      )}

      {/* Top Confidence Pill */}
      {detectedFace && (
        <div className="absolute top-2 left-2 bg-slate-900/85 backdrop-blur-xs border border-slate-700/80 text-[10px] font-mono text-cyan-300 px-2 py-0.5 rounded shadow">
          ⬡ {Math.round(detectedFace.confidence * 1000) / 10}% SCRFD
        </div>
      )}

      {/* Bottom Label Bar */}
      {(label || subLabel) && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent p-2 text-white">
          {label && <div className="text-[11px] font-bold truncate leading-tight">{label}</div>}
          {subLabel && <div className="text-[10px] text-slate-300 font-mono truncate">{subLabel}</div>}
        </div>
      )}
    </div>
  );
}

