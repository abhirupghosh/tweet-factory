import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { CLAY, INK, MUTED, ROSE, SAGE } from "./theme.ts";
import { searchPages, type NotionPage } from "../notion.ts";
import { notionTag } from "../commands/notion.ts";
import { listNotionPages, openDb } from "../db.ts";
import type { Ctx } from "../config.ts";

type Mode = "search" | "results" | "tagging";

function loadTagged(ctx: Ctx): { tag: string; title: string }[] {
  try {
    const db = openDb(ctx.paths.db, true);
    const rows = listNotionPages(db).map((p) => ({ tag: p.tag, title: p.title }));
    db.close();
    return rows;
  } catch {
    return [];
  }
}

export function NotionScreen({ ctx, onBack }: { ctx: Ctx; onBack: () => void }) {
  const hasKey = Boolean(ctx.env.NOTION_API_KEY);
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NotionPage[]>([]);
  const [idx, setIdx] = useState(0);
  const [tagInput, setTagInput] = useState("");
  const [status, setStatus] = useState("");
  const [tagged, setTagged] = useState(() => loadTagged(ctx));

  async function doSearch(q: string): Promise<void> {
    setStatus("searching…");
    try {
      const p = await searchPages(ctx.env, q);
      setResults(p);
      setIdx(0);
      setMode(p.length ? "results" : "search");
      setStatus(p.length ? `${p.length} results — ↑↓ select · t tag` : "no results");
    } catch (e) {
      setStatus("error: " + (e as Error).message);
    }
  }
  async function doTag(label: string): Promise<void> {
    const page = results[idx];
    if (!page || !label.trim()) return setMode("results");
    setStatus("tagging…");
    try {
      await notionTag(ctx, page.id, label.trim());
      setTagged(loadTagged(ctx));
      setStatus(`tagged "${page.title}" as [${label.trim()}]`);
    } catch (e) {
      setStatus("error: " + (e as Error).message);
    }
    setTagInput("");
    setMode("results");
  }

  useKeyboard((key) => {
    if (mode === "search" || mode === "tagging") return; // inputs own keys
    const k = key.name;
    if (k === "escape") return onBack();
    if (k === "up" || k === "k") setIdx((i) => Math.max(0, i - 1));
    else if (k === "down" || k === "j") setIdx((i) => Math.min(results.length - 1, i + 1));
    else if (k === "t") setMode("tagging");
    else if (k === "s") setMode("search");
  });

  if (!hasKey) {
    return (
      <box title=" notion " border borderStyle="rounded" borderColor={MUTED} style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
        <text fg={ROSE}>NOTION_API_KEY not set.</text>
        <text fg={MUTED}> </text>
        <text fg={INK}>create an internal integration at notion.so/my-integrations,</text>
        <text fg={INK}>share the pages you want with it, then add NOTION_API_KEY to .env.</text>
        <text fg={MUTED}> </text>
        <text fg={MUTED}>esc back</text>
      </box>
    );
  }

  return (
    <box title=" notion — tag notable pages " border borderStyle="rounded" borderColor={MUTED} style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
      {mode === "search" && (
        <>
          <text fg={CLAY}>search your notion (enter):</text>
          <input key="search" focused value={query} onInput={setQuery} onSubmit={() => doSearch(query)} />
        </>
      )}
      {mode !== "search" &&
        results.slice(0, 10).map((p, i) => (
          <text key={p.id} fg={i === idx ? INK : MUTED}>
            {i === idx ? "›" : " "} {p.title}
          </text>
        ))}
      {mode === "tagging" && (
        <>
          <text fg={CLAY}>freeform tag for "{results[idx]?.title}" (e.g. voice, product, ideas):</text>
          <input key="tag" focused value={tagInput} onInput={setTagInput} onSubmit={() => doTag(tagInput)} />
        </>
      )}
      <text fg={MUTED}> </text>
      {status ? <text fg={SAGE}>{status}</text> : null}
      <text fg={CLAY}>
        tagged ({tagged.length}): {tagged.slice(0, 6).map((t) => `[${t.tag}] ${t.title}`).join("   ")}
      </text>
    </box>
  );
}
