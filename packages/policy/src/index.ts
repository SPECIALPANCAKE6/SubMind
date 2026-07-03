export const starterSubagents = [
  "repo-explorer",
  "design-reviewer",
  "doc-researcher",
  "test-auditor"
] as const;

export type StarterSubagent = (typeof starterSubagents)[number];

export interface SubagentInvocationRequest {
  subagent: StarterSubagent;
  justification: string;
  proposedAction: "read" | "propose" | "execute";
}

export function requiresExecutionGate(
  request: SubagentInvocationRequest
): boolean {
  return request.proposedAction === "execute";
}

export type SensitiveFindingKind =
  | "api_token"
  | "authorization_header"
  | "credential_assignment"
  | "private_key"
  | "jwt"
  | "cloud_key"
  | "connection_string_credential"
  | "email_address"
  | "local_user_path";

export interface SensitiveFinding {
  kind: SensitiveFindingKind;
  label: string;
  start: number;
  end: number;
  fingerprint: string;
}

export interface SensitiveTextRedaction {
  value: string;
  findings: SensitiveFinding[];
  redactionCount: number;
}

export interface SensitiveScanSummary {
  redactionCount: number;
  kinds: SensitiveFindingKind[];
}

export interface SensitiveRedactionOptions {
  revealFingerprints?: Iterable<string>;
}

interface SensitivePattern {
  kind: SensitiveFindingKind;
  label: string;
  pattern: RegExp;
  valueGroup?: number;
}

const sensitivePatterns: SensitivePattern[] = [
  {
    kind: "private_key",
    label: "private-key",
    pattern:
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g
  },
  {
    kind: "authorization_header",
    label: "authorization",
    pattern: /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{16,})\b/g,
    valueGroup: 2
  },
  {
    kind: "api_token",
    label: "submind-token",
    pattern: /\bsm_[A-Za-z0-9_-]{32,}\b/g
  },
  {
    kind: "api_token",
    label: "openai-key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g
  },
  {
    kind: "cloud_key",
    label: "github-token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g
  },
  {
    kind: "cloud_key",
    label: "github-pat",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g
  },
  {
    kind: "cloud_key",
    label: "slack-token",
    pattern: /\bxox[aboprs]-[A-Za-z0-9-]{10,}\b/g
  },
  {
    kind: "cloud_key",
    label: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g
  },
  {
    kind: "jwt",
    label: "jwt",
    pattern:
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
  },
  {
    kind: "connection_string_credential",
    label: "connection-credential",
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s/]+)(@)/gi,
    valueGroup: 2
  },
  {
    kind: "credential_assignment",
    label: "credential",
    pattern:
      /\b([A-Za-z0-9_.-]*(?:api[_-]?key|token|secret|password|passwd|pwd|client[_-]?secret|private[_-]?key|access[_-]?key|session|cookie|jwt|credential)[A-Za-z0-9_.-]*\s*[:=]\s*["']?)([^\s"',;}{)]+)(["']?)/gi,
    valueGroup: 2
  },
  {
    kind: "email_address",
    label: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
  },
  {
    kind: "local_user_path",
    label: "local-user",
    pattern: /\b([A-Z]:[\\/]+Users[\\/]+)([^\\/:\s]+)(?=[\\/])/gi,
    valueGroup: 2
  }
];

function getPatternValueRange(
  value: string,
  match: RegExpExecArray,
  valueGroup: number | undefined
): { start: number; end: number } {
  if (!valueGroup) {
    return {
      start: match.index,
      end: match.index + match[0].length
    };
  }

  const matchedValue = match[valueGroup] ?? "";
  const valueStart = value.indexOf(matchedValue, match.index);

  return {
    start: valueStart,
    end: valueStart + matchedValue.length
  };
}

function hasMeaningfulSecretShape(value: string): boolean {
  if (value.length < 6) {
    return false;
  }

  if (/^(?:true|false|null|none|undefined|redacted|example|placeholder)$/i.test(value)) {
    return false;
  }

  return true;
}

function fingerprintSensitiveValue(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function fingerprintText(value: string): string {
  return fingerprintSensitiveValue(value);
}

function mergeFindings(findings: SensitiveFinding[]): SensitiveFinding[] {
  const sorted = [...findings].sort((left, right) =>
    left.start - right.start || right.end - left.end
  );
  const merged: SensitiveFinding[] = [];

  for (const finding of sorted) {
    const previous = merged.at(-1);

    if (previous && finding.start < previous.end) {
      if (finding.end > previous.end) {
        previous.end = finding.end;
      }

      continue;
    }

    merged.push({ ...finding });
  }

  return merged;
}

export function detectSensitiveText(value: string): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];

  for (const pattern of sensitivePatterns) {
    pattern.pattern.lastIndex = 0;

    for (const match of value.matchAll(pattern.pattern)) {
      const range = getPatternValueRange(value, match, pattern.valueGroup);

      if (range.start < 0 || range.end <= range.start) {
        continue;
      }

      const sensitiveValue = value.slice(range.start, range.end);

      if (!hasMeaningfulSecretShape(sensitiveValue)) {
        continue;
      }

      findings.push({
        kind: pattern.kind,
        label: pattern.label,
        start: range.start,
        end: range.end,
        fingerprint: fingerprintSensitiveValue(sensitiveValue)
      });
    }
  }

  return mergeFindings(findings);
}

function createRevealFingerprintSet(
  fingerprints: Iterable<string> | undefined
): Set<string> {
  return new Set([...(fingerprints ?? [])].map((fingerprint) => fingerprint.toLowerCase()));
}

export function redactSensitiveText(
  value: string,
  options: SensitiveRedactionOptions = {}
): SensitiveTextRedaction {
  const findings = detectSensitiveText(value);

  if (findings.length === 0) {
    return {
      value,
      findings: [],
      redactionCount: 0
    };
  }

  let cursor = 0;
  let redacted = "";
  const revealFingerprints = createRevealFingerprintSet(options.revealFingerprints);

  for (const finding of findings) {
    redacted += value.slice(cursor, finding.start);
    redacted += revealFingerprints.has(finding.fingerprint.toLowerCase())
      ? value.slice(finding.start, finding.end)
      : `[redacted:${finding.label}:${finding.fingerprint}]`;
    cursor = finding.end;
  }

  redacted += value.slice(cursor);

  return {
    value: redacted,
    findings,
    redactionCount: findings.length
  };
}

export function redactSensitiveObject<T>(
  value: T,
  options: SensitiveRedactionOptions = {}
): T {
  if (typeof value === "string") {
    return redactSensitiveText(value, options).value as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveObject(item, options)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactSensitiveObject(item, options)
      ])
    ) as T;
  }

  return value;
}

export function summarizeSensitiveFindings(value: unknown): SensitiveScanSummary {
  const kinds = new Set<SensitiveFindingKind>();
  let redactionCount = 0;

  function visit(item: unknown) {
    if (typeof item === "string") {
      const findings = detectSensitiveText(item);
      redactionCount += findings.length;

      for (const finding of findings) {
        kinds.add(finding.kind);
      }

      return;
    }

    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }

    if (item && typeof item === "object") {
      Object.values(item).forEach(visit);
    }
  }

  visit(value);

  return {
    redactionCount,
    kinds: [...kinds].sort()
  };
}
