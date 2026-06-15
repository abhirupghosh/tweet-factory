import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import type { Env } from "../env.ts";
import type { Paths } from "../config.ts";

export const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
export const AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
export const SCOPES = ["tweet.read", "users.read", "like.read", "bookmark.read", "offline.access"];

export interface Tokens {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
  [k: string]: unknown;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function loadTokens(p: Paths): Tokens {
  return JSON.parse(readFileSync(p.tokens, "utf8"));
}

/** Atomic write so a crash mid-write can't corrupt the only credential.
 *  Mode 0600 so the long-lived refresh token isn't readable by other local users. */
export function saveTokens(p: Paths, tok: Tokens): void {
  const tmp = p.tokens + ".tmp";
  writeFileSync(tmp, JSON.stringify(tok, null, 2), { mode: 0o600 });
  renameSync(tmp, p.tokens);
}

export function hasTokens(p: Paths): boolean {
  return existsSync(p.tokens);
}

function basicAuthHeader(id: string, secret?: string): Record<string, string> {
  if (!secret) return {};
  return { Authorization: "Basic " + btoa(`${id}:${secret}`) };
}

/** Refresh the access token; preserve the refresh_token if the response omits it. */
export async function refreshToken(env: Env, p: Paths, tokens: Tokens): Promise<Tokens> {
  if (!tokens.refresh_token) {
    throw new Error("Token expired and no refresh_token available. Re-run `tf auth`.");
  }
  const clientId = env.TWITTER_OAUTH2_CLIENT_ID;
  const clientSecret = env.TWITTER_OAUTH2_CLIENT_SECRET;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: clientId,
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...basicAuthHeader(clientId, clientSecret),
    },
    body,
  });
  if (!r.ok) throw new Error(`Token refresh failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const fresh = (await r.json()) as Tokens;
  if (!fresh.refresh_token && tokens.refresh_token) fresh.refresh_token = tokens.refresh_token;
  saveTokens(p, fresh);
  console.error("  (access token refreshed)");
  return fresh;
}

/** Bearer auth wrapper used by the X API client; refreshes on 401. */
export class Auth {
  tokens: Tokens;
  constructor(public env: Env, public paths: Paths) {
    if (!hasTokens(paths)) {
      throw new Error("No .tokens.json. Run `tf auth` first (OAuth 2.0 required).");
    }
    this.tokens = loadTokens(paths);
  }
  authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.tokens.access_token}` };
  }
  async onUnauthorized(): Promise<boolean> {
    this.tokens = await refreshToken(this.env, this.paths, this.tokens);
    return true;
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* headless: user opens the printed URL */
  }
}

const CALLBACK_HTML =
  "<html><body style='font-family:sans-serif;padding:40px'>" +
  "<h2>Authorized.</h2><p>You can close this tab and return to the terminal.</p></body></html>";

export interface AuthOpts {
  port?: number;
  bind?: string;
  redirectUri?: string;
  noBrowser?: boolean;
  timeoutSecs?: number;
}

/** Run the OAuth 2.0 PKCE flow and save .tokens.json. */
export async function runPkceFlow(env: Env, p: Paths, opts: AuthOpts = {}): Promise<Tokens> {
  const clientId = env.TWITTER_OAUTH2_CLIENT_ID;
  const clientSecret = env.TWITTER_OAUTH2_CLIENT_SECRET;
  if (!clientId) {
    throw new Error(
      "Missing TWITTER_OAUTH2_CLIENT_ID in .env (X dev portal -> app -> OAuth 2.0 Client ID).",
    );
  }
  const port = opts.port ?? Number(env.OAUTH_PORT ?? 8675);
  // Default to loopback so the ~5-min callback window isn't exposed on the LAN.
  // Override (e.g. a Tailscale IP) only when authorizing from another machine.
  const bind = opts.bind ?? env.OAUTH_BIND_HOST ?? "127.0.0.1";
  if (bind !== "127.0.0.1" && bind !== "localhost") {
    console.error(`  ⚠ OAuth callback bound to ${bind} (not loopback) — reachable by other hosts during auth.`);
  }
  const redirectUri = opts.redirectUri ?? env.OAUTH_REDIRECT_URI ?? `http://127.0.0.1:${port}/callback`;

  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)));
  const challengeBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = b64url(new Uint8Array(challengeBuf));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));

  const authUrl =
    AUTHORIZE_URL +
    "?" +
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();

  let captured: { code?: string; state?: string } = {};
  const server = Bun.serve({
    port,
    hostname: bind,
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/callback") {
        captured.code = u.searchParams.get("code") ?? undefined;
        captured.state = u.searchParams.get("state") ?? undefined;
        return new Response(CALLBACK_HTML, { headers: { "Content-Type": "text/html" } });
      }
      return new Response("not found", { status: 404 });
    },
  });

  console.error(`\nCallback server listening on ${bind}:${port}`);
  console.error(`Redirect URI in use (must be registered in the X app): ${redirectUri}\n`);
  console.error("Open this URL in a browser logged in as your X account and click 'Authorize':\n");
  console.error(authUrl + "\n");
  if (!opts.noBrowser) openBrowser(authUrl);

  const deadline = Date.now() + (opts.timeoutSecs ?? 300) * 1000;
  while (!captured.code && Date.now() < deadline) await Bun.sleep(250);
  server.stop(true);
  if (!captured.code) throw new Error("Timed out waiting for authorization (5 min). Re-run `tf auth`.");
  if (captured.state !== state) throw new Error("State mismatch -- aborting (possible CSRF).");

  console.error("Got authorization code. Exchanging for access token...");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: captured.code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    client_id: clientId,
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...basicAuthHeader(clientId, clientSecret),
    },
    body,
  });
  if (!resp.ok) throw new Error(`Token exchange failed (${resp.status}): ${await resp.text()}`);
  const tokens = (await resp.json()) as Tokens;
  saveTokens(p, tokens);
  console.error(`\nSuccess. Token saved to ${p.tokens}`);
  console.error("Scopes granted:", tokens.scope);
  console.error("Has refresh token:", Boolean(tokens.refresh_token));
  return tokens;
}
