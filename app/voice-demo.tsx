"use client";

import { GoogleGenAI } from "@google/genai";
import type { FunctionCall, LiveServerMessage, Session } from "@google/genai";
import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_AGENT_CONFIG, RAG_FUNCTION_NAME } from "@/lib/live-config";

type CallPhase = "ready" | "connecting" | "active" | "error";
type CallActivity = "listening" | "thinking" | "speaking";

type SessionToken = {
  accessToken: string;
  model: string;
  newSessionExpiresAt: number;
};

type TokenResponse = Partial<SessionToken> & { error?: string };

const IDLE_NUDGE_DELAY_MS = 12_000;
const USER_VOICE_RMS_THRESHOLD = 0.018;
const IDLE_NUDGE_SENTINEL = "__RAQMIVA_SILENCE_CHECK__";

function hasVoiceActivity(buffer: ArrayBuffer) {
  const samples = new Int16Array(buffer);
  if (samples.length === 0) return false;

  let squaredTotal = 0;
  for (const rawSample of samples) {
    const sample = rawSample / 32768;
    squaredTotal += sample * sample;
  }

  return Math.sqrt(squaredTotal / samples.length) >= USER_VOICE_RMS_THRESHOLD;
}

function encodeAudioChunk(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return window.btoa(binary);
}

function microphoneErrorMessage(error: unknown) {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Microphone access needs HTTPS. Open the Render link, or run ngrok http 3000 and use its HTTPS URL.";
  }

  const name =
    error instanceof DOMException
      ? error.name
      : error instanceof Error
        ? error.name
        : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Allow microphone access for this site, then try again.";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Connect one and try again.";
  }

  if (error instanceof Error && error.message.includes("not configured")) {
    return "The voice demo is not configured yet. Please contact the Raqmiva team.";
  }

  return "We couldn't start the voice connection. Please try again in a moment.";
}

export default function VoiceDemo() {
  const [phase, setPhase] = useState<CallPhase>("ready");
  const [activity, setActivity] = useState<CallActivity>("listening");
  const [notice, setNotice] = useState("");

  const tokenRef = useRef<SessionToken | null>(null);
  const tokenRequestRef = useRef<Promise<SessionToken> | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const nextPlaybackTimeRef = useRef(0);
  const callActiveRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const setupCompleteRef = useRef(false);
  const greetingSentRef = useRef(false);
  const startGreetingRef = useRef<(() => void) | null>(null);
  const idleNudgeTimerRef = useRef<number | null>(null);
  const idleNudgeSentRef = useRef(false);
  const modelTurnCompleteRef = useRef(false);
  const knowledgeRequestInFlightRef = useRef(false);

  const clearIdleNudgeTimer = useCallback(() => {
    if (idleNudgeTimerRef.current !== null) {
      window.clearTimeout(idleNudgeTimerRef.current);
      idleNudgeTimerRef.current = null;
    }
  }, []);

  const noteCallerSpeech = useCallback(() => {
    if (!callActiveRef.current) return;

    idleNudgeSentRef.current = false;
    modelTurnCompleteRef.current = false;
    clearIdleNudgeTimer();
  }, [clearIdleNudgeTimer]);

  const scheduleIdleNudge = useCallback(() => {
    clearIdleNudgeTimer();
    if (!callActiveRef.current || !sessionRef.current || idleNudgeSentRef.current) {
      return;
    }

    const checkSilence = () => {
      idleNudgeTimerRef.current = null;
      if (
        !callActiveRef.current ||
        !sessionRef.current ||
        idleNudgeSentRef.current
      ) {
        return;
      }

      if (
        playbackSourcesRef.current.size > 0 ||
        knowledgeRequestInFlightRef.current ||
        !modelTurnCompleteRef.current
      ) {
        idleNudgeTimerRef.current = window.setTimeout(checkSilence, 1_000);
        return;
      }

      const session = sessionRef.current;
      if (!session) return;

      idleNudgeSentRef.current = true;
      modelTurnCompleteRef.current = false;
      setActivity("thinking");
      try {
        session.sendClientContent({
          turns: [
            {
              role: "user",
              parts: [{ text: IDLE_NUDGE_SENTINEL }],
            },
          ],
          turnComplete: true,
        });
      } catch {
        idleNudgeSentRef.current = false;
        modelTurnCompleteRef.current = true;
        setActivity("listening");
      }
    };

    idleNudgeTimerRef.current = window.setTimeout(
      checkSilence,
      IDLE_NUDGE_DELAY_MS,
    );
  }, [clearIdleNudgeTimer]);

  const prepareSessionToken = useCallback((): Promise<SessionToken> => {
    const cached = tokenRef.current;
    if (cached && cached.newSessionExpiresAt > Date.now() + 15_000) {
      return Promise.resolve(cached);
    }

    if (tokenRequestRef.current) return tokenRequestRef.current;

    const request = fetch("/api/live-token", {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as TokenResponse;
        if (!response.ok) {
          throw new Error(body.error || "The voice session could not be prepared.");
        }
        if (
          typeof body.accessToken !== "string" ||
          typeof body.model !== "string" ||
          typeof body.newSessionExpiresAt !== "number"
        ) {
          throw new Error("The voice session could not be prepared.");
        }

        return {
          accessToken: body.accessToken,
          model: body.model,
          newSessionExpiresAt: body.newSessionExpiresAt,
        };
      })
      .then((token) => {
        tokenRef.current = token;
        return token;
      })
      .finally(() => {
        if (tokenRequestRef.current === request) {
          tokenRequestRef.current = null;
        }
      });

    tokenRequestRef.current = request;
    return request;
  }, []);

  const clearPlayback = useCallback(() => {
    const context = audioContextRef.current;
    for (const source of playbackSourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // A source can finish between the interruption event and this cleanup.
      }
    }
    playbackSourcesRef.current.clear();
    nextPlaybackTimeRef.current = context?.currentTime ?? 0;
  }, []);

  const cleanupResources = useCallback(() => {
    callActiveRef.current = false;
    startGreetingRef.current = null;
    clearIdleNudgeTimer();
    idleNudgeSentRef.current = false;
    modelTurnCompleteRef.current = false;
    knowledgeRequestInFlightRef.current = false;

    const session = sessionRef.current;
    sessionRef.current = null;
    try {
      session?.close();
    } catch {
      // Closing an already-ended Live API connection is harmless.
    }

    clearPlayback();

    const captureNode = captureNodeRef.current;
    captureNodeRef.current = null;
    if (captureNode) {
      captureNode.port.onmessage = null;
      try {
        captureNode.disconnect();
      } catch {
        // The audio graph may already be closed.
      }
    }

    const microphoneSource = microphoneSourceRef.current;
    microphoneSourceRef.current = null;
    try {
      microphoneSource?.disconnect();
    } catch {
      // The audio graph may already be closed.
    }

    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());

    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  }, [clearIdleNudgeTimer, clearPlayback]);

  const finishConversation = useCallback(() => {
    stopRequestedRef.current = true;
    cleanupResources();
    setPhase("ready");
    setActivity("listening");
    setNotice("Conversation ended. Start again whenever you're ready.");
  }, [cleanupResources]);

  const playAudioChunk = useCallback((base64Audio: string, mimeType?: string) => {
    const context = audioContextRef.current;
    if (!context || context.state === "closed") return;

    try {
      const binary = window.atob(base64Audio);
      const byteLength = binary.length - (binary.length % 2);
      const bytes = new Uint8Array(byteLength);
      for (let index = 0; index < byteLength; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const view = new DataView(bytes.buffer);
      const samples = new Float32Array(byteLength / 2);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = view.getInt16(index * 2, true) / 32768;
      }

      if (samples.length === 0) return;

      const sampleRate = Number(/rate=(\d+)/i.exec(mimeType ?? "")?.[1]) || 24_000;
      const audioBuffer = context.createBuffer(1, samples.length, sampleRate);
      audioBuffer.getChannelData(0).set(samples);

      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);

      const startAt = Math.max(context.currentTime + 0.035, nextPlaybackTimeRef.current);
      nextPlaybackTimeRef.current = startAt + audioBuffer.duration;
      playbackSourcesRef.current.add(source);
      source.onended = () => {
        playbackSourcesRef.current.delete(source);
        source.disconnect();
        if (playbackSourcesRef.current.size === 0 && callActiveRef.current) {
          setActivity("listening");
          if (modelTurnCompleteRef.current) scheduleIdleNudge();
        }
      };
      source.start(startAt);
      setActivity("speaking");
    } catch {
      setNotice("Audio playback was interrupted. You can keep speaking or restart the demo.");
    }
  }, [scheduleIdleNudge]);

  const answerKnowledgeCalls = useCallback(async (calls: FunctionCall[]) => {
    const session = sessionRef.current;
    if (!session || !callActiveRef.current) return;

    clearIdleNudgeTimer();
    knowledgeRequestInFlightRef.current = true;
    modelTurnCompleteRef.current = false;
    setActivity("thinking");
    const responses = await Promise.all(
      calls.map(async (call) => {
        const name = call.name || RAG_FUNCTION_NAME;
        if (name !== RAG_FUNCTION_NAME) {
          return {
            id: call.id,
            name,
            response: { noApprovedMatch: true, matches: [] },
          };
        }

        const query =
          typeof call.args?.query === "string"
            ? call.args.query.trim().slice(0, 300)
            : "";

        try {
          const response = await fetch("/api/knowledge", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            cache: "no-store",
            body: JSON.stringify({ query }),
          });
          const result = (await response.json()) as Record<string, unknown>;

          return {
            id: call.id,
            name,
            response: response.ok
              ? result
              : { noApprovedMatch: true, matches: [] },
          };
        } catch {
          return {
            id: call.id,
            name,
            response: { noApprovedMatch: true, matches: [] },
          };
        }
      }),
    );

    if (sessionRef.current !== session || !callActiveRef.current) {
      if (sessionRef.current === session) {
        knowledgeRequestInFlightRef.current = false;
      }
      return;
    }

    knowledgeRequestInFlightRef.current = false;
    try {
      session.sendToolResponse({ functionResponses: responses });
    } catch {
      modelTurnCompleteRef.current = true;
      setActivity("listening");
      scheduleIdleNudge();
    }
  }, [clearIdleNudgeTimer, scheduleIdleNudge]);

  const handleLiveMessage = useCallback(
    (message: LiveServerMessage) => {
      if (message.setupComplete) {
        setupCompleteRef.current = true;
        startGreetingRef.current?.();
      }

      const content = message.serverContent;
      if (content?.interrupted) {
        clearIdleNudgeTimer();
        modelTurnCompleteRef.current = false;
        clearPlayback();
        setActivity("listening");
      }

      const parts = content?.modelTurn?.parts ?? [];
      if (parts.length > 0) {
        clearIdleNudgeTimer();
        modelTurnCompleteRef.current = false;
      }
      for (const part of parts) {
        const inlineData = part.inlineData;
        if (
          inlineData?.data &&
          inlineData.mimeType?.toLowerCase().startsWith("audio/")
        ) {
          playAudioChunk(inlineData.data, inlineData.mimeType);
        }
      }

      if (content?.turnComplete) {
        modelTurnCompleteRef.current = true;
        if (
          playbackSourcesRef.current.size === 0 &&
          !knowledgeRequestInFlightRef.current
        ) {
          setActivity("listening");
        }
        scheduleIdleNudge();
      }

      const functionCalls = message.toolCall?.functionCalls;
      if (functionCalls?.length) {
        void answerKnowledgeCalls(functionCalls);
      }
    },
    [
      answerKnowledgeCalls,
      clearIdleNudgeTimer,
      clearPlayback,
      playAudioChunk,
      scheduleIdleNudge,
    ],
  );

  const beginConversation = useCallback(async () => {
    if (
      phase === "connecting" ||
      phase === "active" ||
      (callActiveRef.current && !stopRequestedRef.current)
    ) {
      return;
    }

    if (typeof window === "undefined" || !window.isSecureContext) {
      setPhase("error");
      setNotice(microphoneErrorMessage(new Error("HTTPS is required")));
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setPhase("error");
      setNotice("This browser can't access a microphone. Try a current version of Chrome, Edge, or Safari.");
      return;
    }

    stopRequestedRef.current = false;
    setupCompleteRef.current = false;
    greetingSentRef.current = false;
    clearIdleNudgeTimer();
    idleNudgeSentRef.current = false;
    modelTurnCompleteRef.current = false;
    knowledgeRequestInFlightRef.current = false;
    callActiveRef.current = true;
    setPhase("connecting");
    setActivity("listening");
    setNotice("Allow microphone access when your browser asks.");

    try {
      // Start permission, API-token reuse, and audio activation together from
      // the click gesture. The actual Google Live session is opened only now.
      const tokenPromise = prepareSessionToken();
      const microphonePromise = navigator.mediaDevices
        .getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        })
        .then((stream) => {
          if (stopRequestedRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error("The voice session was cancelled.");
          }
          streamRef.current = stream;
          return stream;
        });
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const audioReadyPromise = audioContext.resume();

      const [token, stream] = await Promise.all([
        tokenPromise,
        microphonePromise,
        audioReadyPromise,
      ]);

      if (stopRequestedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      setNotice("Connecting to Raqmiva…");
      await audioContext.audioWorklet.addModule("/raqmiva-audio-processor.js");

      if (stopRequestedRef.current) return;

      const microphoneSource = audioContext.createMediaStreamSource(stream);
      const captureNode = new AudioWorkletNode(audioContext, "raqmiva-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      microphoneSourceRef.current = microphoneSource;
      captureNodeRef.current = captureNode;
      captureNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const session = sessionRef.current;
        if (!session || !callActiveRef.current) return;

        if (hasVoiceActivity(event.data)) noteCallerSpeech();
        try {
          session.sendRealtimeInput({
            audio: {
              data: encodeAudioChunk(event.data),
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } catch {
          // A queued worklet message can arrive just as the call is stopped.
        }
      };

      microphoneSource.connect(captureNode);
      captureNode.connect(audioContext.destination);

      const startGreeting = () => {
        const session = sessionRef.current;
        if (
          !session ||
          !setupCompleteRef.current ||
          greetingSentRef.current ||
          !callActiveRef.current ||
          stopRequestedRef.current
        ) {
          return;
        }

        greetingSentRef.current = true;
        setPhase("active");
        setActivity("speaking");
        setNotice("");

        try {
          session.sendClientContent({
            turns: [
              {
                role: "user",
                parts: [
                  {
                    text: "Begin the voice demo now. Introduce yourself as Raqmiva in a brief, warm Emirati Arabic greeting. Mention that I can speak Arabic or English, then ask how you can help. Do not ask me to select a language.",
                  },
                ],
              },
            ],
            turnComplete: true,
          });
        } catch {
          finishConversation();
          setPhase("error");
          setNotice("The voice connection ended before Raqmiva could greet you. Please retry.");
        }
      };
      startGreetingRef.current = startGreeting;

      const ai = new GoogleGenAI({
        apiKey: token.accessToken,
        httpOptions: { apiVersion: "v1beta" },
      });
      const session = await ai.live.connect({
        model: token.model,
        config: LIVE_AGENT_CONFIG,
        callbacks: {
          onmessage: handleLiveMessage,
          onerror: () => {
            if (!callActiveRef.current) return;
            stopRequestedRef.current = true;
            cleanupResources();
            setPhase("error");
            setNotice("The voice connection was interrupted. Check your connection and try again.");
          },
          onclose: () => {
            if (!callActiveRef.current) return;
            stopRequestedRef.current = true;
            cleanupResources();
            setPhase("error");
            setNotice("The voice connection ended. Tap to start a new conversation.");
          },
        },
      });

      if (stopRequestedRef.current) {
        session.close();
        return;
      }

      sessionRef.current = session;
      if (setupCompleteRef.current) startGreetingRef.current?.();
    } catch (error) {
      if (stopRequestedRef.current) return;
      stopRequestedRef.current = true;
      cleanupResources();
      setPhase("error");
      setActivity("listening");
      setNotice(microphoneErrorMessage(error));
    }
  }, [
    cleanupResources,
    clearIdleNudgeTimer,
    finishConversation,
    handleLiveMessage,
    noteCallerSpeech,
    phase,
    prepareSessionToken,
  ]);

  const endConversation = useCallback(() => {
    if (phase === "connecting") {
      stopRequestedRef.current = true;
      cleanupResources();
      setPhase("ready");
      setNotice("Connection stopped.");
      return;
    }

    if (phase === "active") finishConversation();
  }, [cleanupResources, finishConversation, phase]);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) return;

    // Warm the short-lived, single-use token and cache the tiny audio worklet
    // while the landing screen is visible. No microphone or live session starts
    // until the visitor presses the button.
    void prepareSessionToken().catch(() => undefined);
    void fetch("/raqmiva-audio-processor.js", { cache: "force-cache" }).catch(
      () => undefined,
    );

    return () => {
      stopRequestedRef.current = true;
      cleanupResources();
    };
  }, [cleanupResources, prepareSessionToken]);

  const handleButtonClick = () => {
    if (phase === "active" || phase === "connecting") {
      endConversation();
      return;
    }

    setNotice("");
    void beginConversation();
  };

  const buttonLabel =
    phase === "active"
      ? "End conversation"
      : phase === "connecting"
        ? "Cancel connection"
        : phase === "error"
          ? "Try again"
          : "Start conversation";

  const statusText =
    phase === "connecting"
      ? notice || "Connecting to Raqmiva…"
      : phase === "active"
        ? activity === "speaking"
          ? "Raqmiva is speaking"
          : activity === "thinking"
            ? "One moment…"
            : "Listening · Arabic or English"
        : notice;

  return (
    <main className="demo-shell">
      <section className="demo-content" aria-label="Raqmiva voice demo">
        <div className="brand-mark" role="img" aria-label="Raqmiva demo">
          <svg
            className="brand-icon"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5.5 16c0-5.8 4.7-10.5 10.5-10.5S26.5 10.2 26.5 16 21.8 26.5 16 26.5"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M9.5 16a6.5 6.5 0 0 1 13 0v.2a6.5 6.5 0 0 1-6.5 6.3"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              opacity=".48"
            />
            <circle cx="16" cy="26" r="2" fill="currentColor" />
          </svg>
          <span className="brand-name">raqmiva</span>
          <span className="brand-demo">demo</span>
        </div>

        <button
          className={`conversation-button conversation-button--${phase}`}
          type="button"
          onClick={handleButtonClick}
          aria-label={buttonLabel}
          aria-pressed={phase === "active"}
          aria-busy={phase === "connecting"}
        >
          <span className="conversation-button__icon" aria-hidden="true">
            {phase === "active" ? (
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
              </svg>
            ) : phase === "connecting" ? (
              <span className="button-spinner" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none">
                <rect
                  x="9"
                  y="3"
                  width="6"
                  height="12"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </span>
        </button>

        <p className="visually-hidden" role="status" aria-live="polite">
          {statusText}
        </p>
      </section>
    </main>
  );
}
