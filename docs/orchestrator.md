# Orchestrator playbook

The orchestrator keeps the long arc. It delegates the work to subagents to
protect its own context, steers them, and reports to the collaborator. A
heartbeat names this file; edit the routine here, not in the heartbeat prompt.

## Lanes

- **Start lanes** with Paseo `create_agent`, provider `opencode/<model>`, settings
  `{ modeId: "build", features: { auto_accept: true } }`. Don't pass
  `background`: the daemon rejects it with HTTP 500.
- **Models:**
  - `lunaroute/glm-5.3` for Lean, maths and implementation.
  - `lunaroute/deepseek-4.1-flash` for literature, CI and small tasks.
  - LunaRoute tokens are unlimited, so run lanes in parallel freely.
- **Escalate** to `openai/gpt-6-astra` or `anthropic/claude-opus-5-5` after two failed attempts on one item. A failed attempt is a reviewer rejection with a P1 or P2 finding, the same check failing again, or about an hour stuck on one Lean goal.
- **Every prompt states:**
  - the mode (literature, maths/proof, implementation, review);
  - the files the lane owns;
  - a time budget;
  - the escalation rule;
  - a short final report format.
- **Review** by a different model family from the implementer, in `plan` (read-only) mode. The verdict is `approve` or `reject`, with P1/P2/P3 findings and the head SHA.
  - Required for every pre-registration, and for simulation code before its result is reported.
  - Comparator replaces review for proofs.

## Steering

- **Exploration and exploitation:** keep one exploratory lane (literature or maths) running beside the implementation lanes.
- **Diminishing returns:** stop a lane after two check-ins with no new commit, claim or finding.
- **Propagate:** when one lane finds something that changes another lane's work, send it with `send_agent_prompt` at once.
- **Pre-registration before simulation:** a simulation lane starts only after the experiment's pre-registration is committed.

## Heartbeat routine

Keep each run to a few tool calls.

1. `list_agents`, and `list_pending_permissions` to unblock agents.
2. **For each finished lane:**
   - Read its report.
   - Promote what passes the "next week" test to its issue as a comment, with the orchestrator sign-off.
   - Tick the issue checklist.
   - Start the next stage from that checklist.
   - Archive the agent.
3. **For a running lane:** look at its activity only if it has had no commit for 90 minutes.
4. **Lessons:** add a comment to the Orchestration log (#4) for each lesson.

## Morning report

Report deltas only, in chat:
- what changed on each issue;
- new claims with their labels, and negative results;
- decisions needed (`needs-collaborator`);
- links.
