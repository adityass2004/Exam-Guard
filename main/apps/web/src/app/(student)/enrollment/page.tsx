'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type FaceAngle,
  type EnrollmentStatus,
  BIOMETRIC_CONSENT_POLICY_VERSION,
  BIOMETRIC_CONSENT_TEXT,
  type EnrollmentStatusResponse,
  type PreviewCheckResponse,
} from '@examguard/shared';
import { apiClient } from '../../../lib/api-client';
import { useWebcam } from '../../../hooks/useWebcam';
import { CameraPreview } from '../../../components/camera/CameraPreview';
import { CaptureFeedback } from '../../../components/camera/CaptureFeedback';
import { useToast } from '../../../components/ui/Toast';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';

const ANGLES: FaceAngle[] = ['FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN'];

const ANGLE_TITLES: Record<FaceAngle, string> = {
  FRONT: 'Front View (Centered)',
  LEFT: 'Left Angle (Turn to your left)',
  RIGHT: 'Right Angle (Turn to your right)',
  UP: 'Slight Upward Tilt',
  DOWN: 'Slight Downward Tilt',
};

export default function StudentEnrollmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const webcam = useWebcam();

  // Enrollment Status State
  const [loading, setLoading] = useState(true);
  const [enrollmentStatus, setEnrollmentStatus] = useState<EnrollmentStatusResponse | null>(null);

  // Wizard Steps: 0 = Consent, 1..5 = Angles, 6 = Review, 7 = Finalized
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Captured Thumbnails (Stored purely as local object URLs, never re-fetched)
  const [thumbnails, setThumbnails] = useState<Partial<Record<FaceAngle, string>>>({});

  // Live Preview Feedback
  const [previewFeedback, setPreviewFeedback] = useState<PreviewCheckResponse | null>(null);
  const [isCheckingPreview, setIsCheckingPreview] = useState(false);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef(false);
  isSubmittingRef.current = isSubmitting;

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient<EnrollmentStatusResponse>('/api/v1/student/enrollment');
      setEnrollmentStatus(res);

      if (!res.hasConsent) {
        setCurrentStep(0);
      } else if (res.profile?.status === 'APPROVED' || res.profile?.status === 'PENDING_APPROVAL') {
        setCurrentStep(7);
      } else {
        // Find first uncaptured angle
        const profile = res.profile;
        if (profile) {
          const firstUncaptured = ANGLES.findIndex((a) => !profile.angles[a]?.captured);
          if (firstUncaptured !== -1) {
            setCurrentStep(firstUncaptured + 1);
          } else {
            setCurrentStep(6); // All 5 captured, show review
          }
        } else {
          setCurrentStep(1);
        }
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to fetch enrollment status', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Activate webcam when entering steps 1..5
  useEffect(() => {
    if (currentStep >= 1 && currentStep <= 5) {
      webcam.start();
    } else {
      webcam.stop();
    }
  }, [currentStep, webcam.start, webcam.stop]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of Object.values(thumbnails)) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, [thumbnails]);

  // Self-rescheduling non-overlapping preview check loop
  const targetAngle: FaceAngle = ANGLES[Math.max(0, Math.min(4, currentStep - 1))];

  useEffect(() => {
    if (currentStep < 1 || currentStep > 5 || !webcam.isReady) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (abortCtrlRef.current) abortCtrlRef.current.abort();
      return;
    }

    let isMounted = true;

    const runPreviewLoop = async () => {
      if (!isMounted || !webcam.isReady || isSubmittingRef.current) {
        if (isMounted && webcam.isReady) {
          previewTimerRef.current = setTimeout(runPreviewLoop, 800);
        }
        return;
      }

      try {
        const frameBlob = await webcam.captureFrame({ maxEdge: 480, quality: 0.75 });
        if (!isMounted || isSubmittingRef.current) return;

        setIsCheckingPreview(true);
        const formData = new FormData();
        formData.append('frame', frameBlob, 'preview.jpg');
        formData.append('angle', targetAngle);

        const res = await apiClient<PreviewCheckResponse>('/api/v1/student/enrollment/preview-check', {
          method: 'POST',
          body: formData,
        });

        if (isMounted && !isSubmittingRef.current) {
          setPreviewFeedback(res);
        }
      } catch {
        // Ignore preview check failures in continuous loop
      } finally {
        if (isMounted) {
          setIsCheckingPreview(false);
          previewTimerRef.current = setTimeout(runPreviewLoop, 800);
        }
      }
    };

    runPreviewLoop();

    return () => {
      isMounted = false;
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (abortCtrlRef.current) abortCtrlRef.current.abort();
    };
  }, [currentStep, webcam.isReady, targetAngle, webcam.captureFrame]);

  // Consent submission
  const handleAcceptConsent = async () => {
    try {
      setIsSubmitting(true);
      await apiClient('/api/v1/student/consent/biometric', {
        method: 'POST',
        body: {
          accepted: true,
          policyVersion: BIOMETRIC_CONSENT_POLICY_VERSION,
        },
      });

      await apiClient('/api/v1/student/enrollment/start', { method: 'POST' });
      toast('Biometric consent recorded. Proceeding to face capture.', 'success');
      setCurrentStep(1);
      fetchStatus();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to record consent', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Capture current angle
  const handleCaptureAngle = async () => {
    try {
      setIsSubmitting(true);
      const blob = await webcam.captureFrame({ maxEdge: 640, quality: 0.85 });

      const formData = new FormData();
      formData.append('frame', blob, `${targetAngle.toLowerCase()}.jpg`);
      formData.append('angle', targetAngle);

      await apiClient('/api/v1/student/enrollment/captures', {
        method: 'POST',
        body: formData,
      });

      // Save local thumbnail URL
      const localUrl = URL.createObjectURL(blob);
      setThumbnails((prev) => {
        if (prev[targetAngle]) URL.revokeObjectURL(prev[targetAngle]!);
        return { ...prev, [targetAngle]: localUrl };
      });

      toast(`Successfully captured ${targetAngle} angle!`, 'success');

      // Advance to next angle or review screen
      if (currentStep < 5) {
        setCurrentStep((prev) => prev + 1);
        setPreviewFeedback(null);
      } else {
        setCurrentStep(6); // Review screen
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Capture failed. Please adjust position.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Retake angle
  const handleRetakeAngle = async (angle: FaceAngle, stepIndex: number) => {
    try {
      setIsSubmitting(true);
      await apiClient(`/api/v1/student/enrollment/captures/${angle}`, {
        method: 'DELETE',
      });

      setThumbnails((prev) => {
        const next = { ...prev };
        if (next[angle]) {
          URL.revokeObjectURL(next[angle]!);
          delete next[angle];
        }
        return next;
      });

      toast(`Previous ${angle} capture removed. Ready to retake.`, 'info');
      setCurrentStep(stepIndex);
      setPreviewFeedback(null);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to reset capture', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Finalize Enrollment
  const handleFinalize = async () => {
    try {
      setIsSubmitting(true);
      const res = await apiClient<{ status: string; message: string }>('/api/v1/student/enrollment/finalize', {
        method: 'POST',
      });

      toast(res.message, 'success');
      setCurrentStep(7);
      fetchStatus();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Finalization failed. Please verify captures.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-8 text-center">
        <Spinner size="lg" className="mb-4" />
        <p className="text-sm font-medium text-slate-500">Loading enrollment state...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Title & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Multi-Angle Face Enrollment
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Capture 5 biometric reference angles for secure continuous identity verification
          </p>
        </div>
        <Link href="/dashboard">
          <Button variant="secondary" size="sm">
            ← Return to Dashboard
          </Button>
        </Link>
      </div>

      {/* STEPPER HEADER (Steps 1..5) */}
      {currentStep >= 1 && currentStep <= 6 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Angle {Math.min(currentStep, 5)} of 5</span>
            <span>{currentStep === 6 ? 'All Angles Captured' : ANGLE_TITLES[targetAngle]}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ANGLES.map((angle, idx) => {
              const isDone = !!thumbnails[angle] || !!enrollmentStatus?.profile?.angles[angle]?.captured;
              const isCurrent = currentStep === idx + 1;
              return (
                <div
                  key={angle}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    isDone
                      ? 'bg-emerald-500'
                      : isCurrent
                      ? 'bg-blue-600 ring-2 ring-blue-300'
                      : 'bg-slate-200'
                  }`}
                  title={`${angle}: ${isDone ? 'Captured' : isCurrent ? 'Current' : 'Pending'}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 0: BIOMETRIC CONSENT SCREEN */}
      {currentStep === 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Biometric Verification Consent</CardTitle>
              <Badge variant="warning">Policy v{BIOMETRIC_CONSENT_POLICY_VERSION}</Badge>
            </div>
            <CardDescription>
              Review the biometric identity verification policy before proceeding with webcam enrollment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
              {BIOMETRIC_CONSENT_TEXT}
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50/60 border border-blue-200 text-sm">
              <input
                id="consent-checkbox"
                type="checkbox"
                checked={consentAgreed}
                onChange={(e) => setConsentAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="consent-checkbox" className="text-slate-800 text-xs font-medium cursor-pointer">
                I have read and voluntarily agree to the collection and AES-256-GCM encrypted storage of my multi-angle
                facial biometric reference data for examination integrity verification.
              </label>
            </div>

            <Button
              variant="primary"
              disabled={!consentAgreed || isSubmitting}
              isLoading={isSubmitting}
              onClick={handleAcceptConsent}
              className="w-full justify-center"
            >
              Accept Consent & Begin Enrollment
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STEPS 1..5: GUIDED LIVE CAMERA CAPTURE */}
      {currentStep >= 1 && currentStep <= 5 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-4">
            <CameraPreview
              videoRef={webcam.videoRef}
              status={webcam.status}
              error={webcam.error}
              targetAngle={targetAngle}
              acceptable={previewFeedback?.acceptable || false}
              onRetry={webcam.start}
            />
          </div>

          <div className="lg:col-span-5 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Step {currentStep} of 5
                  </span>
                  <Badge variant={previewFeedback?.acceptable ? 'success' : 'neutral'}>
                    {previewFeedback?.acceptable ? 'Ready' : 'Positioning'}
                  </Badge>
                </div>
                <CardTitle className="text-lg">{ANGLE_TITLES[targetAngle]}</CardTitle>
                <CardDescription>
                  Align your face within the oval guide until the border illuminates green.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CaptureFeedback
                  acceptable={previewFeedback?.acceptable || false}
                  hints={previewFeedback?.hints || []}
                  reasons={previewFeedback?.reasons || []}
                  isLoading={isCheckingPreview}
                />

                <div className="pt-2">
                  <Button
                    variant="primary"
                    disabled={!previewFeedback?.acceptable || isSubmitting}
                    isLoading={isSubmitting}
                    onClick={handleCaptureAngle}
                    className="w-full justify-center py-2.5 text-sm font-semibold"
                  >
                    📸 Capture {targetAngle} View
                  </Button>
                </div>

                <div className="text-[11px] text-slate-400 text-center leading-tight">
                  Display is mirrored for natural interaction. Captured reference images are un-mirrored and encrypted.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* STEP 6: REVIEW & SUBMIT SCREEN */}
      {currentStep === 6 && (
        <Card>
          <CardHeader>
            <CardTitle>Review Captured Angles</CardTitle>
            <CardDescription>
              Confirm all five poses are clear and properly illuminated before submitting for approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {ANGLES.map((angle, idx) => {
                const thumb = thumbnails[angle];
                return (
                  <div key={angle} className="space-y-2 text-center">
                    <div className="aspect-[4/3] rounded-lg bg-slate-900 overflow-hidden border border-slate-200 shadow-sm relative group">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={angle} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                          Captured ✓
                        </div>
                      )}
                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRetakeAngle(angle, idx + 1)}
                          className="text-xs"
                        >
                          Retake
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-slate-700">{angle}</div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row gap-4">
              <Button
                variant="primary"
                isLoading={isSubmitting}
                onClick={handleFinalize}
                className="flex-1 justify-center py-3 text-sm font-bold bg-blue-600 hover:bg-blue-700"
              >
                Submit Biometric Enrollment for Approval
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 7: FINALIZED / PENDING APPROVAL SCREEN */}
      {currentStep === 7 && (
        <Card className="text-center py-10">
          <CardContent className="space-y-6 max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-full bg-blue-50 border-2 border-blue-500 flex items-center justify-center mx-auto text-3xl">
              🛡️
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {enrollmentStatus?.profile?.status === 'APPROVED'
                  ? 'Biometric Profile Approved'
                  : 'Enrollment Awaiting Administrator Review'}
              </h2>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                {enrollmentStatus?.profile?.status === 'APPROVED'
                  ? 'Your biometric reference profile is active and verified. You are authorized to begin examinations.'
                  : 'Your 5-angle biometric reference images and centroid embedding have been encrypted and submitted. An institutional proctor or administrator will review and activate your profile.'}
              </p>
            </div>

            <div className="flex justify-center gap-4 pt-4">
              <Link href="/dashboard">
                <Button variant="primary">Return to Student Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
