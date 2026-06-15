# CLAUDE.md

This project's agent + contributor orientation lives in [AGENTS.md](AGENTS.md) — repo map,
build/test commands, conventions, and the public/internal boundary. Read it first.

Key rule: tweet-factory is a single **Bun + TypeScript** app (`tf` CLI in `src/`). There is no
Python or Rust *in this repo*. A doc pointing at a `.py`/`.rs` file **inside the repo** is stale —
but citations of the upstream `xai-org/x-algorithm` source (e.g. in the boost playbook) are correct.
