#!/usr/bin/env bun
import { run } from "./cli.ts";

run(process.argv.slice(2)).catch((e) => {
  console.error("error:", e?.message ?? e);
  process.exit(1);
});
