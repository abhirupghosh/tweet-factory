import { chmodSync, readFileSync, writeFileSync } from "node:fs";

export type Env = Record<string, string>;

/** Parse .env leniently: trim lines, skip blanks and #comments, split on the FIRST '='. */
export function loadEnv(path: string): Env {
  const env: Env = {};
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return env;
  }
  for (let line of text.split("\n")) {
    line = line.trim();
    if (line && !line.startsWith("#") && line.includes("=")) {
      const i = line.indexOf("=");
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return env;
}

/** Upsert a single KEY=VALUE into .env without clobbering other keys. */
export function setEnv(path: string, key: string, value: string): void {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    text = "";
  }
  const lines = text.split("\n").filter((l) => !l.startsWith(`${key}=`));
  // drop a trailing empty string from split if present
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  lines.push(`${key}=${value}`);
  // Mode 0600 — .env holds secrets; keep it out of reach of other local users.
  // (writeFileSync's mode is ignored when the file already exists, so chmod explicitly.)
  writeFileSync(path, lines.join("\n") + "\n", { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort on platforms without POSIX perms */
  }
}
