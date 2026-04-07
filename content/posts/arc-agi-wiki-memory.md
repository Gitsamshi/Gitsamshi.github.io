---
title: "How We Got 17.47% on ARC-AGI-3 with a Wiki-Style Agent Memory"
date: 2026-04-06
draft: false
tags: ["agent", "LLM", "ARC-AGI", "memory", "A-Evolve"]
categories: ["Research"]
summary: "We tested the LLM wiki pattern on ARC-AGI-3 — the hardest interactive reasoning benchmark. With one key adaptation, it outperformed flat memory by 47% — and the reason why tells us something important about how AI agents should manage knowledge."
showToc: true
TocOpen: false
---

Andrej Karpathy recently described an [LLM wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): instead of dumping information into a flat list, have the LLM maintain a structured, persistent knowledge base — topic pages, cross-references, compiled synthesis. Knowledge compounds over time rather than being re-derived from scratch.

We tested this idea on AI agents playing [ARC-AGI-3](https://arcprize.org/arc-agi/3) — 25 interactive puzzle games where agents must figure out game mechanics through trial-and-error. No instructions. No training data. Humans score 100%. Claude Opus 4.6 as a basic agent scores 0.26%.

Our finding: **a wiki-style structured memory outperforms flat memory by 47%, reaching 17.47% RHAE** — competitive with the top CNN+RL systems on the leaderboard, using a pure LLM approach. But getting there required understanding what makes the wiki pattern actually work.

## The Multi-Agent Problem: Brilliant Agents, Amnesia Between Them

A single LLM agent playing ARC-AGI-3 hits a wall fast. By turn 50, its context window is polluted with stale observations, failed attempts, and contradictory hypotheses. That's how you get 0.26%.

The fix is multi-agent orchestration: an orchestrator spawns specialists — an **explorer** that probes the game mechanics, a **theorist** that forms hypotheses without burning actions, and a **solver** that executes the strategy. Each agent gets a fresh context window. No context rot. The orchestrator decides when to reuse an agent and when to spawn fresh eyes.

But this creates a new problem: **amnesia**. Each fresh agent starts with a blank context. The explorer spent 15 actions discovering that "ACTION1 moves the player up by 3 pixels, color 5 is a wall, and the goal is to reach the green square." The solver needs all of that — but it wasn't there when the explorer found it.

Memory is the bridge. It's the only thing that persists across agent lifetimes. Without it, every agent rediscovers from scratch. With it, knowledge compounds across the entire game.

This is different from how most agent frameworks think about memory. They treat it as a convenience — a place to log things. In a multi-agent system, **memory IS the coordination mechanism**. The explorer doesn't talk to the solver. They never share a context window. The only way the explorer's discoveries reach the solver is through what gets written to memory.

That makes memory design the most important architectural decision in the system. Not the model. Not the prompt. The memory.

The question: how should that memory be structured?

## Flat Memory: The Baseline

Our first system used a flat append-only list — essentially a shared notepad. Each agent writes observations; the next agent scans the list. Simple. No structure.

This scored **11.86% RHAE** (57 levels completed across 25 games). Already a 45x improvement over the basic agent, just from the multi-agent harness. Three games fully solved. But we could see the problems: by memory entry #15, agents waste tokens scanning irrelevant entries. They sometimes re-discover things already known. And there's no way to quickly find "what do the colors mean?" without reading everything.

## Wiki Memory: Structured Knowledge for Agents

Following the [LLM wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), we organized knowledge into topic pages:

- `game_rules` — what each action does, movement physics, win condition
- `breakthroughs` — game-changing discoveries that alter the strategy
- `colors` — color-to-role mapping
- `current_level` — current layout and positions
- `current_plan` — what to try next
- `solved_levels` — how each level was beaten
- `failed_attempts` — what didn't work and why
- `level_changes` — what differs between levels

An explorer discovering mechanics writes to `game_rules`. A solver reads `current_plan` and `breakthroughs` — exactly what it needs, nothing more.

The critical design choice: **most pages are append-only**. `game_rules`, `breakthroughs`, `solved_levels`, `failed_attempts`, and `level_changes` can only be appended to, never overwritten. Only genuinely current-state pages (`colors`, `current_level`, `current_plan`) allow overwriting.

This matters because in a multi-agent system, a confused agent can accidentally destroy a previous agent's correct discovery by overwriting it. Append-only guarantees that knowledge only accumulates — compounding rather than being lost.

## The Results

| System | RHAE | Levels (of 181) |
|--------|------|-----------------|
| Basic Opus 4.6 | 0.26% | — |
| Flat memory (notepad) | 11.86% | 57 |
| **Wiki memory (structured)** | **17.47%** | **74** |

The wiki outperformed flat memory on the games that matter most — the ones with complex mechanics and multiple levels where knowledge transfer is critical:

- **ft09**: 18.5% → 82.9% (solved all 6 levels — the agent learned the pattern rule at level 0 and applied it cleanly through level 5)
- **tu93**: 17.5% → 63.6% (8 of 9 levels — maze-solving knowledge transferred across levels)
- **ka59**: 0% → 30.9% (5 of 7 levels — went from stuck to strong through accumulated game rules)
- **ar25**: 14.5% → 24.0% (5 of 8 levels — structured shape-interlocking mechanics)

These are games where the wiki's structure directly helped: the solver reads `game_rules` + `breakthroughs` + `solved_levels` for the previous level, and immediately has a strategy for the current one. With flat memory, it would scan 20+ entries trying to piece this together.

## Why It Works: Three Layers of Agent Knowledge

The LLM wiki framework describes three layers: raw sources, compiled wiki, and schema. In our agent system:

**Raw sources** = the game frames, diffs, and action results that agents observe.

**Compiled wiki** = the structured pages where agents synthesize observations into knowledge. "ACTION1 moves player up by 3 pixels" isn't a raw observation — it's compiled from multiple frame diffs across multiple actions.

**Schema** = the page structure and rules (which pages exist, which are append-only, which are overwritable). This is the "discipline layer" that turns agents from ad-hoc note-takers into systematic knowledge builders.

The key insight — LLMs don't get bored, don't forget to update a cross-reference, and can touch 15 pages in one pass — applies perfectly to multi-agent game-playing. An explorer agent systematically maps every action, writes to `game_rules`, updates `colors`, describes `current_level`. It doesn't skip entries or get lazy. The structure ensures nothing falls through the cracks.

## The Cross-Level Transfer Effect

The biggest win is on multi-level games. With flat memory, solving level 0 produces a scattered set of observations. The level 1 agent must reconstruct what's relevant. With wiki pages, the level 1 agent reads:

1. `game_rules` — all confirmed mechanics (accumulates across levels)
2. `solved_levels` — "Level 0: solved by moving right 5, then down 3. Key: player must reach green square."
3. `level_changes` — "Level 1: same mechanics, different maze layout."
4. `current_plan` — "Try level 0's approach adapted to new layout."

The knowledge is already synthesized and organized — the agent doesn't re-derive it. This is the compounding effect in action.

## What's Next

We're building this into [A-Evolve](https://github.com/A-EVO-Lab/a-evolve), infrastructure for automatically evolving agent harnesses. The wiki page schema itself becomes a parameter that the system optimizes — which pages should exist, which are append-only, how should agents be instructed to use them.

The model isn't the bottleneck. The memory design is. A well-structured wiki turns a 0.26% agent into a 17.47% agent — same model, same weights, same API. The wiki pattern, adapted for multi-agent interactive environments, is a 67x multiplier on the benchmark score.

The harness is the product.

---

*All experiments: Claude Opus 4.6 via AWS Bedrock (High Reasoning Effort), 12 parallel workers, 350 actions/game, 25 games. Code building on the [ARC-AGI-3-Agents](https://github.com/symbolica-ai/ARC-AGI-3-Agents) framework.*
