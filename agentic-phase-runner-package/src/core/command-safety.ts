export type CommandSafety = 'safe' | 'warn' | 'blocked';

export interface CommandSafetyFinding {
  pattern: string;
  severity: Exclude<CommandSafety, 'safe'>;
  message: string;
}

export interface CommandSafetyReport {
  command: string;
  status: CommandSafety;
  findings: CommandSafetyFinding[];
}

const blockedPatterns: Array<{ pattern: RegExp; label: string; message: string }> = [
  { pattern: /\brm\s+-[^\n;&|]*r[f]?[^\n;&|]*\s+\/(?:\s|$)/, label: 'rm-rf-root', message: 'Refuses recursive removal of filesystem root.' },
  { pattern: /\brm\s+-[^\n;&|]*r[f]?[^\n;&|]*\s+\.(?:\s|$)/, label: 'rm-rf-current-dir', message: 'Refuses recursive removal of the current directory.' },
  { pattern: /\bsudo\s+rm\b/, label: 'sudo-rm', message: 'Refuses sudo removal commands.' },
  { pattern: /\bmkfs(?:\s|$)/, label: 'mkfs', message: 'Refuses filesystem formatting commands.' },
  { pattern: /\bdd\s+if=/, label: 'dd-if', message: 'Refuses raw disk copy commands.' },
  { pattern: /\bchmod\s+-R\s+777\s+\/(?:\s|$)/, label: 'chmod-777-root', message: 'Refuses recursive world-writable chmod on root.' },
  { pattern: /\bcurl\b[\s\S]*\|\s*(?:sh|bash)\b/, label: 'curl-pipe-shell', message: 'Refuses piping downloaded content into a shell.' },
  { pattern: /\bwget\b[\s\S]*\|\s*(?:sh|bash)\b/, label: 'wget-pipe-shell', message: 'Refuses piping downloaded content into a shell.' },
  { pattern: /\bgit\s+push\b[^\n;&|]*--force(?:\s|$)/, label: 'git-push-force', message: 'Refuses force-push commands.' },
  { pattern: /\bgit\s+reset\s+--hard\b/, label: 'git-reset-hard', message: 'Refuses hard reset commands.' },
];

const warnPatterns: Array<{ pattern: RegExp; label: string; message: string }> = [
  { pattern: /\bsudo\b/, label: 'sudo', message: 'Command requires elevated privileges.' },
  { pattern: /\brm\b/, label: 'rm', message: 'Command removes files; review before execution.' },
  { pattern: /\bcurl\b|\bwget\b/, label: 'network-fetch', message: 'Command downloads remote content; review source and destination.' },
];

export const classifyCommandSafety = (command: string): CommandSafetyReport => {
  const findings: CommandSafetyFinding[] = [];
  for (const entry of blockedPatterns) {
    if (entry.pattern.test(command)) {
      findings.push({ pattern: entry.label, severity: 'blocked', message: entry.message });
    }
  }
  for (const entry of warnPatterns) {
    if (entry.pattern.test(command)) {
      findings.push({ pattern: entry.label, severity: 'warn', message: entry.message });
    }
  }
  return {
    command,
    status: findings.some((finding) => finding.severity === 'blocked')
      ? 'blocked'
      : findings.length > 0
        ? 'warn'
        : 'safe',
    findings,
  };
};

export const summarizeCommandSafety = (commands: string[]): CommandSafetyReport[] =>
  commands.map((command) => classifyCommandSafety(command)).filter((report) => report.status !== 'safe');

