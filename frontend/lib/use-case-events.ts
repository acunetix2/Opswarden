"use client";

import { useEffect, useState } from "react";

import { API_URL, opswardenApi } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import type { CaseStreamEvent } from "./types";

// The run ends after the follow-up step (letters, emails, closing clean cases) reports.
const TERMINAL = new Set(["automation.completed", "analysis.failed"]);

/** Parses `text/event-stream` frames out of a growing buffer. */
function takeFrames(buffer: string): { frames: { event: string; data: string }[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames = parts
    .map((block) => {
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data.push(line.slice(6));
      }
      return { event, data: data.join("\n") };
    })
    .filter((f) => f.data);
  return { frames, rest };
}

/**
 * Streams GET /cases/{id}/events while `active`. Uses fetch (not EventSource)
 * so the bearer token goes in a header instead of the URL.
 */
export function useCaseEvents(caseId: string, active: boolean, since: string | undefined) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.session.token);
  const [events, setEvents] = useState<CaseStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!active || !token) return;
    const controller = new AbortController();
    setEvents([]);

    const refresh = () =>
      dispatch(
        opswardenApi.util.invalidateTags([
          { type: "Case", id: caseId },
          { type: "CaseData", id: caseId },
          { type: "CaseDocuments", id: caseId },
          "Extraction",
          "CaseList",
          "Overview",
          "Suppliers",
          "WorkspaceDocuments",
          "Activity",
          "Notifications",
        ]),
      );

    (async () => {
      const qs = since ? `?since=${encodeURIComponent(since)}` : "";
      try {
        const res = await fetch(`${API_URL}/api/v1/cases/${caseId}/events${qs}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;
        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = takeFrames(buffer);
          buffer = rest;
          for (const f of frames) {
            if (f.event === "stream.end") return;
            let parsed: CaseStreamEvent;
            try {
              parsed = JSON.parse(f.data) as CaseStreamEvent;
            } catch {
              continue;
            }
            setEvents((prev) => (prev.some((p) => p.created_at === parsed.created_at && p.type === parsed.type) ? prev : [...prev, parsed]));
            if (TERMINAL.has(parsed.type)) {
              refresh();
              controller.abort();
              return;
            }
          }
        }
      } catch {
        /* aborted or network error: the page's polling fallback finishes the job */
      } finally {
        setConnected(false);
      }
    })();

    return () => controller.abort();
  }, [caseId, active, since, token, dispatch]);

  return { events, connected };
}
