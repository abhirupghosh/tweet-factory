// Generation backend that spawns the Claude Code CLI (`claude -p`) as a subagent
// running our prompt — no API key required (uses the user's Claude Code auth).
// Works headless on the VM (claude is installed + authed there).

export interface ClaudeCodeOpts {
  model?: string;
  cwd?: string;
  timeoutMs?: number;
}

export function claudeAvailable(): boolean {
  try {
    return Bun.spawnSync(["claude", "--version"]).exitCode === 0;
  } catch {
    return false;
  }
}

/** Run a prompt through `claude -p` and return the final assistant text. */
export async function runClaudeCode(prompt: string, opts: ClaudeCodeOpts = {}): Promise<string> {
  if (!claudeAvailable()) {
    throw new Error(
      "claude CLI not found. Install Claude Code, or set an API key (ANTHROPIC_API_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY) and TF_LLM_PROVIDER.",
    );
  }
  // The generation subagent only needs to emit text/JSON — it never needs tools.
  // Disallow all tools so prompt-injection in scraped tweets / articles / Notion
  // pages can't make the spawned agent run Bash, edit files, or touch the network.
  const args = ["-p", prompt, "--output-format", "json", "--allowedTools", ""];
  if (opts.model) args.push("--model", opts.model);

  const proc = Bun.spawn(["claude", ...args], { stdout: "pipe", stderr: "pipe", cwd: opts.cwd });
  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {}
  }, opts.timeoutMs ?? 240_000);

  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  clearTimeout(timer);

  if (code !== 0) throw new Error(`claude -p failed (exit ${code}): ${(err || out).slice(0, 300)}`);

  try {
    const envelope = JSON.parse(out) as { result?: string; is_error?: boolean; error?: string };
    if (envelope.is_error || envelope.error) throw new Error(envelope.error ?? "claude reported an error");
    if (typeof envelope.result === "string") return envelope.result;
  } catch (e) {
    if (e instanceof Error && e.message.includes("claude reported")) throw e;
  }
  return out; // fallback: raw stdout
}
