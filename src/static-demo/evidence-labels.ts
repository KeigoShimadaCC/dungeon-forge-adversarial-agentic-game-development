import type { DashboardArtifactRef } from '../dashboard/types.js';
import type { VersionSummary } from '../harness/version-loop.js';
import type { StaticDemoEvidenceLabel } from './types.js';

export const acceptanceEvidenceLabel = (
  status: VersionSummary['acceptance_status'],
): StaticDemoEvidenceLabel => {
  if (status === 'accepted') {
    return 'accepted';
  }
  if (status === 'rejected') {
    return 'rejected';
  }
  if (status === 'blocked') {
    return 'blocked';
  }
  if (status === 'pending') {
    return 'partial';
  }
  return 'partial';
};

export const coverageEvidenceLabel = (
  status: VersionSummary['status'],
): StaticDemoEvidenceLabel => (status === 'complete' ? 'generated' : 'partial');

export const artifactEvidenceLabel = (artifact: DashboardArtifactRef): StaticDemoEvidenceLabel =>
  artifact.present ? 'generated' : 'missing';
