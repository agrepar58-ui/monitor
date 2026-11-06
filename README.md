# CAMERA MONITOR PRO — consent-based demo

This demo lets an invited person explicitly start camera sharing and visible one-photo-per-second capture.
The visitor sees a clear consent notice, a live preview, a capture counter, and a stop button.
The admin sees the live WebRTC stream and photos saved to the server's `private_uploads` folder.

## Requirements
- Node.js 18+
- HTTPS hosting with WebSocket support
- Set `ADMIN_PIN` to a private secret of at least 10 characters

## Run locally
`npm install`
`ADMIN_PIN="use-a-long-private-secret" npm start`
Open `http://localhost:3000/admin`.

## Deploy
Deploy this folder/repository to a Node.js host (for example Render).
Build command: `npm install`
Start command: `npm start`
Environment variable: `ADMIN_PIN` = a long private secret.
Use the host-provided HTTPS URL and open `/admin`.

## Important
- Explicit informed consent and browser camera permission are required.
- This demo takes at most one still image per second only while the consent page is open and sharing is active.
- Device model and Android version are not reliably exposed by mobile browsers; only available browser/platform hints are shown.
- Images are stored on the server disk in `private_uploads`; ephemeral hosting may delete local files on restart/redeploy. Use durable private object storage for production.
- The private image route uses the admin PIN as a query parameter for demo convenience; this is not production-grade access control.
- STUN-only WebRTC can fail on some networks; production may need TURN.
- This is a starter demo, not security-audited. Do not use secretly or without consent.
