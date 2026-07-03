import { describe, expect, it } from "vitest";

import {
  detectSensitiveText,
  redactSensitiveObject,
  redactSensitiveText,
  summarizeSensitiveFindings
} from "../src/index";

describe("policy redaction", () => {
  it("detects and redacts known secret shapes without exposing the original value", () => {
    const token = "sm_TESTTOKENabcdefghijklmnopqrstuvwxyz123456";
    const value = `Captured token ${token}`;
    const authorization = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890";
    const redacted = redactSensitiveText(value);
    const redactedAuthorization = redactSensitiveText(authorization);

    expect(detectSensitiveText(value)).toHaveLength(1);
    expect(redacted.value).toContain("[redacted:submind-token:");
    expect(redacted.value).not.toContain(token);
    expect(redactedAuthorization.value).toContain("Bearer [redacted:authorization:");
    expect(redactedAuthorization.value).not.toContain("abcdefghijklmnopqrstuvwxyz1234567890");
  });

  it("reveals only explicitly selected redaction fingerprints", () => {
    const selectedToken = "sm_SELECTEDTOKENabcdefghijklmnopqrstuvwxyz123456";
    const otherToken = "sm_OTHERTOKENabcdefghijklmnopqrstuvwxyz123456";
    const value = `Captured ${selectedToken} and ${otherToken}.`;
    const findings = detectSensitiveText(value);
    const selectedFingerprint = findings.find((finding) =>
      value.slice(finding.start, finding.end).includes("SELECTEDTOKEN")
    )?.fingerprint;

    expect(selectedFingerprint).toBeTruthy();

    const redacted = redactSensitiveText(value, {
      revealFingerprints: selectedFingerprint ? [selectedFingerprint] : []
    });

    expect(redacted.value).toContain(selectedToken);
    expect(redacted.value).not.toContain(otherToken);
    expect(redacted.value).toContain("[redacted:submind-token:");
  });

  it("redacts credentials, local user paths, and emails inside nested objects", () => {
    const payload = {
      summary: "Contact addison@example.com about token=abc123456789",
      metadata: {
        path: "C:\\Users\\Addison\\OneDrive\\Documents\\SubMind",
        connection: "postgres://operator:superSecretPassword@localhost/submind"
      }
    };
    const redacted = redactSensitiveObject(payload);
    const summary = summarizeSensitiveFindings(payload);

    expect(redacted.summary).not.toContain("addison@example.com");
    expect(redacted.summary).not.toContain("abc123456789");
    expect(redacted.metadata.path).not.toContain("Addison");
    expect(redacted.metadata.connection).not.toContain("superSecretPassword");
    expect(summary.redactionCount).toBeGreaterThanOrEqual(4);
    expect(summary.kinds).toEqual(
      expect.arrayContaining([
        "connection_string_credential",
        "credential_assignment",
        "email_address",
        "local_user_path"
      ])
    );
  });
});
