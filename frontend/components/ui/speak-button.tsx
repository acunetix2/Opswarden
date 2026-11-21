"use client";

import { Loader2, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { fetchSpeech } from "@/lib/speech";
import { useAppSelector, useToast, useWorkspace } from "@/store/hooks";

// Only one thing reads aloud at a time across the app.
let current: { audio: HTMLAudioElement; stop: () => void } | null = null;

interface SpeakButtonProps {
  text: string;
  label?: string;
  className?: string;
  /** Icon-only round button (chat bubbles) or labelled text button (cards). */
  compact?: boolean;
}

/** Reads `text` aloud through the backend text-to-speech endpoint. Click again to stop. */
export function SpeakButton({ text, label = "Listen", className, compact }: SpeakButtonProps) {
  const token = useAppSelector((s) => s.session.token);
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const urlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function cleanup() {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    audioRef.current = null;
    setState("idle");
  }

  function stop() {
    audioRef.current?.pause();
    if (current?.audio === audioRef.current) current = null;
    cleanup();
  }

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function play() {
    current?.stop();
    setState("loading");
    try {
      const blob = await fetchSpeech(token, workspace.id, text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      urlRef.current = url;
      audioRef.current = audio;
      current = { audio, stop };
      audio.onended = () => {
        if (current?.audio === audio) current = null;
        cleanup();
      };
      await audio.play();
      setState("playing");
    } catch (err) {
      cleanup();
      toast("danger", "Couldn't read this aloud", toAppError(err).message);
    }
  }

  const busy = state === "loading";
  const playing = state === "playing";
  const action = playing ? "Stop reading" : busy ? "Preparing audio" : label;

  return (
    <button
      type="button"
      onClick={() => (playing ? stop() : busy ? undefined : void play())}
      aria-label={action}
      title={action}
      aria-pressed={playing}
      className={cn(
        "pressable inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink",
        compact ? "rounded-full p-1" : "rounded-[8px] border border-line px-2.5 py-1 text-[12px] font-medium hover:border-line-strong",
        playing && "text-brand-ink",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : playing ? (
        <Square className="size-3 fill-current" aria-hidden />
      ) : (
        <Volume2 className="size-3.5" aria-hidden />
      )}
      {compact ? null : <span>{playing ? "Stop" : busy ? "Preparing…" : label}</span>}
    </button>
  );
}
