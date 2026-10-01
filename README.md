# Raqmiva — Bilingual AI Receptionist Demo

A minimal, white-screen voice demo based on the supplied **Receptionist PDF**. Visitors press one button, hear Raqmiva introduce itself in a warm Emirati/Gulf Arabic greeting, and can then speak naturally in Arabic or English. The agent follows mid-conversation language switches without showing a language picker.

## What is implemented

- **Low-latency voice:** the browser streams 16 kHz microphone audio directly to Gemini Live over a secure WebSocket and plays streamed 24 kHz speech. Render issues a short-lived, single-use token; the permanent Google API key stays server-side.
- **Automatic Arabic/English switching:** no language selector or menu prompt. The first greeting is in Emirati Arabic, then Raqmiva follows the caller's language.
- **PDF-grounded RAG:** approved excerpts are indexed in memory and searched locally with a small BM25-style retriever. Core facts are preloaded into the session; only narrow source-specific questions call the retriever, so greetings and common language/demo questions don't wait for lookup and no separate embedding API or vector database is in the response path.
- **One-button UI:** the same icon button starts and ends the conversation. The landing screen shows only the Raqmiva demo brand and that control; no transcript, key field, settings panel, or language picker is shown.
- **Gentle silence check-in:** if the caller stays silent for about 12 seconds after Raqmiva finishes speaking, it gives one brief follow-up in the caller's last language. The session remains open and listening; it does not repeat the nudge until the caller speaks again.
- **Demo guardrails:** the sample Al Noor Clinic times in the PDF are treated as role-play only. The running demo does not have a live calendar, phone transfer, CRM, or SMS/WhatsApp integration, so Raqmiva must not claim it booked a real appointment, transferred a caller, or sent a message.
- **HTTPS microphone testing:** Next.js is bound to `0.0.0.0`, and dev origins include ngrok and the Arena preview host.

> **Latency note:** retrieval improves grounding; RAG itself does not make model generation faster. This demo avoids an extra embedding/vector-service round trip and only retrieves for factual questions. Voice/audio remains on the direct browser-to-Gemini path.

## Credential safety — do this before publishing

The supplied `key.png` is a screenshot containing a Google AI Studio API credential and is tracked in the repository. Treat that credential as exposed: **revoke it in Google AI Studio and create a fresh key before deployment.** Do not reuse the screenshot key. The app does not serve `key.png` as a web asset and does not include a Google API key in browser code.

Set the replacement key only as the server environment variable `GEMINI_API_KEY`. Never use a `NEXT_PUBLIC_` variable, commit the key, put it in the page, or ask demo visitors to enter it. The browser receives only a one-use, short-lived Live API token constrained to the configured model and session settings.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

1. In Google AI Studio, revoke the exposed screenshot key and create a fresh Gemini API key with Live API access.
2. Copy `.example.env` to `.env.local` (`Copy-Item .example.env .env.local` in PowerShell) and place the new key in `GEMINI_API_KEY` there. `.example.env` is a template only and is not auto-loaded.
3. Install and start the app:

   ```bash
   npm ci
   npm run dev
   ```

4. Open `http://localhost:3000` and press **Start conversation**. Browsers permit microphone access on localhost; otherwise use the HTTPS tunnel below.

### Test through ngrok

In one terminal, start the app:

```bash
npm run dev
```

In a second terminal, start an HTTPS tunnel:

```bash
ngrok http 3000
```

Open the **HTTPS** forwarding URL ngrok prints (not the local HTTP URL), allow microphone access, and press **Start conversation**. The allowed dev origins include common ngrok domains. Keep the terminal running while testing.

The first visit pre-warms a short-lived session token and the audio worklet. The browser still waits for the visitor's click before asking for microphone permission or opening a Live API session, as required by browser privacy/autoplay policies.

## Deploy to Render

Deploy as a **Node Web Service**, not a static site: the app needs server-side routes to mint constrained tokens and run local RAG.

1. **Rotate the exposed key first.** In Google AI Studio, revoke the credential shown in `key.png` and create a replacement key. Do not paste the replacement into source files or commit it.
2. Push your clean, locally authored feature branch to **your own repository**. In Render, choose **New → Web Service** and connect that repository and branch. The selected branch must contain `@google/genai` in `package.json`; if Render logs show an older `main` commit, change the service's deploy branch before retrying.
3. Set the service options:
   - **Runtime:** Node
   - **Build command:** `npm ci && npm run build`
   - **Start command:** `npm start`
   - **Health check path:** `/api/health`
   - **Region:** choose one close to your audience. Browser audio connects directly to Google; Render only serves the UI, issues the session token, and answers local knowledge lookups.
4. In the Render service's **Environment** tab, add:
   - `GEMINI_API_KEY` — the newly created key, entered as a secret value.
   - `GEMINI_LIVE_MODEL` — optional; defaults to `gemini-3.8-live`.
5. Create the Web Service and wait for the build and deploy to finish. Open the generated `https://…onrender.com` URL, allow microphone access, and test both Arabic and English, including a mid-call switch.
6. Share only the demo URL with clients. No API-key field is shown to visitors.

**Render plan and first-click speed:** Free web services spin down after 15 minutes without traffic and can take about a minute to wake. Use an always-on paid instance for a client-facing demo that should respond consistently on the first visit. See [Render's free-service limits](https://render.com/docs/free) and [Next.js deployment guide](https://render.com/docs/deploy-nextjs-app).

## Deployment configuration

| Setting | Value |
| --- | --- |
| Render service type | Web Service |
| Runtime | Node |
| Build | `npm ci && npm run build` |
| Start | `npm start` |
| Health check | `/api/health` |
| Required secret | `GEMINI_API_KEY` |
| Optional model | `GEMINI_LIVE_MODEL` (defaults to `gemini-3.8-live`) |

## Useful commands

```bash
npm run dev        # Development server, reachable through ngrok
npm run lint       # ESLint
npm run typecheck  # TypeScript validation
npm run build      # Production build
npm start          # Production server (uses Render's PORT)
```

## Notes for a public demo

- The token endpoint and local knowledge route have lightweight in-process rate limits. They are suitable for a small single-instance demo, not a substitute for distributed abuse controls. Add a shared rate limiter/CAPTCHA before scaling a high-traffic public launch.
- Audio is sent from the visitor's browser directly to Gemini Live; this app does not proxy, persist, or log microphone audio or transcripts.
- The supplied PDF is a demonstration specification, not a real business knowledge base. Add approved business-specific hours, location, prices, and policies before presenting a client-specific receptionist.
