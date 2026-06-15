import { cmdAuth } from "./commands/auth.ts";
import { cmdFetch } from "./commands/fetch.ts";
import { cmdCron, cmdEnrich, cmdFlush, cmdNotify, cmdSearch, cmdUpdate } from "./commands/pipeline.ts";
import { cmdGenerate } from "./commands/generate.ts";
import { cmdAnalyze } from "./commands/analyze.ts";
import { cmdOnboard } from "./commands/onboard.ts";
import { cmdNotion } from "./commands/notion.ts";

type Handler = (argv: string[]) => Promise<void>;

const COMMANDS: Record<string, Handler> = {
  onboard: cmdOnboard,
  auth: cmdAuth,
  fetch: cmdFetch,
  flush: cmdFlush,
  search: cmdSearch,
  notify: cmdNotify,
  enrich: cmdEnrich,
  notion: cmdNotion,
  update: cmdUpdate,
  cron: cmdCron,
  generate: cmdGenerate,
  analyze: cmdAnalyze,
};

function printHelp(): void {
  console.log(`tweet-factory (tf) — learn from your X activity, draft tweets in your voice

usage: tf <command> [options]

commands:
  auth                     run the OAuth 2.0 (PKCE) flow -> .tokens.json
  fetch [like|bookmark|own] [--incremental]
                           pull your likes/bookmarks/tweets into tweets.db
  onboard                  launch the OpenTUI onboarding (interview, tagging, generate)
  generate [--n N --timely --post-to-slack]
                           draft tweets in your voice via your LLM
  notion <search|tag|untag|list|sync>
                           tag notable Notion pages as static grounding
  enrich / flush / search / notify / update / cron / analyze
                           data pipeline + analysis (all bash-operable)

global: --dir <path>      project root (defaults to nearest dir with tweets.db/.env)
`);
}

export async function run(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return;
  }
  const handler = COMMANDS[cmd];
  if (!handler) {
    console.error(`unknown command: ${cmd}\n`);
    printHelp();
    process.exit(2);
  }
  await handler(rest);
}
