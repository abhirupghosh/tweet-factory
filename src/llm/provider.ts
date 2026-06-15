import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Env } from "../env.ts";
import { runClaudeCode } from "./claudecode.ts";

export type ProviderName = "claude-code" | "anthropic" | "openrouter" | "openai";

const DEFAULT_MODEL: Record<ProviderName, string> = {
  "claude-code": "", // CLI default model
  anthropic: "claude-sonnet-4-6",
  openrouter: "anthropic/claude-sonnet-4.6",
  openai: "gpt-4o",
};

export interface LlmConfig {
  provider: ProviderName;
  model: string;
}

/** Default backend is the Claude Code CLI (no API key). Set TF_LLM_PROVIDER to use a direct API. */
export function resolveProvider(env: Env): LlmConfig {
  const provider = (env.TF_LLM_PROVIDER as ProviderName) || "claude-code";
  return { provider, model: env.TF_LLM_MODEL || DEFAULT_MODEL[provider] };
}

export interface CompleteOpts {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

/** Single completion across backends. Returns the model's text output. */
export async function complete(env: Env, opts: CompleteOpts): Promise<string> {
  const { provider, model } = resolveProvider(env);

  if (provider === "claude-code") {
    // claude -p takes one prompt; fold the system in as a preamble.
    const prompt = `${opts.system}\n\n---\n\n${opts.user}`;
    return runClaudeCode(prompt, { model: model || undefined });
  }

  const maxTokens = opts.maxTokens ?? 2000;
  const temperature = opts.temperature ?? 0.8;

  if (provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("TF_LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.");
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }

  // openrouter + openai share the OpenAI SDK
  const apiKey = provider === "openrouter" ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(`TF_LLM_PROVIDER=${provider} but its API key is not set in .env.`);
  const client = new OpenAI(
    provider === "openrouter" ? { apiKey, baseURL: "https://openrouter.ai/api/v1" } : { apiKey },
  );
  const r = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  return r.choices[0]?.message?.content ?? "";
}
