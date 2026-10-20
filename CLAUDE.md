# CLAUDE.md

herd is a Claude Code plugin ("mod"): a side pane that lists every running Claude Code session, with a pixel border collie, recaps, "needs you" states, meters and rename suggestions.

## Rule: README and CLAUDE.md move with the code

**Every change to the mod updates `README.md` and this file in the same commit.** A user-facing change (a feature, command, setting, state, label, default, limit, cost, supported terminal) goes into the README section that describes it, and its screenshots or GIF are re-rendered when what they show changed. An internal change (a file, an invariant, a test command) goes in here. Before committing, read both files against the diff: a sentence the code no longer makes true is a bug.

## Files

- `hooks/register.tsx` — everything: snapshots, pane, band, recaps, renames, commands.
- `hooks/collie.ts` — the dog's frames: one letter per pixel, two pixel rows per terminal row, one frame per 500 ms.
- `types/index.d.ts` — the `$.state` contract; every new atom is declared here.
- `.claude-plugin/plugin.json` — name `herd`, `userConfig` options (`recaps`, `renames`); `marketplace.json` makes `/plugin install herd --marketplace ZobelOmry/claude-session-herd` work.
- `assets/` — README images, rendered from the real frames with made-up demo sessions (never a capture of real session titles).

## Invariants

- Sessions talk only through `~/.claude/herd/sessions/<id>.json`, written every 3 s; 15 s without a write drops a session.
- "Needs you" = `waiting` (permission dialog) or `unseen` (a finished turn whose iTerm2 tab was not in front). Ask "does it need you?" with `needsYou()`; compare with `'waiting'` only for permission-specific text (the row detail, the toast).
- `osascript` fails open: a non-zero exit or no iTerm2 means "you have seen it". It never runs inside a hook the turn waits on.
- One Haiku call per turn at most, once per 5 min per session, never two in flight; it returns the recap and the rename name together. `recaps: false` means no model call at all.
- A suggested name passes `cleanName()` before it reaches `/rename`; the rename fallback never writes into the prompt box.
- A name set with `/rename` (`customTitle`) wins over Claude Code's `aiTitle`.

## Check before saying done

```bash
claude plugin test .        # all tests
claude plugin validate .    # manifest, marketplace, hooks module
npx -y -p typescript tsc -p .
```

Then a real run: `claude -p "…" --debug-file debug.log` from a scratch folder, and read the `herd` lines and the session's snapshot. Push to `main` only with the owner's go-ahead.
