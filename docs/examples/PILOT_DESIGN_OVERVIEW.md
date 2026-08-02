# Agent Sidecar — How It Works

A companion doc to the setup guide, for anyone who wants to understand what's running
before letting it near their terminal. Nothing here is required reading — it exists
because you should be able to know what a tool does to your Claude Code sessions and
your data.

## What it is, in one paragraph

Agent Sidecar is a background process that runs beside Claude Code and lowers the cost of
getting real work out of it. It does three things: it **sharpens your prompts** before
Claude starts spending tokens on them; it **notices when a session is going in circles**
and nudges it back on track; and it **measures honestly** whether any of that actually
saved you anything. You keep using Claude Code exactly as before — same terminal, same
commands, no code changes.

## What runs where

```text
 YOUR MACHINE                                      OPERATOR'S MACHINE
┌────────────────────────────────────────┐        ┌──────────────────────────┐
│                                        │        │                          │
│  Claude Code ◄─────────► Anthropic API │        │  prompt-improvement      │
│      │                                 │        │  service                 │
│      ▼                                 │ prompt │      ▲                   │
│  Agent Sidecar (background)            │  text  │      │                   │
│   • session history (stays here)       │ ─────► │  usage receipts          │
│   • cost tracking (stays here)         │ ◄───── │  (counts and sizes,      │
│   • session health monitoring          │ better │   not prompt text)       │
│                                        │ prompt │                          │
└────────────────────────────────────────┘        └──────────────────────────┘
         └── private encrypted network (Tailscale) — nothing on the public internet ──┘
```

Everything about your work stays on **your** machine: session history, cost data, and of
course your code. The operator's machine provides one service — improving prompts — over a
private encrypted network. Claude Code's own connection to Anthropic is untouched.

## What it does during a session

**Before Claude starts:** when you submit a prompt, the sidecar has a few seconds to turn
a vague request into a clearer, more specific brief, which is added alongside your
original prompt (never replacing it). Clear prompts pass through mostly unchanged; vague
ones benefit most.

**While Claude works:** the sidecar watches for signs of wasted effort — the kinds of
loops where an agent burns tokens without making progress — and, when it sees one, adds a
short advisory note to Claude's context. It raises each issue once, and it can never block
or override anything: worst case, Claude gets one extra paragraph of advice it ignores.

**If the operator's machine is unreachable:** everything keeps working. The sidecar falls
back to a fully local mode, and in that mode nothing leaves your machine at all.

## How savings are measured

Any tool can claim it saves money. The only credible way to know is to compare:

```text
                        your sessions
              ┌───────────────┴───────────────┐
              ▼                               ▼
        most sessions                  ~30% of sessions
        get the sidecar's help         run in "control mode":
        as described above             the sidecar only observes
              │                               │
              └───────────────┬───────────────┘
                              ▼
              a weekly report compares the two groups
              on cost and outcomes — that comparison
              is the pilot's answer
```

Control-mode sessions behave exactly like stock Claude Code. You won't be told which
sessions are which — knowing would bias the comparison — but nothing is ever withheld
except the sidecar's own suggestions. The weekly report is generated on your machine, by
you, and you review it before sharing it.

## Data boundaries

| Data | Where it lives | Who sees it |
| --- | --- | --- |
| Your code and files | your machine only | you |
| Session history (tools, edits, tests) | your machine only | you |
| Claude token counts and cost | your machine only | you (shared only via the weekly report you run and review) |
| Prompt text you type | sent to the operator's machine for improvement | the operator's service; not stored in the receipts |
| Usage receipts (timestamps, counts, sizes) | operator's machine | operator — used to sanity-check the weekly reports |
| Weekly aggregate report | generated on your machine, by you | you first, then the operator |

Two-way honesty: you can see everything that leaves your machine, and the operator can
sanity-check reports against their receipts — neither side takes the other's numbers on
faith.

## When things are off or broken

The design rule: the sidecar can only ever degrade to "stock Claude Code."

- Operator machine unreachable → local fallback mode; nothing is sent anywhere.
- Sidecar not running → Claude Code works normally, unaffected.
- Want it gone entirely → `agent-sidecar hooks uninstall` restores stock behavior in one command.

Everything the sidecar produces is advisory. It cannot block, edit, or veto what Claude does.

## What the pilot is for

The honest version: it is not yet proven that the sidecar's help beats plain Claude Code
on cost for real work. That's the question this pilot answers. If the data says the help
isn't helping, that's a finding, not a failure — and either way you'll see the same
numbers the operator sees.
