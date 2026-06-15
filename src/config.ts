import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadEnv, type Env } from "./env.ts";

export interface Paths {
  root: string;
  env: string;
  tokens: string;
  db: string;
  personaDir: string;
  persona: string;
  personaTemplate: string;
  flushDir: string;
  flushState: string;
  flushPending: string;
  flushArchive: string;
  draftsDir: string;
}

/** Discover the project root: honor --dir, else walk up from cwd looking for a
 *  dir containing tweets.db, .env, or package.json. Falls back to cwd. */
export function projectRoot(dirFlag?: string): string {
  if (dirFlag) return resolve(dirFlag);
  let cur = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (
      existsSync(join(cur, "tweets.db")) ||
      existsSync(join(cur, ".env")) ||
      existsSync(join(cur, "package.json"))
    ) {
      return cur;
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return process.cwd();
}

export function paths(root: string): Paths {
  const flushDir = join(root, "flush");
  const personaDir = join(root, "persona");
  return {
    root,
    env: join(root, ".env"),
    tokens: join(root, ".tokens.json"),
    db: join(root, "tweets.db"),
    personaDir,
    persona: join(personaDir, "PERSONA.md"),
    personaTemplate: join(personaDir, "PERSONA.template.md"),
    flushDir,
    flushState: join(flushDir, "state.json"),
    flushPending: join(flushDir, "pending.md"),
    flushArchive: join(flushDir, "archive"),
    draftsDir: join(root, "drafts"),
  };
}

export interface Ctx {
  paths: Paths;
  env: Env;
}

export function loadCtx(dirFlag?: string): Ctx {
  const root = projectRoot(dirFlag);
  const p = paths(root);
  return { paths: p, env: loadEnv(p.env) };
}
