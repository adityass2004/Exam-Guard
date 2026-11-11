'use client';

import React, { useEffect } from 'react';
import type { FaceImageDto } from '@examguard/shared';
import { Badge } from '../ui/Badge';

export interface LightboxProps {
  images: FaceImageDto[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function Lightbox({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
}: LightboxProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          onNavigate(currentIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < images.length - 1) {
          onNavigate(currentIndex + 1);
        }
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, currentIndex, images.length, onClose, onNavigate]);

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  const quality = currentImage.quality as any;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image inspection lightbox"
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Top Header Bar */}
      <div className="w-full max-w-5xl flex items-center justify-between text-white pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Badge variant="default" className="bg-blue-600 text-white font-mono uppercase">
            {currentImage.angle} Angle
          </Badge>
          <span className="text-xs text-white/60">
            {currentIndex + 1} of {images.length}
          </span>
          <span className="text-xs text-white/40 font-mono">
            {currentImage.width}×{currentImage.height} px · {(currentImage.byteSize / 1024).toFixed(1)} KB
          </span>
        </div>

        <button
          onClick={onClose}
          aria-label="Close lightbox"
          className="text-white/70 hover:text-white px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
        >
          Close (Esc)
        </button>
      </div>

      {/* Main Image Display with Navigation Chevrons */}
      <div className="relative flex-1 w-full max-w-5xl flex items-center justify-center my-4 overflow-hidden">
        {/* Previous Button */}
        {currentIndex > 0 && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            aria-label="Previous photograph"
            className="absolute left-2 z-10 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white text-xl transition-all"
          >
            ◀
          </button>
        )}

        {/* The Decrypted Photograph */}
        <div className="max-h-[70vh] max-w-full flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentImage.authorizedImageUrl}
            alt={`Full inspection photograph - ${currentImage.angle}`}
            referrerPolicy="no-referrer"
            draggable={false}
            className="max-h-[68vh] max-w-full object-contain rounded-lg shadow-2xl border border-white/10 select-none"
          />
        </div>

        {/* Next Button */}
        {currentIndex < images.length - 1 && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            aria-label="Next photograph"
            className="absolute right-2 z-10 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white text-xl transition-all"
          >
            ▶
          </button>
        )}
      </div>

      {/* Bottom Metadata & Thumbnails */}
      <div className="w-full max-w-5xl bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/80">
        <div className="flex items-center gap-6">
          {quality && (
            <>
              <div>
                <span className="text-white/40">Sharpness: </span>
                <span className="font-mono font-semibold text-white">
                  {quality.blurScore !== undefined ? Math.round(quality.blurScore) : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-white/40">Luminance: </span>
                <span className="font-mono font-semibold text-white">
                  {quality.luminance !== undefined ? Math.round(quality.luminance) : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-white/40">Captured: </span>
                <span className="font-mono text-white/70">
                  {new Date(currentImage.capturedAt).toLocaleTimeString()}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Thumbnail Selector Strip */}
        <div className="flex items-center gap-2">
          {images.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => onNavigate(idx)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                idx === currentIndex
                  ? 'bg-blue-600 text-white font-bold ring-2 ring-white/50'
                  : 'bg-white/10 hover:bg-white/20 text-white/70'
              }`}
            >
              {img.angle}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
