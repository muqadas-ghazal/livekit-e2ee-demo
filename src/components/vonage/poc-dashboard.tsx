"use client";

import { useRef, useState } from "react";
import type OT from "@vonage/client-sdk-video";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CUSTOM_ENCRYPTION_BLOCKED,
  inspectSdkSurface,
  readBrowserCapabilities,
  readPublicPeerConnection,
  type BrowserCapabilities,
  type SdkSurface,
  type Tri,
} from "@/lib/vonage/experiments";
import { formatClock, redactSecrets } from "@/lib/utils";

type LogLevel = "info" | "success" | "warning" | "error";

type LogEntry = {
  id: number;
  at: Date;
  level: LogLevel;
  message: string;
};

type Diagnostics = {
  browserEncodedTransforms: Tri;
  vonageSender: Tri;
  vonageReceiver: Tri;
  outgoingTransform: Tri;
  incomingTransform: Tri;
  framesObserved: Tri;
  customEncryption: Tri;
  customDecryption: Tri;
};

const INITIAL_DIAGNOSTICS: Diagnostics = {
  browserEncodedTransforms: "unverified",
  vonageSender: "unverified",
  vonageReceiver: "unverified",
  outgoingTransform: "unverified",
  incomingTransform: "unverified",
  framesObserved: "unverified",
  customEncryption: "unverified",
  customDecryption: "unverified",
};

const TRI_LABEL: Record<Tri, string> = {
  yes: "Yes",
  no: "No",
  unverified: "Unverified",
};

function triVariant(value: Tri): "success" | "secondary" | "destructive" {
  if (value === "yes") return "success";
  if (value === "no") return "destructive";
  return "secondary";
}

function isSessionPayload(value: unknown): value is {
  apiKey: string;
  sessionId: string;
  token: string;
  mediaMode?: string;
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.apiKey === "string" &&
    typeof record.sessionId === "string" &&
    typeof record.token === "string" &&
    (record.mediaMode === undefined || typeof record.mediaMode === "string")
  );
}

function safeError(error: unknown) {
  if (error instanceof Error) return redactSecrets(error.message);
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return redactSecrets(error.message);
  }
  return "The Vonage request failed.";
}

export function VonagePoc() {
  const [name, setName] = useState("");
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [status, setStatus] = useState("Idle");
  const [sessionId, setSessionId] = useState("Not connected");
  const [mediaMode, setMediaMode] = useState("Not requested");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>(INITIAL_DIAGNOSTICS);
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [surface, setSurface] = useState<SdkSurface | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasPublisher, setHasPublisher] = useState(false);

  const logId = useRef(0);
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const publisherRef = useRef<OT.Publisher | null>(null);
  const subscriberRef = useRef<OT.Subscriber | null>(null);
  const sessionRef = useRef<OT.Session | null>(null);
  const workerRef = useRef<Worker | null>(null);

  function appendLog(level: LogLevel, message: string) {
    const entry: LogEntry = {
      id: logId.current + 1,
      at: new Date(),
      level,
      message: redactSecrets(message),
    };
    logId.current = entry.id;
    setLogs((current) => [...current.slice(-199), entry]);
  }

  function resetExperiment() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setDiagnostics(INITIAL_DIAGNOSTICS);
    setCapabilities(null);
    setSurface(null);
    setLogs([]);
    appendLog("info", "Experiment state reset. The call, if connected, was left running.");
  }

  function runCapabilityCheck() {
    appendLog("info", "Test A started. This checks the browser only. It does not prove Vonage exposes senders or receivers.");
    const next = readBrowserCapabilities();
    setCapabilities(next);
    setDiagnostics((current) => ({
      ...current,
      browserEncodedTransforms: next.encodedTransforms && next.senderTransform && next.receiverTransform ? "yes" : "no",
    }));
    appendLog(
      next.encodedTransforms && next.senderTransform && next.receiverTransform ? "success" : "warning",
      `Test A result: encoded transforms ${next.encodedTransforms ? "present" : "missing"}, sender transform ${next.senderTransform ? "present" : "missing"}, receiver transform ${next.receiverTransform ? "present" : "missing"}, Web Crypto ${next.webCrypto ? "present" : "missing"}.`,
    );
  }

  async function runSurfaceCheck() {
    setBusy("surface");
    appendLog(
      "info",
      "Test B started. Inspecting public Publisher and Session members from @vonage/client-sdk-video. Names that start with an underscore are ignored.",
    );
    try {
      const next = await inspectSdkSurface();
      setSurface(next);
      setDiagnostics((current) => ({
        ...current,
        vonageSender: next.senderAccess ? "yes" : "no",
        vonageReceiver: next.subscriberInspected ? (next.receiverAccess ? "yes" : "no") : "unverified",
      }));
      appendLog(
        "warning",
        `Test B result: sender access ${next.senderAccess ? "yes" : "no"} on a Publisher instance. Receiver access ${next.subscriberInspected ? (next.receiverAccess ? "yes" : "no") : "unverified because no Subscriber instance was created"}. getRtcStatsReport ${next.statsReportOnly ? "exists and does not return a sender" : "was absent"}. setEncryptionSecret ${next.builtInEncryptionSecret ? "exists and was not called" : "was absent"}. setVideoMediaProcessorConnector ${next.mediaProcessorConnector ? "exists" : "was absent"}.`,
      );
    } catch (error) {
      appendLog("error", `Test B failed: ${safeError(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function ensurePublisher() {
    if (publisherRef.current) return publisherRef.current;
    const element = localRef.current;
    if (!element) throw new Error("The local video container is not ready.");
    const { default: OT } = await import("@vonage/client-sdk-video");
    const publisher = OT.initPublisher(element, {
      insertMode: "append",
      width: "100%",
      height: "100%",
      name: name.trim() || "Participant",
    });
    publisherRef.current = publisher;
    setHasPublisher(true);
    publisher.on("accessDenied", () => {
      appendLog("error", "Camera or microphone permission was denied.");
    });
    return publisher;
  }

  async function runPassthrough() {
    setBusy("passthrough");
    appendLog(
      "info",
      "Passthrough test started. A transform is attached only when a public RTCPeerConnection accessor exists. Expected result when that accessor is missing: outgoing and incoming transforms stay off, and no encoded frames are observed.",
    );
    try {
      const publisher = await ensurePublisher();
      const outgoing = readPublicPeerConnection(publisher);
      const incoming = subscriberRef.current ? readPublicPeerConnection(subscriberRef.current) : null;
      if (!outgoing && !incoming) {
        setDiagnostics((current) => ({
          ...current,
          outgoingTransform: "no",
          incomingTransform: "no",
          framesObserved: "no",
        }));
        const source = publisher.getVideoSource();
        const rawTrack = source.track instanceof MediaStreamTrack;
        appendLog(
          "warning",
          `Passthrough result: no public sender or receiver. Local video source is ${rawTrack ? "a raw MediaStreamTrack" : "not an attached track yet"}. Encoded frames were not observed.`,
        );
        return;
      }

      const worker = new Worker("/vonage-passthrough-worker.js");
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{ type?: string; count?: number; message?: string }>) => {
        if (event.data?.type === "frame") {
          setDiagnostics((current) => ({ ...current, framesObserved: "yes" }));
          appendLog("success", `Passthrough worker observed encoded frames. Count ${event.data.count ?? 0}.`);
        }
        if (event.data?.type === "error") {
          appendLog("error", event.data.message || "Encoded transform failed.");
        }
      };

      if (outgoing) {
        const sender = outgoing.getSenders().find((item) => item.track) ?? outgoing.getSenders()[0];
        if (sender && "transform" in sender) {
          sender.transform = new RTCRtpScriptTransform(worker, { direction: "outgoing" });
          setDiagnostics((current) => ({ ...current, outgoingTransform: "yes" }));
          appendLog("success", "Outgoing passthrough transform attached.");
        }
      }
      if (incoming) {
        const receiver = incoming.getReceivers().find((item) => item.track) ?? incoming.getReceivers()[0];
        if (receiver && "transform" in receiver) {
          receiver.transform = new RTCRtpScriptTransform(worker, { direction: "incoming" });
          setDiagnostics((current) => ({ ...current, incomingTransform: "yes" }));
          appendLog("success", "Incoming passthrough transform attached.");
        }
      }
    } catch (error) {
      appendLog("error", `Passthrough test failed: ${safeError(error)}`);
    } finally {
      setBusy(null);
    }
  }

  function refuseCustomEncryption(kind: "matching" | "mismatched") {
    appendLog(
      "info",
      kind === "matching"
        ? "Custom encryption test started. It runs only after a supported encoded-frame transform is attached."
        : "Incorrect-key test started. It runs only after a supported encoded-frame transform is attached.",
    );
    setDiagnostics((current) => ({
      ...current,
      customEncryption: "no",
      customDecryption: "no",
    }));
    appendLog("warning", `Result: ${CUSTOM_ENCRYPTION_BLOCKED}`);
  }

  async function join() {
    const participantName = name.trim();
    if (!participantName) {
      appendLog("error", "Enter a participant name.");
      return;
    }
    setBusy("join");
    setStatus("Requesting session");
    appendLog(
      "info",
      sessionIdInput.trim()
        ? "Joining an existing Vonage session. The encryption secret is not sent."
        : "Starting a new routed Vonage session. The encryption secret is not sent.",
    );
    try {
      const response = await fetch("/api/vonage/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantName, sessionId: sessionIdInput.trim() }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "The Vonage session request failed.";
        setStatus("Idle");
        appendLog("error", message);
        return;
      }
      if (!isSessionPayload(data)) {
        setStatus("Idle");
        appendLog("error", "The Vonage session response was incomplete.");
        return;
      }

      const { apiKey, sessionId: nextSessionId, token } = data;
      setSessionId(nextSessionId);
      setSessionIdInput(nextSessionId);
      setMediaMode(data.mediaMode === "routed" ? "Routed" : "Returned by server");
      setStatus("Connecting");
      const { default: OT } = await import("@vonage/client-sdk-video");
      const session = OT.initSession(apiKey, nextSessionId);
      sessionRef.current = session;
      session.on("streamCreated", (event) => {
        if (event.stream.connection.connectionId === session.connection?.connectionId) return;
        const target = remoteRef.current;
        if (!target) return;
        subscriberRef.current = session.subscribe(event.stream, target, {
          insertMode: "append",
          width: "100%",
          height: "100%",
        });
        appendLog("success", "Remote stream subscribed.");
      });
      session.on("streamDestroyed", () => {
        subscriberRef.current = null;
        appendLog("info", "Remote stream ended.");
      });

      await new Promise<void>((resolve, reject) => {
        session.connect(token, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      const publisher = await ensurePublisher();
      await new Promise<void>((resolve, reject) => {
        session.publish(publisher, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      setStatus("Connected");
      appendLog("success", "Connected and publishing. Vonage built-in encryptionSecret was not set.");
    } catch (error) {
      setStatus("Idle");
      appendLog("error", safeError(error));
    } finally {
      setBusy(null);
    }
  }

  function leave() {
    const session = sessionRef.current;
    const publisher = publisherRef.current;
    workerRef.current?.terminate();
    workerRef.current = null;
    if (session && publisher) session.unpublish(publisher);
    publisher?.destroy();
    session?.disconnect();
    publisherRef.current = null;
    subscriberRef.current = null;
    sessionRef.current = null;
    setHasPublisher(false);
    if (localRef.current) localRef.current.replaceChildren();
    if (remoteRef.current) remoteRef.current.replaceChildren();
    setStatus("Idle");
    setSessionId("Not connected");
    setMediaMode("Not requested");
    setMicEnabled(true);
    setCameraEnabled(true);
    appendLog("info", "Left the Vonage session.");
  }

  function toggleMic() {
    const publisher = publisherRef.current;
    if (!publisher) return;
    const next = !micEnabled;
    publisher.publishAudio(next);
    setMicEnabled(next);
    appendLog("info", next ? "Microphone enabled." : "Microphone muted.");
  }

  function toggleCamera() {
    const publisher = publisherRef.current;
    if (!publisher) return;
    const next = !cameraEnabled;
    publisher.publishVideo(next);
    setCameraEnabled(next);
    appendLog("info", next ? "Camera enabled." : "Camera disabled.");
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>Routed Vonage session. Credentials stay on the server.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="participant-name">Participant name</Label>
              <Input
                id="participant-name"
                value={name}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-id">Session ID</Label>
              <Input
                id="session-id"
                value={sessionIdInput}
                autoComplete="off"
                placeholder="Empty starts a new session"
                onChange={(event) => setSessionIdInput(event.target.value)}
              />
            </div>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{status}</dd>
              <dt className="text-muted-foreground">Session</dt>
              <dd className="break-all">{sessionId}</dd>
              <dt className="text-muted-foreground">Media mode</dt>
              <dd>{mediaMode}</dd>
            </dl>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void join()} disabled={busy !== null || status === "Connected"}>
                Join Call
              </Button>
              <Button type="button" variant="destructive" onClick={leave} disabled={status !== "Connected" && !hasPublisher}>
                Leave Call
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Video</CardTitle>
            <CardDescription>Local camera and the other participant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Local</p>
                <div ref={localRef} className="aspect-video overflow-hidden rounded-lg bg-muted" />
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Remote</p>
                <div ref={remoteRef} className="aspect-video overflow-hidden rounded-lg bg-muted" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onMouseDown={(event) => event.preventDefault()} onClick={toggleMic} disabled={!hasPublisher}>
                {micEnabled ? "Mute microphone" : "Unmute microphone"}
              </Button>
              <Button type="button" variant="secondary" onMouseDown={(event) => event.preventDefault()} onClick={toggleCamera} disabled={!hasPublisher}>
                {cameraEnabled ? "Turn camera off" : "Turn camera on"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Encoded transform diagnostics</CardTitle>
          <CardDescription>Values stay Unverified until that test runs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["Browser supports encoded transforms", diagnostics.browserEncodedTransforms],
                ["Vonage exposes sender access", diagnostics.vonageSender],
                ["Vonage exposes receiver access", diagnostics.vonageReceiver],
                ["Outgoing transform attached", diagnostics.outgoingTransform],
                ["Incoming transform attached", diagnostics.incomingTransform],
                ["Encoded frames observed", diagnostics.framesObserved],
                ["Custom encryption tested", diagnostics.customEncryption],
                ["Custom decryption tested", diagnostics.customDecryption],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <dt className="text-sm">{label}</dt>
                <dd>
                  <Badge variant={triVariant(value)}>{TRI_LABEL[value]}</Badge>
                </dd>
              </div>
            ))}
          </dl>
          {capabilities ? (
            <p className="text-sm text-muted-foreground">
              Web Crypto {capabilities.webCrypto ? "yes" : "no"}. Worker {capabilities.worker ? "yes" : "no"}. WebCodecs video {capabilities.webCodecsVideo ? "yes" : "no"}. MediaStreamTrackProcessor {capabilities.mediaStreamTrackProcessor ? "yes" : "no"}.
              {surface
                ? ` Built-in E2EE browser support ${surface.builtInBrowserSupport === null ? "unknown" : surface.builtInBrowserSupport ? "yes" : "no"}. That check is Vonage's own feature, and this page does not call it.`
                : ""}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={runCapabilityCheck} disabled={busy !== null}>
              Run browser capability check
            </Button>
            <Button type="button" variant="secondary" onClick={() => void runSurfaceCheck()} disabled={busy !== null}>
              Inspect Vonage public API
            </Button>
            <Button type="button" variant="secondary" onClick={() => void runPassthrough()} disabled={busy !== null}>
              Run passthrough transform test
            </Button>
            <Button type="button" variant="secondary" onClick={() => refuseCustomEncryption("matching")} disabled={busy !== null}>
              Enable test E2EE
            </Button>
            <Button type="button" variant="secondary" onClick={() => refuseCustomEncryption("mismatched")} disabled={busy !== null}>
              Test incorrect key
            </Button>
            <Button type="button" variant="outline" onClick={resetExperiment} disabled={busy !== null}>
              Reset experiment
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnostic log</CardTitle>
          <CardDescription>Keys, tokens, and media payloads are omitted.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/40 [overflow-anchor:none]">
            <ol className="space-y-1 p-3 font-mono text-xs">
              {logs.length === 0 ? (
                <li className="text-muted-foreground">No events yet.</li>
              ) : (
                logs.map((entry) => (
                  <li key={entry.id}>
                    [{formatClock(entry.at)}] {entry.level.toUpperCase()} {entry.message}
                  </li>
                ))
              )}
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
