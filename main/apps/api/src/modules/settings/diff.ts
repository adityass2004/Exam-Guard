export interface SettingDiffField {
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
}

export const SETTING_FIELD_LABELS: Record<string, string> = {
  thresholdPct: 'Similarity Threshold (%)',
  intervalMs: 'Verification Interval (ms)',
  consecutiveMismatchLimit: 'Consecutive Mismatch Limit',
  missingFaceLimit: 'Missing Face Limit',
  multipleFacesPolicy: 'Multiple Faces Policy',
  multipleFacesConsecutiveLimit: 'Multiple Faces Limit',
  cameraFailurePolicy: 'Camera Failure Policy',
  cameraGraceSeconds: 'Camera Grace (s)',
  serviceFailureLimit: 'Service Failure Limit',
  repeatedFailureLimit: 'Repeated Failure Limit',
  recoveryMatchCount: 'Recovery Match Count',
  startupGraceSeconds: 'Startup Grace (s)',
  preExamRequiredMatches: 'Pre-Exam Required Matches',
  minFaceQuality: 'Minimum Face Quality Standards',
  severityRules: 'Incident Severity Rules',
  name: 'Configuration Profile Name',
};

export function computeSettingsDiff(
  oldSettings: Record<string, any> | null,
  newSettings: Record<string, any>
): SettingDiffField[] {
  if (!oldSettings) {
    return Object.keys(newSettings)
      .filter((k) => k !== 'changeNote')
      .map((k) => ({
        field: k,
        label: SETTING_FIELD_LABELS[k] || k,
        oldValue: null,
        newValue: newSettings[k],
      }));
  }

  const diffs: SettingDiffField[] = [];
  const keysToCheck = [
    'thresholdPct',
    'intervalMs',
    'consecutiveMismatchLimit',
    'missingFaceLimit',
    'multipleFacesPolicy',
    'multipleFacesConsecutiveLimit',
    'cameraFailurePolicy',
    'cameraGraceSeconds',
    'serviceFailureLimit',
    'repeatedFailureLimit',
    'recoveryMatchCount',
    'startupGraceSeconds',
    'preExamRequiredMatches',
    'minFaceQuality',
    'severityRules',
    'name',
  ];

  for (const key of keysToCheck) {
    const oldVal = oldSettings[key];
    const newVal = newSettings[key];

    if (typeof oldVal === 'object' && oldVal !== null) {
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diffs.push({
          field: key,
          label: SETTING_FIELD_LABELS[key] || key,
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    } else if (oldVal !== newVal && newVal !== undefined) {
      diffs.push({
        field: key,
        label: SETTING_FIELD_LABELS[key] || key,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return diffs;
}

