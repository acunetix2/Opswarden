"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Mic, RotateCcw, SendHorizontal, SkipForward, Sparkles, Square, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { SpeakButton } from "@/components/ui/speak-button";
import { toAppError } from "@/lib/api-error";
import { answer, STARTER_SUGGESTIONS, type AssistantLink } from "@/lib/assistant";
import { cn } from "@/lib/cn";
import { placePanel } from "@/lib/panel-placement";
import { useDraggableDock } from "@/lib/use-draggable-dock";
import { openMicrophone, recordTurn, speak, transcribe, voiceSupported } from "@/lib/voice";
import { formatMoneyValue } from "@/lib/format";
import {
  useAllFindingsQuery,
  useApprovalsQuery,
  useAssistantChatMutation,
  useCasesQuery,
  useOverviewQuery,
  useSettingsQuery,
} from "@/store/api";
import { useAppSelector, useWorkspace } from "@/store/hooks";

import { WardenIcon } from "./warden-icon";

interface Message {
  id: number;
  from: "user" | "warden";
  text: string;
  links?: AssistantLink[];
  suggestions?: string[];
  ai?: boolean;
  /** The user said this out loud. */
  spoken?: boolean;
}

type VoiceState = "off" | "listening" | "hearing" | "transcribing" | "thinking" | "speaking";

const VOICE_LABEL: Record<Exclude<VoiceState, "off">, string> = {
  listening: "Listening. Go ahead and ask.",
  hearing: "Listening…",
  transcribing: "Got it…",
  thinking: "Thinking…",
  speaking: "Speaking. Tap Skip to interrupt.",
};

const GREETING: Omit<Message, "id"> = {
  from: "warden",
  text: "Hi, I'm Warden, OpsWarden's assistant. Ask me what needs your attention, look up a case, supplier or PO number, list high-severity findings or waiting approvals, or ask how to do anything. You can also tap the microphone and just talk.",
  suggestions: STARTER_SUGGESTIONS,
};

let nextId = 1;
/** Launcher button size in px (48px icon + padding + border). */
const LAUNCHER_SIZE = 62;

/**
 * Floating help assistant, bottom-right (above the mobile nav). Built-in
 * answers come from lib/assistant.ts using live workspace counts; questions it
 * can't answer go to the backend model when one is configured.
 */
export function Assistant() {
  const router = useRouter();
  const pathname = usePathname();
  const { workspace, user, can } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ ...GREETING, id: 0 }]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dockCtl = useDraggableDock("ow-warden-dock", LAUNCHER_SIZE);

  /*
   * Panel placement follows the button wherever it is: opens above it when
   * there's more room above, otherwise below; lines up with the button's side;
   * always fits on screen. Recomputed on open, while dragging and on resize.
   */
  const [placement, setPlacement] = useState<{ style: CSSProperties; origin: string } | null>(null);
  const place = useCallback(() => {
    const btn = launcherRef.current;
    if (!btn) return;
    const p = placePanel(btn.getBoundingClientRect(), window.innerWidth, window.innerHeight);
    const style: CSSProperties = {
      left: p.left,
      right: "auto",
      width: p.width,
      height: p.height,
      ...(p.up ? { bottom: p.bottom, top: "auto" } : { top: p.top, bottom: "auto" }),
    };
    setPlacement({ style, origin: `${p.up ? "origin-bottom" : "origin-top"}-${p.alignLeft ? "left" : "right"}` });
  }, []);

  const dragKey = JSON.stringify(dockCtl.style ?? null);
  useLayoutEffect(() => {
    if (open) place();
    else setPlacement(null);
  }, [open, place, dragKey]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, place]);

  // Live data Warden answers from. Fetched only once the panel is opened; shared with the pages' caches.
  const overview = useOverviewQuery({ workspaceId: workspace.id, days: 30 }, { skip: !open });
  const cases = useCasesQuery({ workspaceId: workspace.id }, { skip: !open });
  const findings = useAllFindingsQuery(workspace.id, { skip: !open });
  const approvals = useApprovalsQuery({ workspaceId: workspace.id }, { skip: !open });
  const { data: settings } = useSettingsQuery(workspace.id, { skip: !open });
  const [askModel] = useAssistantChatMutation();
  const aiOn = Boolean(settings?.llm_configured);
  const ttsOn = Boolean(settings?.tts_available);
  const token = useAppSelector((s) => s.session.token);
  const [micOk, setMicOk] = useState(false);
  useEffect(() => setMicOk(voiceSupported()), []);
  // Shown whenever the server can transcribe; disabled (with the reason) where the browser can't record.
  const voiceAvailable = aiOn && Boolean(settings?.stt_available);
  const micBlockedReason = micOk
    ? null
    : typeof window !== "undefined" && !window.isSecureContext
      ? "Voice needs a secure address. Open OpsWarden on https:// or localhost to talk to Warden."
      : "This browser can't record audio. Try a recent Chrome, Edge, Safari or Firefox.";

  // Voice conversation state. Refs keep the async loop reading current values.
  const [voice, setVoice] = useState<VoiceState>("off");
  const [level, setLevel] = useState(0);
  const voiceOnRef = useRef(false);
  const thinkingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const turnAbortRef = useRef<AbortController | null>(null);
  const speakAbortRef = useRef<AbortController | null>(null);
  const sendRef = useRef<((text: string, opts?: { voice?: boolean }) => Promise<string | null>) | null>(null);

  const toggle = useCallback((next?: boolean) => setOpen((o) => (next === undefined ? !o : next)), []);

  // Open from anywhere: keyboard shortcut "w" and the top bar button dispatch this event.
  useEffect(() => {
    const onOpen = () => toggle(true);
    window.addEventListener("ow:assistant", onOpen);
    return () => window.removeEventListener("ow:assistant", onOpen);
  }, [toggle]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  function push(m: Omit<Message, "id">) {
    setMessages((prev) => [...prev, { ...m, id: nextId++ }]);
  }

  /** Sends a message and returns Warden's reply text (used by voice mode to read it aloud). */
  async function send(text: string, opts: { voice?: boolean } = {}): Promise<string | null> {
    const q = text.trim();
    if (!q || thinkingRef.current) return null;
    thinkingRef.current = true;
    setDraft("");
    push({ from: "user", text: q, spoken: opts.voice });
    setThinking(true);
    const finish = (reply: string) => {
      thinkingRef.current = false;
      setThinking(false);
      return reply;
    };

    const m = overview.data?.metrics;
    const local = answer(q, {
      pathname,
      canCreate: can("create_case"),
      canReview: can("review_finding"),
      canApprove: can("decide_approval"),
      canManage: can("manage_workspace"),
      counts: m
        ? {
            pendingApprovals: m.pending_approvals,
            needsReview: m.needs_review,
            openCases: m.open_cases,
            openFindings: m.open_findings,
            exposure: m.exposure.map((e) => formatMoneyValue(e)).join(" + "),
          }
        : undefined,
      userId: user.id,
      cases: cases.data,
      findings: findings.data,
      approvals: approvals.data,
      lastLinks: [...messages].reverse().find((x) => x.from === "warden" && x.links?.length)?.links,
    });

    // Explicit "take me to …" / "open it" commands are actions, handled instantly here.
    // Every question goes to the model; built-in answers are only the offline fallback.
    if (aiOn && !local.navigate) {
      try {
        const history = messages
          .filter((x) => x.id !== 0)
          .slice(-10)
          .map((x) => ({ role: x.from === "user" ? ("user" as const) : ("assistant" as const), text: x.text.slice(0, 2500) }));
        const caseMatch = /^\/app\/investigations\/([^/]+)/.exec(pathname);
        const caseId = caseMatch && caseMatch[1] !== "new" ? caseMatch[1] : null;
        const res = await askModel({
          workspaceId: workspace.id,
          message: q.slice(0, 1000),
          history,
          pathname,
          case_id: caseId,
          voice: opts.voice,
        }).unwrap();
        if (res.reply) {
          push({ from: "warden", text: res.reply, ai: true, links: res.links });
          return finish(res.reply);
        }
      } catch {
        // Fall through to the built-in answer.
      }
    } else if (!aiOn) {
      // A short pause so the reply reads as a reply, not a flash.
      await new Promise((r) => window.setTimeout(r, 280));
    }

    const fallback = aiOn && !local.navigate ? `The AI model didn't answer just now, so here's the built-in answer.\n\n${local.text}` : local.text;
    push({ from: "warden", text: fallback, links: local.links, suggestions: local.suggestions });
    if (local.navigate && local.navigate !== pathname) router.push(local.navigate);
    return finish(local.text);
  }
  sendRef.current = send;

  // ---- Voice conversation ---------------------------------------------------------
  // Hands-free loop: listen until the person pauses, transcribe, answer, read the answer
  // aloud, then listen again. Ends on "stop"/"goodbye", two silent turns, or the End button.
  const STOP_WORDS = /^(stop|stop listening|that'?s all|that is all|goodbye|bye|bye warden|thanks,? that'?s all|end( conversation)?|never ?mind)[.!]?$/i;

  const stopVoice = useCallback(() => {
    voiceOnRef.current = false;
    turnAbortRef.current?.abort();
    speakAbortRef.current?.abort();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setVoice("off");
    setLevel(0);
  }, []);

  async function startVoice() {
    if (voiceOnRef.current) return;
    let stream: MediaStream;
    try {
      stream = await openMicrophone();
    } catch (err) {
      push({ from: "warden", text: toAppError(err).message });
      return;
    }
    streamRef.current = stream;
    voiceOnRef.current = true;
    let quietTurns = 0;

    while (voiceOnRef.current) {
      const turn = new AbortController();
      turnAbortRef.current = turn;
      setVoice("listening");
      let heard = "";
      try {
        const rec = await recordTurn(stream, { signal: turn.signal, onLevel: setLevel, onSpeechStart: () => setVoice("hearing") });
        if (!voiceOnRef.current) break;
        if (rec.heardSpeech) {
          setVoice("transcribing");
          heard = await transcribe(token, workspace.id, rec.blob);
        }
      } catch (err) {
        if (!voiceOnRef.current || (err as DOMException)?.name === "AbortError") break;
        push({ from: "warden", text: toAppError(err).message });
        break;
      }
      if (!voiceOnRef.current) break;

      if (!heard) {
        quietTurns += 1;
        if (quietTurns >= 2) {
          push({ from: "warden", text: "I didn't hear anything, so I've stopped listening. Tap the microphone to talk again." });
          break;
        }
        continue;
      }
      quietTurns = 0;

      if (STOP_WORDS.test(heard.trim())) {
        push({ from: "user", text: heard, spoken: true });
        push({ from: "warden", text: "Okay. Tap the microphone whenever you want to talk again." });
        await speak("Okay. Talk soon.", { token, workspaceId: workspace.id, serverVoice: ttsOn });
        break;
      }

      setVoice("thinking");
      const reply = await sendRef.current?.(heard, { voice: true });
      if (!voiceOnRef.current || !reply) continue;

      const speaking = new AbortController();
      speakAbortRef.current = speaking;
      setVoice("speaking");
      await speak(reply, { token, workspaceId: workspace.id, serverVoice: ttsOn, signal: speaking.signal });
    }
    stopVoice();
  }

  useEffect(() => {
    if (!open) stopVoice();
  }, [open, stopVoice]);
  useEffect(() => stopVoice, [stopVoice]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  }

  const last = messages[messages.length - 1];

  const panelStyle: CSSProperties | undefined = placement?.style;

  return (
    <div className="print:hidden">
      {open ? (
        <section
          role="dialog"
          aria-labelledby={titleId}
          onKeyDown={(e) => e.key === "Escape" && close()}
          style={panelStyle}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_24px_60px_rgb(17_17_17/0.22)]",
            "right-3 left-3 bottom-[calc(9rem+env(safe-area-inset-bottom))] h-[min(68vh,560px)]",
            "sm:left-auto sm:w-[25rem] lg:right-6 lg:bottom-24 lg:h-[min(72vh,600px)]",
            placement?.origin ?? "origin-bottom-right",
            // Hidden for the first frame until it has measured where the button is.
            !placement && "invisible",
            "motion-safe:animate-[ow-panel-in_220ms_var(--ease-out)]",
          )}
        >
          <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 text-ink">
            <WardenIcon className="size-10 shrink-0" />
            <h2 id={titleId} className="min-w-0 flex-1 text-[15px] font-semibold leading-tight">Warden</h2>
            <button
              type="button"
              onClick={() => setMessages([{ ...GREETING, id: nextId++ }])}
              className="pressable rounded-[8px] p-1.5 text-ink-3 hover:bg-surface-muted hover:text-ink"
              aria-label="Start a new conversation"
              title="New conversation"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={close} className="pressable rounded-[8px] p-1.5 text-ink-3 hover:bg-surface-muted hover:text-ink" aria-label="Close assistant">
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-canvas px-4 py-4" aria-live="polite" aria-relevant="additions">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-2", m.from === "user" ? "justify-end" : "justify-start")}>
                {m.from === "warden" ? <WardenIcon animated={false} className="mt-0.5 size-6 shrink-0" tone="dark" /> : null}
                <div className={cn("max-w-[85%] space-y-2", m.from === "user" && "items-end")}>
                  <div
                    className={cn(
                      "whitespace-pre-line rounded-[12px] px-3 py-2 text-[13.5px] leading-relaxed",
                      m.from === "user" ? "rounded-br-[2px] bg-ink text-canvas" : "rounded-bl-[2px] border border-line bg-surface text-ink",
                    )}
                  >
                    {m.from === "warden" ? <span className="sr-only">Warden: </span> : <span className="sr-only">You{m.spoken ? " said" : ""}: </span>}
                    {m.spoken ? <Mic aria-hidden className="mr-1.5 inline size-3 -translate-y-px opacity-60" /> : null}
                    {m.text}
                    {m.from === "warden" && m.id !== 0 ? (
                      <span className="mt-1.5 flex items-center gap-1.5">
                        {m.ai ? (
                          <Badge tone="info" icon={<Sparkles />} className="h-[18px] px-1.5 text-[10px]">
                            AI answer
                          </Badge>
                        ) : null}
                        {ttsOn ? <SpeakButton text={m.text} label="Read aloud" compact className="ml-auto" /> : null}
                      </span>
                    ) : null}
                  </div>
                  {m.links?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {m.links.map((l) => (
                        <Link
                          key={l.href + l.label}
                          href={l.href}
                          className="pressable inline-flex max-w-full items-center gap-1 rounded-full border border-line-strong bg-surface px-3 py-1 text-[12.5px] font-medium text-ink hover:border-ink-3 hover:bg-canvas"
                        >
                          <span className="truncate">{l.label}</span>
                          <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {thinking ? (
              <div className="flex items-center gap-2" role="status">
                <WardenIcon className="size-6 shrink-0" tone="dark" />
                <span className="inline-flex gap-1 rounded-[8px] rounded-bl-[2px] border border-line bg-surface px-3 py-2.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 rounded-full bg-ink-3 motion-safe:animate-[ow-typing_1s_ease-in-out_infinite]" style={{ animationDelay: `${i * 140}ms` }} />
                  ))}
                  <span className="sr-only">Warden is typing</span>
                </span>
              </div>
            ) : null}
          </div>

          {last?.from === "warden" && last.suggestions?.length && !thinking ? (
            <div className="flex gap-1.5 overflow-x-auto border-t border-line bg-surface px-3 py-2">
              {last.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="pressable shrink-0 rounded-full border border-line-strong px-3 py-1 text-[12.5px] text-ink-2 hover:border-ink hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          {voice !== "off" ? (
            <div className="border-t border-line bg-surface p-3" role="region" aria-label="Voice conversation">
              <div className="flex items-center gap-3 rounded-[12px] border border-brand/30 bg-brand-tint/60 px-3 py-2.5">
                <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand text-on-brand">
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-brand/35 transition-transform duration-100"
                    style={{ transform: `scale(${1 + (voice === "hearing" || voice === "listening" ? level * 0.8 : voice === "speaking" ? 0.25 : 0)})` }}
                  />
                  <Mic className="relative size-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink" role="status" aria-live="polite">{VOICE_LABEL[voice]}</p>
                  <p className="text-[11.5px] text-ink-3">Say &ldquo;stop&rdquo; or &ldquo;goodbye&rdquo; to end, or keep talking.</p>
                </div>
                {voice === "speaking" ? (
                  <button
                    type="button"
                    onClick={() => speakAbortRef.current?.abort()}
                    className="pressable inline-flex items-center gap-1 rounded-[8px] border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink hover:border-ink-3"
                  >
                    <SkipForward className="size-3.5" aria-hidden /> Skip
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={stopVoice}
                  className="pressable inline-flex items-center gap-1 rounded-[8px] bg-ink px-2.5 py-1.5 text-[12px] font-medium text-canvas hover:bg-ink/85"
                >
                  <Square className="size-3 fill-current" aria-hidden /> End
                </button>
              </div>
            </div>
          ) : (
          <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-line bg-surface p-3">
            <label htmlFor="warden-input" className="sr-only">Message Warden</label>
            <textarea
              id="warden-input"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask Warden, or say “take me to approvals”"
              className="max-h-28 min-h-10 flex-1 resize-none rounded-[10px] border border-line bg-canvas px-3 py-2.5 text-[13.5px] text-ink placeholder:text-ink-3 focus-visible:border-ink-3 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(217_84_30/0.18)]"
            />
            {voiceAvailable ? (
              <button
                type="button"
                onClick={() => (micBlockedReason ? push({ from: "warden", text: micBlockedReason }) : void startVoice())}
                disabled={thinking}
                aria-label="Talk to Warden"
                title={micBlockedReason ?? "Talk to Warden"}
                className="btn grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-line-strong bg-surface text-ink hover:-translate-y-px hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Mic className="size-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!draft.trim() || thinking}
              aria-label="Send"
              className="btn grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-brand-strong bg-brand text-on-brand hover:-translate-y-px hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendHorizontal className="size-4" aria-hidden />
            </button>
          </form>
          )}
        </section>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => dockCtl.guardClick(() => toggle())}
        {...dockCtl.handlers}
        onDoubleClick={() => dockCtl.dock && dockCtl.reset()}
        style={dockCtl.style}
        aria-expanded={open}
        aria-label={`${open ? "Close Warden assistant" : "Open Warden assistant (W)"}. Drag to move it, or Alt and arrow keys.`}
        title={open ? "Close Warden" : "Ask Warden · drag to move, double-click to reset"}
        className={cn(
          "group fixed z-50 flex touch-none select-none items-center gap-0 rounded-full border border-line bg-surface p-1.5 text-ink shadow-[0_10px_30px_rgb(17_17_17/0.18)]",
          "right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:right-6 lg:bottom-6",
          dockCtl.dragging
            ? "scale-105 cursor-grabbing shadow-[0_18px_44px_rgb(17_17_17/0.28)]"
            : "cursor-grab transition-[translate,box-shadow,left,right,bottom,top] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5",
        )}
      >
        {!open ? <span aria-hidden className="ow-glow pointer-events-none absolute inset-0 rounded-full" /> : null}
        <span className="grid size-12 place-items-center">
          {open ? <X className="size-5" aria-hidden /> : <WardenIcon className="size-12" />}
        </span>
        <span
          aria-hidden
          className={cn(
            "max-w-0 overflow-hidden whitespace-nowrap text-[13.5px] font-medium opacity-0 transition-[max-width,opacity,padding] duration-300 ease-[var(--ease-out)]",
            !dockCtl.dragging &&
              "group-hover:max-w-32 group-hover:pr-3 group-hover:pl-1 group-hover:opacity-100 group-focus-visible:max-w-32 group-focus-visible:pr-3 group-focus-visible:pl-1 group-focus-visible:opacity-100",
          )}
        >
          {open ? "Close" : "Ask Warden"}
        </span>
      </button>
    </div>
  );
}
