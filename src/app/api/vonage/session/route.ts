import { NextRequest, NextResponse } from "next/server";

import { createRoutedProjectSession, createTokenForSession } from "@/lib/vonage/project-session";

function participantName(body: unknown) {
  if (!body || typeof body !== "object" || !("participantName" in body)) return "";
  const value = body.participantName;
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.VONAGE_API_KEY?.trim();
  const apiSecret = process.env.VONAGE_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Vonage project API key and secret are not configured." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const name = participantName(body);
  if (!name || name.length > 64) {
    return NextResponse.json({ error: "Enter a participant name." }, { status: 400 });
  }

  const requestedSessionId =
    body && typeof body === "object" && "sessionId" in body && typeof body.sessionId === "string"
      ? body.sessionId.trim()
      : "";
  if (requestedSessionId && !/^[12]_MX[A-Za-z0-9+/=_-]{20,}$/.test(requestedSessionId)) {
    return NextResponse.json({ error: "That session ID is not valid." }, { status: 400 });
  }

  try {
    const session = requestedSessionId
      ? await createTokenForSession(apiKey, apiSecret, requestedSessionId, name)
      : await createRoutedProjectSession(apiKey, apiSecret, name);
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: "Unable to create a Vonage session." }, { status: 502 });
  }
}
