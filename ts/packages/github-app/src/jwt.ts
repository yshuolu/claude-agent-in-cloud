import { createSign } from "node:crypto";

/**
 * Generate an RS256-signed JWT for GitHub App authentication.
 * Uses node:crypto directly — no external JWT library needed.
 */
export function generateAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60, // Issued 60s in the past to allow for clock drift
    exp: now + 600, // Expires in 10 minutes (GitHub max)
    iss: appId,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(privateKey, "base64url");

  return `${signingInput}.${signature}`;
}

function base64url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
