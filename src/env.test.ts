import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv, setEnv } from "./env.ts";

function tmpEnvPath(): string {
  return join(mkdtempSync(join(tmpdir(), "tf-env-")), ".env");
}

test("loadEnv skips comments/blanks and splits on the first '='", () => {
  const p = tmpEnvPath();
  setEnv(p, "A", "1");
  setEnv(p, "URL", "https://x.com/path?a=b"); // value contains '='
  const env = loadEnv(p);
  expect(env.A).toBe("1");
  expect(env.URL).toBe("https://x.com/path?a=b");
});

test("setEnv upserts without clobbering other keys", () => {
  const p = tmpEnvPath();
  setEnv(p, "A", "1");
  setEnv(p, "B", "2");
  setEnv(p, "A", "3"); // update A
  const env = loadEnv(p);
  expect(env.A).toBe("3");
  expect(env.B).toBe("2");
});

test("setEnv writes the secrets file as 0600", () => {
  const p = tmpEnvPath();
  setEnv(p, "SECRET", "shh");
  expect(statSync(p).mode & 0o777).toBe(0o600);
  expect(readFileSync(p, "utf8")).toContain("SECRET=shh");
});
