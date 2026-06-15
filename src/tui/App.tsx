import { useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { CLAY, INK, MUTED, ROSE, SAGE } from "./theme.ts";
import { TAGS, writePersona } from "./persona.ts";
import { roast, type VoiceStats } from "../analyze.ts";
import { generateDrafts, type Draft } from "../llm/generate.ts";
import { NotionScreen } from "./NotionScreen.tsx";
import type { Ctx } from "../config.ts";

const QUESTIONS = [
  "what do you want to be known for, in one breath?",
  "your hottest take that's gotten you in trouble?",
  "what are you building right now?",
  "describe your voice in 3 words (e.g. terse, lowercase, spicy)",
];
const TAG_COLOR = [MUTED, CLAY, ROSE, SAGE, INK];

type Screen = "welcome" | "interview" | "accounts" | "roast" | "forge" | "notion" | "generate";

export function App({ ctx, stats }: { ctx: Ctx; stats: VoiceStats }) {
  const renderer = useRenderer();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>(["", "", "", ""]);
  const [input, setInput] = useState("");
  const [tags, setTags] = useState<number[]>(stats.authors.map(() => 0));
  const [accIdx, setAccIdx] = useState(0);
  const [forged, setForged] = useState(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  function quit(): void {
    try {
      renderer.destroy();
    } catch {}
    process.exit(0);
  }

  async function runGenerate(): Promise<void> {
    setGenLoading(true);
    setGenErr(null);
    try {
      const d = await generateDrafts(ctx, { n: 6 });
      setDrafts([...d].sort((a, b) => b.score - a.score));
    } catch (e) {
      setGenErr((e as Error)?.message ?? String(e));
    } finally {
      setGenLoading(false);
    }
  }

  function submitAnswer(val: string): void {
    const a = [...answers];
    a[qIdx] = val.trim();
    setAnswers(a);
    setInput("");
    if (qIdx + 1 < QUESTIONS.length) setQIdx(qIdx + 1);
    else setScreen("accounts");
  }

  useKeyboard((key) => {
    const k = key.name;
    if (key.ctrl && k === "c") return quit();
    if (screen === "interview") return; // <input> owns keys here
    switch (screen) {
      case "welcome":
        if (k === "return" || k === "enter") setScreen("interview");
        else if (k === "escape" || k === "q") quit();
        break;
      case "accounts":
        if (k === "up" || k === "k") setAccIdx((i) => Math.max(0, i - 1));
        else if (k === "down" || k === "j") setAccIdx((i) => Math.min(stats.authors.length - 1, i + 1));
        else if (k === "space") setTags((t) => t.map((v, i) => (i === accIdx ? (v + 1) % 5 : v)));
        else if (k === "return" || k === "enter") setScreen("roast");
        else if (k === "escape") quit();
        break;
      case "roast":
        if (k === "return" || k === "enter") setScreen("forge");
        else if (k === "escape") quit();
        break;
      case "forge":
        if (k === "f" || k === "return" || k === "enter") {
          writePersona(ctx, answers, tags, stats);
          setForged(true);
        } else if (k === "g") {
          setScreen("generate");
          if (!drafts && !genLoading) void runGenerate();
        } else if (k === "n") setScreen("notion");
        else if (k === "q" || k === "escape") quit();
        break;
      case "generate":
        if (k === "r") void runGenerate();
        else if (k === "escape") setScreen("forge");
        else if (k === "q") quit();
        break;
    }
  });

  const footerHint: Record<Screen, string> = {
    welcome: "enter start · esc quit",
    interview: "type · enter next",
    accounts: "↑↓ move · space tag · enter next",
    roast: "enter forge · esc quit",
    forge: forged ? "g generate · n notion · q quit" : "f forge persona · n notion · q quit",
    notion: "type to search · ↑↓ select · t tag · s new search · esc back",
    generate: "r regenerate · esc back · q quit",
  };

  return (
    <box style={{ flexDirection: "column", padding: 1 }}>
      <text fg={CLAY}>  tweet-factory  ·  persona forge — {screen}</text>
      <box style={{ flexDirection: "row", flexGrow: 1, marginTop: 1 }}>
        {screen === "welcome" && <Welcome stats={stats} />}
        {screen === "interview" && (
          <Interview
            qIdx={qIdx}
            input={input}
            setInput={setInput}
            submit={submitAnswer}
            answers={answers}
            stats={stats}
            tags={tags}
          />
        )}
        {screen === "accounts" && <Accounts stats={stats} tags={tags} accIdx={accIdx} answers={answers} />}
        {screen === "roast" && <Roast stats={stats} />}
        {screen === "forge" && <Forge stats={stats} forged={forged} answers={answers} />}
        {screen === "notion" && <NotionScreen ctx={ctx} onBack={() => setScreen("forge")} />}
        {screen === "generate" && <Generate loading={genLoading} err={genErr} drafts={drafts} />}
      </box>
      <text fg={MUTED}>  {footerHint[screen]}</text>
    </box>
  );
}

function Card({ stats, answers, tags }: { stats: VoiceStats; answers?: string[]; tags?: number[] }) {
  const heroes = tags
    ? stats.authors.filter((_, i) => (tags[i] ?? 0) > 0).slice(0, 5).map((a) => "@" + a.username)
    : stats.authors.slice(0, 3).map((a) => "@" + a.username);
  const shown = heroes.length ? heroes : stats.authors.slice(0, 3).map((a) => "@" + a.username);
  return (
    <box
      title=" persona card "
      border
      borderStyle="rounded"
      borderColor={MUTED}
      style={{ flexDirection: "column", width: 36, padding: 1 }}
    >
      <text fg={INK}>{stats.handle}</text>
      {answers?.[0] ? <text fg={MUTED}>{answers[0]}</text> : <text fg={MUTED}> </text>}
      <text fg={CLAY}>voice</text>
      <text fg={INK}> {answers?.[3]?.trim() || "lowercase · terse"}</text>
      {stats.markers.length > 0 && <text fg={INK}> {stats.markers.join(" · ")}</text>}
      <text fg={MUTED}> {stats.lowercase_pct}% lowercase · ~{stats.median_words}w</text>
      <text fg={CLAY}>heroes</text>
      <text fg={INK}> {shown.join("  ")}</text>
    </box>
  );
}

function Welcome({ stats }: { stats: VoiceStats }) {
  return (
    <box title=" welcome " border borderStyle="rounded" borderColor={MUTED} style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
      <text fg={INK}>let's forge your voice.</text>
      <text fg={MUTED}> </text>
      <text fg={MUTED}>
        read {stats.n_own} of your tweets · {stats.n_likes} likes · {stats.n_bookmarks} bookmarks for {stats.handle}
      </text>
      <text fg={MUTED}> </text>
      <text fg={INK}>a few quick questions, then i tag the accounts you love,</text>
      <text fg={INK}>roast your last tweets, and generate your first drafts.</text>
      <text fg={MUTED}> </text>
      <text fg={CLAY}>press enter to begin</text>
    </box>
  );
}

function Interview(props: {
  qIdx: number;
  input: string;
  setInput: (v: string) => void;
  submit: (v: string) => void;
  answers: string[];
  stats: VoiceStats;
  tags: number[];
}) {
  return (
    <>
      <box title=" interview " border borderStyle="rounded" borderColor={MUTED} style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
        <text fg={MUTED}>
          {props.qIdx + 1}/{QUESTIONS.length}
        </text>
        <text fg={INK}>{QUESTIONS[props.qIdx]}</text>
        <text fg={MUTED}> </text>
        <input
          key={props.qIdx}
          focused
          value={props.input}
          onInput={props.setInput}
          onSubmit={() => props.submit(props.input)}
        />
      </box>
      <Card stats={props.stats} answers={props.answers} tags={props.tags} />
    </>
  );
}

function Accounts({ stats, tags, accIdx, answers }: { stats: VoiceStats; tags: number[]; accIdx: number; answers: string[] }) {
  const max = Math.max(1, ...stats.authors.map((a) => a.count));
  return (
    <>
      <box title=" accounts — space to tag " border borderStyle="rounded" borderColor={MUTED} style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
        {stats.authors.map((a, i) => {
          const sel = i === accIdx;
          const bar = "▰".repeat(Math.max(1, Math.round((a.count / max) * 10)));
          const tag = tags[i] ?? 0;
          return (
            <text key={a.username} fg={sel ? INK : MUTED}>
              {sel ? "›" : " "} {("@" + a.username).padEnd(16)} {bar.padEnd(10)} {TAGS[tag]}
            </text>
          );
        })}
      </box>
      <Card stats={stats} answers={answers} tags={tags} />
    </>
  );
}

function Roast({ stats }: { stats: VoiceStats }) {
  return (
    <box title=" roast — your recent posts, scored " border borderStyle="rounded" borderColor={MUTED} style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
      {stats.recent.map((r, i) => {
        const { score, quip } = roast(r.text);
        const col = score >= 80 ? SAGE : score >= 60 ? CLAY : ROSE;
        return (
          <text key={i} fg={col}>
            {String(score).padStart(3)}  {r.text.replace(/\n/g, " ").slice(0, 50)}…  — {quip}
          </text>
        );
      })}
    </box>
  );
}

function Forge({ stats, forged, answers }: { stats: VoiceStats; forged: boolean; answers: string[] }) {
  return (
    <box title=" forge " border borderStyle="rounded" borderColor={MUTED} style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
      {forged ? (
        <>
          <text fg={SAGE}>✓ wrote persona/PERSONA.md for {stats.handle}</text>
          <text fg={MUTED}> </text>
          <text fg={INK}>press g to generate your first drafts with your LLM</text>
          <text fg={MUTED}>press n to connect Notion + tag pages as grounding</text>
        </>
      ) : (
        <>
          <text fg={CLAY}>pull the lever.</text>
          <text fg={MUTED}> </text>
          <text fg={INK}>press f to forge persona/PERSONA.md from your answers + data</text>
          <text fg={MUTED}>press n to connect Notion (optional grounding source)</text>
        </>
      )}
    </box>
  );
}

function Generate({ loading, err, drafts }: { loading: boolean; err: string | null; drafts: Draft[] | null }) {
  return (
    <scrollbox title=" generate " border borderStyle="rounded" borderColor={MUTED} style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
      {loading && <text fg={CLAY}>generating drafts via your LLM…</text>}
      {err && <text fg={ROSE}>error: {err}</text>}
      {!loading && !err && drafts?.map((d, i) => (
        <box key={i} style={{ flexDirection: "column", marginBottom: 1 }}>
          <text fg={CLAY}>
            ({d.score}) {d.signal}
          </text>
          <text fg={INK}>{d.text}</text>
          {d.note ? <text fg={MUTED}>{d.note}</text> : null}
        </box>
      ))}
      {!loading && !err && !drafts && <text fg={MUTED}>press r to generate</text>}
    </scrollbox>
  );
}
