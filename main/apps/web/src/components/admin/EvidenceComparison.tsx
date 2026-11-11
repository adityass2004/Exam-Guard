'use client';

import React, { useState } from 'react';

export interface RegisteredImageItem {
  id: string;
  angle: string;
  url: string;
  width: number;
  height: number;
}

interface EvidenceComparisonProps {
  triggerId: string;
  incidentCode: string;
  evidenceUrl?: string | null;
  registeredImages: RegisteredImageItem[];
  firstSimilarityPct?: number | null;
  worstSimilarityPct?: number | null;
  thresholdPct?: number | null;
}

export function EvidenceComparison({
  triggerId,
  incidentCode,
  evidenceUrl,
  registeredImages,
  firstSimilarityPct,
  worstSimilarityPct,
  thresholdPct = 75,
}: EvidenceComparisonProps) {
  const [selectedAngle, setSelectedAngle] = useState<string>(
    registeredImages[0]?.angle || 'FRONT'
  );
  const [isMirrored, setIsMirrored] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [evidenceError, setEvidenceError] = useState(false);
  const [registeredError, setRegisteredError] = useState(false);

  const currentRegisteredImage =
    registeredImages.find((img) => img.angle === selectedAngle) || registeredImages[0];

  const resolvedEvidenceSrc = evidenceUrl || `/api/v1/admin/images/evidence/${triggerId}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
        <div>
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <span>🔍</span>
            <span>Side-by-Side Biometric Comparison</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Compare encrypted capture frame directly with candidate&apos;s approved enrollment images
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Horizontal Flip Toggle */}
          <button
            type="button"
            onClick={() => setIsMirrored(!isMirrored)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
              isMirrored
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
            title="Mirror flip evidence image to match candidate webcam preview"
          >
            <span>↔️</span>
            <span>{isMirrored ? 'Mirrored' : 'Mirror Flip'}</span>
          </button>

          {/* Fullscreen Lightbox Button */}
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium flex items-center gap-1.5 transition-colors"
          >
            <span>🔎</span>
            <span>Zoom</span>
          </button>
        </div>
      </div>

      {/* Similarity Score Banner */}
      <div className="px-5 py-2.5 bg-slate-900 text-white text-xs flex flex-wrap items-center justify-between gap-4 font-mono">
        <div className="flex items-center gap-4">
          <span>
            Incident: <strong className="text-blue-400">{incidentCode}</strong>
          </span>
          {firstSimilarityPct !== null && firstSimilarityPct !== undefined && (
            <span>
              Initial Score:{' '}
              <strong className={firstSimilarityPct < (thresholdPct || 75) ? 'text-rose-400' : 'text-emerald-400'}>
                {firstSimilarityPct.toFixed(1)}%
              </strong>
            </span>
          )}
          {worstSimilarityPct !== null && worstSimilarityPct !== undefined && (
            <span>
              Worst Observed:{' '}
              <strong className="text-rose-400 font-bold">
                {worstSimilarityPct.toFixed(1)}%
              </strong>
            </span>
          )}
        </div>
        <div className="text-slate-400">
          Match Threshold: <span className="text-slate-200">{thresholdPct}%</span>
        </div>
      </div>

      {/* Side-by-Side Images */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50">
        {/* Left: Trigger Evidence Frame */}
        <div className="flex flex-col space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-1.5 text-rose-600">
              <span className="h-2 w-2 rounded-full bg-rose-500"></span>
              Trigger Evidence Frame (Incident)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">AES-256-GCM Decrypted</span>
          </div>

          <div className="relative aspect-[4/3] bg-slate-900 rounded-xl overflow-hidden border border-slate-300 shadow-inner flex items-center justify-center">
            {evidenceError ? (
              <div className="text-center p-4 text-slate-400">
                <span className="text-3xl block mb-2">⚠️</span>
                <span className="text-xs">Failed to load evidence image or file was not captured</span>
              </div>
            ) : (
              <img
                src={resolvedEvidenceSrc}
                alt={`Evidence frame for incident ${incidentCode}`}
                referrerPolicy="no-referrer"
                draggable={false}
                onError={() => setEvidenceError(true)}
                className={`max-w-full max-h-full object-contain transition-transform duration-200 ${
                  isMirrored ? 'scale-x-[-1]' : ''
                }`}
              />
            )}
            {isMirrored && (
              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono">
                MIRRORED
              </span>
            )}
          </div>
        </div>

        {/* Right: Candidate Approved Enrollment Photograph */}
        <div className="flex flex-col space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              Registered Candidate Photograph
            </span>

            {/* Angle Selector Tabs */}
            <div className="flex items-center gap-1">
              {registeredImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedAngle(img.angle)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                    selectedAngle === img.angle
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  }`}
                >
                  {img.angle}
                </button>
              ))}
            </div>
          </div>

          <div className="relative aspect-[4/3] bg-slate-900 rounded-xl overflow-hidden border border-slate-300 shadow-inner flex items-center justify-center">
            {currentRegisteredImage && !registeredError ? (
              <img
                src={currentRegisteredImage.url}
                alt={`Candidate approved photo - ${selectedAngle}`}
                referrerPolicy="no-referrer"
                draggable={false}
                onError={() => setRegisteredError(true)}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-center p-4 text-slate-400">
                <span className="text-3xl block mb-2">👤</span>
                <span className="text-xs">No registered image available for angle {selectedAngle}</span>
              </div>
            )}
            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono">
              ANGLE: {selectedAngle}
            </span>
          </div>
        </div>
      </div>

      {/* Lightbox / Zoom Modal */}
      {zoomOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative max-w-5xl w-full bg-slate-900 rounded-2xl p-6 text-white border border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <h4 className="text-base font-bold flex items-center gap-2">
                <span>Synchronized Inspection:</span>
                <span className="text-blue-400 font-mono">{incidentCode}</span>
              </h4>
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold"
              >
                Close (ESC)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 aspect-[16/9]">
              <div className="flex flex-col items-center justify-center bg-black rounded-xl overflow-hidden border border-slate-800 p-2">
                <img
                  src={resolvedEvidenceSrc}
                  alt="Evidence enlarged"
                  className={`max-w-full max-h-full object-contain ${isMirrored ? 'scale-x-[-1]' : ''}`}
                />
                <span className="text-xs text-rose-400 font-semibold mt-2">Trigger Evidence Frame</span>
              </div>
              <div className="flex flex-col items-center justify-center bg-black rounded-xl overflow-hidden border border-slate-800 p-2">
                {currentRegisteredImage && (
                  <img
                    src={currentRegisteredImage.url}
                    alt="Registered enlarged"
                    className="max-w-full max-h-full object-contain"
                  />
                )}
                <span className="text-xs text-emerald-400 font-semibold mt-2">
                  Registered Profile ({selectedAngle})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
