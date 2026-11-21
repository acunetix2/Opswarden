/**
 * Voice helpers for Warden: record one spoken turn, transcribe it, and play replies.
 *
 * Recording stops on its own when the person stops talking (a short pause after
 * speech), so a conversation can run hands-free: listen, answer, listen again.
 */
import { toAppError, type AppError } from "./api-error";
import { API_URL } from "@/store/api";
import { fetchSpeech } from "./speech";

export interface RecordOptions {
  /** Give up if nobody starts talking within this time. */
  waitForSpeechMs?: number;
  /** Stop after this much quiet once speech has started. */
  silenceMs?: number;
  /** Hard cap for one turn. */
  maxMs?: number;
  /** Live input level 0..1, for a meter. */
  onLevel?: (level: number) => void;
  /** Called the moment speech is first detected. */
  onSpeechStart?: () => void;
  signal?: AbortSignal;
}

export interface Recording {
  blob: Blob;
  /** False when the turn ended without anyone speaking. */
  heardSpeech: boolean;
}

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function pickMime(): string {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/** Asks for the microphone once and keeps the stream for the whole conversation. */
export async function openMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (err) {
    const name = (err as DOMException)?.name;
    const message =
      name === "NotAllowedError" || name === "SecurityError"
        ? "Microphone access is blocked. Allow it in your browser's site settings, then try again."
        : name === "NotFoundError"
          ? "No microphone was found."
          : "The microphone couldn't be started.";
    throw { status: 0, code: "MIC_UNAVAILABLE", message } satisfies AppError;
  }
}

/** Records one turn from `stream`, ending automatically after the speaker pauses. */
export function recordTurn(stream: MediaStream, opts: RecordOptions = {}): Promise<Recording> {
  const { waitForSpeechMs = 8000, silenceMs = 1300, maxMs = 30000, onLevel, onSpeechStart, signal } = opts;
  return new Promise((resolve, reject) => {
    const mime = pickMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: BlobPart[] = [];
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    const started = performance.now();
    let noise = 0.01; // adapts to the room during the first moments
    let samples = 0;
    let speaking = false;
    let lastVoice = 0;
    let raf = 0;
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      onLevel?.(0);
      if (recorder.state !== "inactive") recorder.stop();
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      source.disconnect();
      void ctx.close();
      if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
      resolve({ blob: new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" }), heardSpeech: speaking });
    };
    signal?.addEventListener("abort", finish, { once: true });

    function tick() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (!speaking && samples < 20) {
        noise = (noise * samples + rms) / (samples + 1);
        samples++;
      }
      const threshold = Math.max(0.015, noise * 2.6);
      onLevel?.(Math.min(1, rms / 0.12));
      if (rms > threshold) {
        if (!speaking) onSpeechStart?.();
        speaking = true;
        lastVoice = now;
      }
      const elapsed = now - started;
      if ((!speaking && elapsed > waitForSpeechMs) || (speaking && now - lastVoice > silenceMs) || elapsed > maxMs) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    recorder.start(250);
    raf = requestAnimationFrame(tick);
  });
}

/** Sends a recording to the API and returns the transcript ("" when nothing was said). */
export async function transcribe(token: string | null, workspaceId: string, blob: Blob): Promise<string> {
  const type = blob.type.split(";")[0] || "audio/webm";
  const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("audio", new File([blob], `speech.${ext}`, { type }));
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/workspaces/${workspaceId}/assistant/transcribe`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw { status: 0, code: "NETWORK_ERROR", message: "Can't reach the OpsWarden API." } satisfies AppError;
  }
  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }
    throw toAppError({ status: res.status, data });
  }
  return ((await res.json()) as { text: string }).text;
}

/**
 * Reads `text` aloud and resolves when it finishes (or is stopped). Uses the
 * server voice when available, otherwise the browser's built-in voice.
 */
export async function speak(
  text: string,
  { token, workspaceId, serverVoice, signal }: { token: string | null; workspaceId: string; serverVoice: boolean; signal?: AbortSignal },
): Promise<void> {
  const spoken = text.replace(/https?:\/\/\S+/g, "").replace(/[*_#`>|]/g, "").trim();
  if (!spoken || signal?.aborted) return;

  if (serverVoice) {
    try {
      const blob = await fetchSpeech(token, workspaceId, spoken);
      if (signal?.aborted) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await new Promise<void>((resolve) => {
        const done = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        signal?.addEventListener("abort", () => {
          audio.pause();
          done();
        }, { once: true });
        audio.play().catch(done);
      });
      return;
    } catch {
      // Fall back to the browser voice below.
    }
  }

  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(spoken);
    u.rate = 1.03;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    signal?.addEventListener("abort", () => {
      window.speechSynthesis.cancel();
      resolve();
    }, { once: true });
    window.speechSynthesis.speak(u);
  });
}
