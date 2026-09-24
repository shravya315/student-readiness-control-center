export const READINESS_THRESHOLDS = {
  READY: 80,
  NEARLY_READY: 65,
  DEVELOPING: 50,
} as const;

export type ReadinessStatus =
  | 'READY'
  | 'NEARLY_READY'
  | 'DEVELOPING'
  | 'NEEDS_PREPARATION';

export function getReadinessStatus(
  score: number | null,
): ReadinessStatus | 'INCOMPLETE' {
  if (score === null) {
    return 'INCOMPLETE';
  }

  if (score >= READINESS_THRESHOLDS.READY) {
    return 'READY';
  }

  if (score >= READINESS_THRESHOLDS.NEARLY_READY) {
    return 'NEARLY_READY';
  }

  if (score >= READINESS_THRESHOLDS.DEVELOPING) {
    return 'DEVELOPING';
  }

  return 'NEEDS_PREPARATION';
}