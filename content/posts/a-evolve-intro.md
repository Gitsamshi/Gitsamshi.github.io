---
title: "A-Evolve: The PyTorch for Agentic AI"
date: 2026-04-05
draft: false
tags: ["agent", "LLM", "evolution", "SWE-bench", "A-Evolve"]
categories: ["Research"]
summary: "A-Evolve is an open-source framework that automatically evolves any LLM agent across any domain — achieving SOTA on MCP-Atlas, SWE-bench, Terminal-Bench, and SkillsBench with zero manual harness engineering."
showToc: true
TocOpen: false
---

## The Problem: LLM Agents Don't Improve Themselves

We build LLM agents, ship them, and then what? The environment shifts, users surface new edge cases, and the agent stays frozen. Today's agent development looks like: write prompts, evaluate, tweak, repeat — all manually. This loop doesn't scale.

The deeper issue is that most agent improvement is tightly coupled to agent architecture. If you want to evolve a ReAct agent, you need evolution logic that understands ReAct internals. Switch to Plan-and-Solve? Rewrite everything. This coupling is the bottleneck.

We asked a simple question: **can we build a general-purpose evolution infrastructure that improves any agent, in any domain, using any evolution algorithm — without human intervention?**

That's [A-Evolve](https://github.com/A-EVO-Lab/a-evolve).

## Core Insight: Everything Lives on the File System

The key design principle behind A-Evolve is deceptively simple: **all evolvable agent state lives on the file system as a standard directory structure.** This means the evolution engine never needs to understand agent internals — it just mutates files.

A typical agent workspace looks like:

```
agent-workspace/
├── manifest.yaml          # agent identity + evolvable layers
├── prompts/
│   └── system.md          # system prompt
├── skills/                # dynamic skill library
│   ├── debug/SKILL.md
│   └── search/SKILL.md
├── tools/                 # tool configurations
└── memory/                # episodic + semantic memory (JSONL)
```

Want to evolve an agent's reasoning strategy? Mutate `prompts/system.md`. Want to add new capabilities? Drop a file into `skills/`. Want to reshape tool usage patterns? Edit `tools/`. The evolution engine operates at the file level, and the agent reloads from its workspace. This contract decouples evolution from architecture completely.

## The Five-Phase Evolution Loop

A-Evolve runs a continuous loop with five phases:

**1. Solve** — The agent processes a batch of tasks as a black box. A-Evolve doesn't care how the agent works internally (ReAct, CoT, Plan-and-Solve, whatever). It just collects the outputs.

**2. Observe** — Trajectories and feedback are collected into structured observation logs. This includes what the agent did, what succeeded, what failed, and any available reward signals.

**3. Evolve** — The evolution engine analyzes observations and proposes mutations to workspace files. This is where the LLM-driven magic happens: the engine reads failure patterns and generates targeted file edits (prompt rewrites, new skills, memory updates).

**4. Gate** — Proposed mutations are validated on holdout tasks. If the mutation hurts performance, it gets rolled back via git. Every accepted mutation receives a git tag (`evo-1`, `evo-2`, ...) for full reproducibility.

**5. Reload** — The agent reloads from its updated workspace and the loop continues.

The git-backed gating is crucial. Evolution is noisy — not every mutation helps. The gating phase ensures we only keep improvements, and the full version history means we can always trace back to understand what changed and why.

## Four Pluggable Axes

A-Evolve is a framework, not a monolithic system. It exposes four clean interfaces:

| Axis | Interface | What You Can Plug In |
|------|-----------|---------------------|
| **Agent** | `BaseAgent.solve()` | Any architecture — ReAct, Plan-and-Solve, custom |
| **Benchmark** | `BenchmarkAdapter` | Any domain with an evaluation signal |
| **Algorithm** | `EvolutionEngine.step()` | Any evolution strategy |
| **LLM Provider** | `LLMProvider.complete()` | Anthropic, OpenAI, Bedrock, etc. |

This means you can take your existing agent, wrap it in `BaseAgent.solve()`, point it at your benchmark, pick an evolution algorithm, and start evolving — in three lines:

```python
import agent_evolve as ae

evolver = ae.Evolver(agent="swe-verified", benchmark="swe-verified")
results = evolver.run(cycles=10)
```

## Reference Algorithms

We ship four reference evolution algorithms, each tuned for different domains:

**Adaptive-Evolve** uses per-claim feedback analysis with meta-learning. It's the specialist for tool-calling tasks — our top performer on MCP-Atlas.

**Adaptive-Skill** combines LLM-driven workspace mutation with bash tool access for hands-on environment exploration. This one dominates on Terminal-Bench.

**Skillforge** introduces Evolutionary Generality Loss (EGL) gating — a mechanism that penalizes mutations which overfit to specific task patterns. This is the SkillsBench specialist.

**Guided-Synth** takes a memory-first approach with LLM-guided intervention synthesis. It's our general-purpose algorithm and the strongest on SWE-bench.

Each algorithm implements the same `EvolutionEngine.step()` interface, so swapping between them (or writing your own) is trivial.

## Results

All results use Claude Opus-4.6 as the base model with **zero manual harness engineering** — the evolution loop discovers strategies autonomously.

| Benchmark | Domain | Score | Ranking |
|-----------|--------|-------|---------|
| MCP-Atlas | Tool-calling via MCP (16+ servers) | **79.4%** | **#1** |
| SWE-bench Verified | Real-world GitHub issues | **76.8%** | ~#5 |
| Terminal-Bench 2.0 | Terminal/CLI operations | **76.5%** | ~#7 |
| SkillsBench | Agentic skill discovery | **34.9%** | **#2** |

The MCP-Atlas result is particularly interesting — #1 on a benchmark involving 16+ MCP servers, achieved entirely through evolved strategies rather than hand-crafted heuristics.

## Why This Matters

The conventional approach to improving agents is labor-intensive prompt engineering and architecture search. A-Evolve flips this: you define *what* the agent should do (via benchmarks), and the framework figures out *how* to do it better.

A few things we found surprising during development:

- **Skill discovery is emergent.** We didn't hand-write the skills that ended up in evolved workspaces. The evolution engine discovered useful abstractions (debug patterns, search strategies, error recovery routines) and deposited them as reusable skill files.

- **Git-backed gating is essential.** Without it, noisy mutations accumulate and performance degrades. The rollback mechanism acts as a natural selection pressure.

- **Domain transfer works.** Skills evolved on one benchmark sometimes transfer to others. The file-system contract makes this natural — just copy the workspace.

## Get Started

```bash
pip install a-evolve[all]
```

The repo includes seed workspaces for SWE-bench, MCP-Atlas, Terminal-Bench, and SkillsBench. You can also bring your own agent and benchmark.

Check out the [GitHub repo](https://github.com/A-EVO-Lab/a-evolve) for documentation, tutorials, and the full set of reference algorithms.

If you're building agents and tired of manual prompt iteration, give A-Evolve a try. We'd love to see what the community evolves.

---

*This post accompanies our position paper: [Agentic Evolution is the Path to Evolving LLMs](https://arxiv.org/abs/2602.00359).*

*A-Evolve is MIT licensed and open for contributions — new algorithms, benchmarks, and agents are all welcome.*
