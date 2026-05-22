import { runCiSmoke, type CiSmokeResult } from './ci-smoke.js';
import {
  verifyAcceptanceEvidence,
  type AcceptanceEvidenceCheckResult,
} from './acceptance-evidence-check.js';

export interface RepoChecksResult {
  smoke: CiSmokeResult;
  acceptance: AcceptanceEvidenceCheckResult;
  ok: boolean;
}

export const runRepoChecks = async (options: {
  runsRoot: string;
  smokeVersion?: string;
  skipAcceptanceEvidence?: boolean;
  acceptanceVersions?: readonly string[];
}): Promise<RepoChecksResult> => {
  const smoke = await runCiSmoke({ version: options.smokeVersion });

  const acceptance = options.skipAcceptanceEvidence
    ? {
        runsRoot: options.runsRoot,
        versions: [],
        ok: true,
      }
    : await verifyAcceptanceEvidence({
        runsRoot: options.runsRoot,
        ...(options.acceptanceVersions ? { versions: options.acceptanceVersions } : {}),
      });

  return {
    smoke,
    acceptance,
    ok: smoke.ok && acceptance.ok,
  };
};
