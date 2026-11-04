import { readFileSync } from "node:fs";

const clientPkg = JSON.parse(
  readFileSync("node_modules/@vonage/client-sdk-video/package.json", "utf8"),
);
const processorPkg = JSON.parse(
  readFileSync("node_modules/@vonage/media-processor/package.json", "utf8"),
);
const serverPkg = JSON.parse(readFileSync("node_modules/@vonage/server-sdk/package.json", "utf8"));

const dts = readFileSync("node_modules/@vonage/client-sdk-video/dist/js/opentok.d.ts", "utf8");
const bundle = readFileSync("node_modules/@vonage/client-sdk-video/dist/js/opentok.js", "utf8");
const processorTypes = readFileSync(
  "node_modules/@vonage/media-processor/dist/types/lib/src/core/pipeline.d.ts",
  "utf8",
);
const processorBundle = readFileSync(
  "node_modules/@vonage/media-processor/dist/media-processor.es.js",
  "utf8",
);

const forbiddenInPublicTypes = [
  "RTCRtpSender",
  "RTCRtpReceiver",
  "RTCPeerConnection",
  "RTCRtpScriptTransform",
  "EncodedVideoChunk",
  "RTCEncodedVideoFrame",
  "RTCEncodedAudioFrame",
];

const requiredPublicApi = [
  "setEncryptionSecret",
  "getRtcStatsReport",
  "setVideoMediaProcessorConnector",
  "setAudioMediaProcessorConnector",
  "getVideoSource",
  "getAudioSource",
  "hasEndToEndEncryptionSupport",
  "videoSource?: string | null | boolean | MediaStreamTrack",
];

const failures = [];
for (const token of forbiddenInPublicTypes) {
  if (dts.includes(token)) failures.push(`Public typedef contains ${token}`);
}
for (const token of requiredPublicApi) {
  if (!dts.includes(token)) failures.push(`Public typedef is missing ${token}`);
}
if (!processorTypes.includes("transform(data: VideoFrame | AudioData")) {
  failures.push("Media Processor types do not declare a VideoFrame | AudioData transform");
}
if (!processorBundle.includes("instanceof VideoFrame")) {
  failures.push("Media Processor bundle does not check VideoFrame");
}
if (processorBundle.includes("RTCEncodedVideoFrame") || processorBundle.includes("RTCRtpScriptTransform")) {
  failures.push("Media Processor bundle contains an encoded-frame transform API");
}
if (!bundle.includes("RTCRtpScriptTransform")) {
  failures.push("Client bundle does not contain Vonage's internal encoded transform");
}

const report = {
  versions: {
    client: clientPkg.version,
    mediaProcessor: processorPkg.version,
    server: serverPkg.version,
  },
  publicTypedefOmitsEncodedHooks: forbiddenInPublicTypes.every((token) => !dts.includes(token)),
  builtInEncryptionSecretPresent: dts.includes("setEncryptionSecret"),
  mediaProcessorFrameType: "VideoFrame | AudioData",
  publisherVideoSource: "string | null | boolean | MediaStreamTrack",
  internalBundleUsesScriptTransform: bundle.includes("RTCRtpScriptTransform"),
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exit(1);
