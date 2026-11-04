export type Tri = "yes" | "no" | "unverified";

export type BrowserCapabilities = {
  encodedTransforms: boolean;
  webCrypto: boolean;
  worker: boolean;
  senderTransform: boolean;
  receiverTransform: boolean;
  webCodecsVideo: boolean;
  webCodecsAudio: boolean;
  mediaStreamTrackProcessor: boolean;
};

export type SdkSurface = {
  publisherMethods: string[];
  subscriberMethods: string[];
  sessionMethods: string[];
  senderAccess: boolean;
  receiverAccess: boolean;
  builtInEncryptionSecret: boolean;
  mediaProcessorConnector: boolean;
  statsReportOnly: boolean;
  subscriberInspected: boolean;
  builtInBrowserSupport: boolean | null;
};

const ENCODED_HOOK = /^(getRtcPeerConnection|getPeerConnection|getSenders|getReceivers)$/;

export function readBrowserCapabilities(): BrowserCapabilities {
  return {
    encodedTransforms: typeof RTCRtpScriptTransform !== "undefined",
    webCrypto: typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined",
    worker: typeof Worker !== "undefined",
    senderTransform: typeof RTCRtpSender !== "undefined" && "transform" in RTCRtpSender.prototype,
    receiverTransform: typeof RTCRtpReceiver !== "undefined" && "transform" in RTCRtpReceiver.prototype,
    webCodecsVideo: typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined",
    webCodecsAudio: typeof AudioEncoder !== "undefined" && typeof AudioDecoder !== "undefined",
    mediaStreamTrackProcessor: "MediaStreamTrackProcessor" in globalThis,
  };
}

function publicMemberNames(target: object) {
  const names = new Set<string>();
  let current: object | null = target;
  while (current && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === "constructor" || name.startsWith("_")) continue;
      names.add(name);
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return [...names].sort();
}

function exposesTransport(target: object) {
  const names = publicMemberNames(target);
  if (names.some((name) => ENCODED_HOOK.test(name))) return true;
  const record = target as Record<string, unknown>;
  return names.some((name) => {
    const value = record[name];
    return value instanceof RTCPeerConnection || value instanceof RTCRtpSender || value instanceof RTCRtpReceiver;
  });
}

export async function inspectSdkSurface(): Promise<SdkSurface> {
  const { default: OT } = await import("@vonage/client-sdk-video");
  const holder = document.createElement("div");
  const publisher = OT.initPublisher(holder, {
    insertMode: "append",
    width: "1px",
    height: "1px",
    publishAudio: false,
    videoSource: null,
  });
  const session = OT.initSession("00000000", "2_MX4feasibility");
  let subscriberMethods: string[] = [];
  let subscriberInspected = false;
  try {
    const subscriberHolder = document.createElement("div");
    const subscriber = session.subscribe(
      {
        connection: { connectionId: "inspect" },
        videoType: "camera",
      } as unknown as Parameters<OT.Session["subscribe"]>[0],
      subscriberHolder,
    );
    subscriberMethods = publicMemberNames(subscriber);
    subscriberInspected = subscriberMethods.length > 0;
    session.unsubscribe(subscriber);
  } catch {
    subscriberMethods = [];
    subscriberInspected = false;
  }

  const publisherMethods = publicMemberNames(publisher);
  const sessionMethods = publicMemberNames(session);
  publisher.destroy();
  void session.disconnect();

  const senderAccess = exposesTransport(publisher);
  const receiverAccess = subscriberMethods.some((name) => ENCODED_HOOK.test(name));

  return {
    publisherMethods,
    subscriberMethods,
    sessionMethods,
    senderAccess,
    receiverAccess,
    builtInEncryptionSecret: sessionMethods.includes("setEncryptionSecret"),
    mediaProcessorConnector: publisherMethods.includes("setVideoMediaProcessorConnector"),
    statsReportOnly: publisherMethods.includes("getRtcStatsReport") && !senderAccess,
    subscriberInspected,
    builtInBrowserSupport:
      typeof OT.hasEndToEndEncryptionSupport === "function" ? OT.hasEndToEndEncryptionSupport() : null,
  };
}

export function readPublicPeerConnection(target: object): RTCPeerConnection | null {
  const record = target as Record<string, unknown>;
  for (const name of ["getRtcPeerConnection", "getPeerConnection"] as const) {
    const value = record[name];
    if (typeof value !== "function") continue;
    const result = (value as () => unknown).call(target);
    if (result instanceof RTCPeerConnection) return result;
  }
  return null;
}

export const CUSTOM_ENCRYPTION_BLOCKED =
  "Custom encoded-frame encryption was not started. The public Vonage Publisher and Subscriber APIs do not return an RTCRtpSender or RTCRtpReceiver, so a custom RTCRtpScriptTransform cannot be attached.";
