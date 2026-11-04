import "server-only";

import { createHmac, randomBytes } from "node:crypto";

function signProjectJwt(apiKey: string, apiSecret: string, claims: Record<string, string>, ttlSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: apiKey,
      ist: "project",
      iat: now,
      exp: now + ttlSeconds,
      jti: randomBytes(12).toString("hex"),
      ...claims,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export async function createRoutedProjectSession(apiKey: string, apiSecret: string, participantName: string) {
  const response = await fetch("https://api.opentok.com/session/create", {
    method: "POST",
    headers: {
      "X-OPENTOK-AUTH": signProjectJwt(apiKey, apiSecret, {}, 3 * 60),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      archiveMode: "manual",
      "p2p.preference": "disabled",
    }),
  });

  const data: unknown = await response.json().catch(() => null);
  const sessionId =
    Array.isArray(data) && data[0] && typeof data[0] === "object" && "session_id" in data[0]
      ? data[0].session_id
      : null;
  if (!response.ok || typeof sessionId !== "string" || !sessionId) {
    throw new Error("Vonage did not create a session.");
  }

  const token = signProjectJwt(
    apiKey,
    apiSecret,
    {
      scope: "session.connect",
      role: "publisher",
      session_id: sessionId,
      connection_data: participantName,
      initial_layout_class_list: "",
    },
    60 * 60,
  );

  return { apiKey, sessionId, token, mediaMode: "routed" as const };
}

export async function createTokenForSession(
  apiKey: string,
  apiSecret: string,
  sessionId: string,
  participantName: string,
) {
  const token = signProjectJwt(
    apiKey,
    apiSecret,
    {
      scope: "session.connect",
      role: "publisher",
      session_id: sessionId,
      connection_data: participantName,
      initial_layout_class_list: "",
    },
    60 * 60,
  );

  return { apiKey, sessionId, token, mediaMode: "routed" as const };
}
