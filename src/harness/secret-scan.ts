const SECRET_PATTERNS: RegExp[] = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[a-zA-Z0-9]{20,}\b/,
  /\bghp_[a-zA-Z0-9]{20,}\b/,
  /\bgho_[a-zA-Z0-9]{20,}\b/,
  /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/i,
  /\bBearer\s+[a-zA-Z0-9._-]{20,}\b/,
  /\bapi[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9._-]{12,}/i,
  /\bpassword\s*[:=]\s*['"]?[^\s'"]{8,}/i,
];

const FORBIDDEN_PATH_PATTERNS: RegExp[] = [
  /^\.env$/,
  /^\.env\./,
  /\/\.env$/,
  /\/\.env\./,
  /credentials\.json$/i,
  /secrets?\./i,
];

export interface SecretScanResult {
  secretsDetected: boolean;
  hits: string[];
}

export const isForbiddenCredentialPath = (changedPath: string): boolean =>
  FORBIDDEN_PATH_PATTERNS.some((pattern) => pattern.test(changedPath));

export const scanTextForSecrets = (text: string, label: string): string[] => {
  const hits: string[] = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      hits.push(`${label}: matched ${pattern.source}`);
    }
  }
  return hits;
};

export const scanChangedPathsForSecrets = (input: {
  changedPaths: string[];
  diffText?: string;
}): SecretScanResult => {
  const hits: string[] = [];
  for (const changedPath of input.changedPaths) {
    if (isForbiddenCredentialPath(changedPath)) {
      hits.push(`forbidden path: ${changedPath}`);
    }
  }
  if (input.diffText) {
    hits.push(...scanTextForSecrets(input.diffText, 'diff'));
  }
  return {
    secretsDetected: hits.length > 0,
    hits,
  };
};
