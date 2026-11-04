# Vonage custom encoded-frame E2EE feasibility

## Recommendation

**Result B. Custom encoded-frame E2EE cannot be implemented on the public Vonage Video API JavaScript SDK without Vonage's built-in E2EE feature.**

The browser can encrypt encoded WebRTC frames. The installed Vonage SDK does not give application code the sender, the receiver, or any callback that runs on encoded frames before they reach the Media Router or before they are decoded. Vonage's own E2EE uses that pipeline internally and exposes it only as `encryptionSecret` / `Session.setEncryptionSecret()`. This POC does not call that API.

A two-browser call against Vonage Cloud was not executed. The environment has no `VONAGE_APPLICATION_ID` or `VONAGE_PRIVATE_KEY`. That missing call does not leave the public-API question open: a real `Publisher` instance was created, and its public members do not include an `RTCRtpSender` or `RTCPeerConnection`.

## Versions and environment

| Piece | Version |
| --- | --- |
| `@vonage/client-sdk-video` | 2.35.3 |
| `@vonage/media-processor` | 3.1.0 |
| `@vonage/server-sdk` | 3.30.1 |
| Next.js | 16.4.3 |
| Browser | Chrome 148.0.7778.280, Cursor Electron 42.11.16, macOS |

Public references:

- [Publisher](https://vonage.github.io/video-docs/video-js-reference/latest/Publisher.html)
- [Subscriber](https://vonage.github.io/video-docs/video-js-reference/latest/Subscriber.html)
- [End-to-end encryption](https://developer.vonage.com/en/video/guides/end-to-end-encryption/overview)
- [Media Processor](https://developer.vonage.com/en/video/guides/media-processor/web)
- [MDN encoded transforms](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_Encoded_Transforms)

## What was executed

`node scripts/audit-vonage-surface.mjs` read the installed packages and passed. It checked the public typedef, the client bundle, and the Media Processor bundle.

In Chrome, on `/vonage-e2ee-poc`:

1. Browser capability check.
2. Public member inspection of a `Publisher` created with `OT.initPublisher()` and a `Session` created with `OT.initSession()`. Underscore-prefixed members were ignored.
3. Passthrough attachment, which looked only for `getRtcPeerConnection()` or `getPeerConnection()`.
4. Custom encryption and incorrect-key actions, which stop when no transform can be attached.
5. `POST /api/vonage/session`, which returned HTTP 503 `Vonage application credentials are not configured.` The response contained no token.

`setEncryptionSecret()` was not called.

## Comparison

| Experiment | API support | Test result | Evidence | Conclusion |
| --- | --- | --- | --- | --- |
| Browser encoded transforms | `RTCRtpScriptTransform`, `RTCRtpSender.transform`, and `RTCRtpReceiver.transform` exist in this Chrome | Executed. All three were present, plus Web Crypto, Worker, WebCodecs, and `MediaStreamTrackProcessor` | POC log, 30 Oct 2026 | Supported and verified. This is the browser, not Vonage |
| Vonage sender access | No public `RTCRtpSender` or `RTCPeerConnection` accessor | Executed on a Publisher instance. Sender access was no. `getRtcStatsReport` exists and returns stats, not a sender | Runtime inspection plus `opentok.d.ts` | Unsupported by public API |
| Vonage receiver access | Subscriber typedef has `getRtcStatsReport` and media-processor connectors, not an `RTCRtpReceiver` | A Subscriber instance was not created, because that requires a remote stream and a Vonage session | `opentok.d.ts` audit. Runtime receiver stayed unverified | Unsupported by public API |
| Outgoing transform | Attachment needs a public sender | Executed. No accessor was found, so nothing was attached | Passthrough test log | Unsupported by public API |
| Incoming transform | Attachment needs a public receiver | Not attached. No Subscriber and no public accessor | Same passthrough run | Unsupported by public API |
| Passthrough encoded frames | Requires the transform to be attached | Encoded frames were not observed | Worker at `public/vonage-passthrough-worker.js` was not started | Unsupported by public API |
| Custom encryption | Gated on a supported transform | Not started. No plaintext fallback was added | Enable test E2EE log | Unsupported by public API |
| Custom decryption | Same gate | Not started | Incorrect-key log | Unsupported by public API |
| Routed-session compatibility | `createSession({ mediaMode: ROUTED })` is the server path | Not executed against Vonage Cloud. The route returned 503 without credentials | `src/app/api/vonage/session/route.ts` | Unsupported by public API for custom encoded frames. A live routed call was not tested |
| WebCodecs alternative | Browser has `VideoEncoder` and `VideoDecoder`. Publisher `videoSource` is `string \| null \| boolean \| MediaStreamTrack` | Typedef audit executed. No `EncodedVideoChunk` parameter exists | `opentok.d.ts` | Unsupported by public API |

## Experiment notes

### A. Browser

This Chrome can attach an `RTCRtpScriptTransform` to an `RTCRtpSender` or `RTCRtpReceiver` when application code holds those objects. That result does not mean Vonage hands those objects over.

### B. Publisher and Subscriber

Public Publisher members confirmed on a live instance include `getRtcStatsReport`, `getVideoSource`, and `setVideoMediaProcessorConnector`. They do not include `getRtcPeerConnection`, `getPeerConnection`, `getSenders`, or `getReceivers`.

`Session.setEncryptionSecret` is present. The client bundle also contains `RTCRtpScriptTransform`, and that use sits inside Vonage's own encryption path. The supported way to enter that path is the built-in secret, which is the paid E2EE add-on. Application code cannot supply its own worker or cipher through a documented hook.

The public typedef contains none of these names: `RTCRtpSender`, `RTCRtpReceiver`, `RTCPeerConnection`, `RTCRtpScriptTransform`, `RTCEncodedVideoFrame`, `RTCEncodedAudioFrame`, `EncodedVideoChunk`.

`getRtcStatsReport()` is the documented WebRTC stats handle. It does not return a sender or receiver, so it cannot host a transform.

### C. Encryption

No cipher was applied. There was no encoded frame to encrypt, and the POC does not fall back to unencrypted media or to a made-up frame format. Performance numbers were not collected.

### D. Media Processor

`@vonage/media-processor` 3.1.0 transforms `VideoFrame | AudioData`. The bundle checks `instanceof VideoFrame`, reads `displayWidth` / `displayHeight`, and can construct a `VideoFrame` from a canvas. It contains no `RTCEncodedVideoFrame` and no `RTCRtpScriptTransform`.

That pipeline uses `MediaStreamTrackProcessor` on the raw track. On a publisher, the result is encoded afterwards by the normal Vonage encoder. Encrypting pixels there would be compressed again and is not encoded-frame E2EE. On a subscriber, the processor runs on frames that have already been decoded, so it cannot see a protected payload before the decoder.

Blur, background replacement, and other visual effects are the supported use of this API.

### E. WebCodecs

`VideoEncoder` can produce `EncodedVideoChunk` values in this browser. `OT.initPublisher()` accepts a device id, a boolean, or a `MediaStreamTrack`. It does not accept an encoded chunk. `Session.publish()` publishes a `Publisher`. There is no public method that sends arbitrary encrypted payloads through the Vonage audio/video path.

A separate WebSocket would leave Vonage's audio/video pipeline. That was not treated as a successful integration.

Putting encrypted bytes into a canvas and publishing them as a camera would make the Media Router encode those pixels as ordinary video. The subscriber would decode a picture of ciphertext, not an encoded VP8, H.264, or Opus frame. That is not encoded-frame E2EE.

## Why a MediaStream is not enough

`Publisher.getVideoSource().track` and `getAudioSource()` return raw `MediaStreamTrack` objects. Those tracks are the camera and microphone before encoding. Encoded-frame E2EE has to run after the codec and before the packet is handed to the Media Router, then again after the packet arrives and before the remote decoder. The public SDK does not expose that point.

## What remains unknown

These items were not tested, and they do not change the public-API conclusion:

- A connected two-browser routed call, because Vonage credentials are not configured.
- A real `Subscriber` instance. Its public typedef matches the Publisher finding: stats and raw-frame processors, no receiver transform.
- Private SDK fields. They were not enumerated and are not a supported integration.

Questions for Vonage engineering, against JavaScript SDK 2.35.3 or any newer public release:

1. Which public Publisher or Subscriber method returns `RTCRtpSender`, `RTCRtpReceiver`, or `RTCPeerConnection`, or accepts an application `RTCRtpScriptTransform`?
2. Can a Subscriber deliver `RTCEncodedVideoFrame` or `RTCEncodedAudioFrame` to application code before decoding?
3. Can a Publisher accept an `EncodedVideoChunk`, or any already encrypted encoded payload, instead of a `MediaStreamTrack`?
