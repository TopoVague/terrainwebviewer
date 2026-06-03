# Skill: agent-customization (UI)

## Purpose

Provide a concise, repeatable workflow for creating, updating, and validating VS Code agent customization files (e.g., `.instructions.md`, `.prompt.md`, `SKILL.md`, `copilot-instructions.md`, agent manifest files). This UI-focused variant emphasizes prompts, interactive checks, and user-facing validation steps to support designers and maintainers who update skills via the editor.

## Scope

- Workspace-scoped skill (place in the repository under `skills/agent-customization`).
- Intended audience: extension authors, power users, and maintainers editing skill files in VS Code.

## Outcome

When followed, the skill produces a validated `SKILL.md` (or related customization file) that:

- Conforms to agent-customization guidelines.
- Includes clear inputs, outputs, examples, and test prompts for the UI.
- Is stored in the repository and accompanied by a minimal verification checklist.

## When to run

- Creating a new skill or template for an agent.
- Updating existing agent instructions or adding UI-specific interactions.
- Preparing a skill for sharing across a team or publishing.

## Step-by-step workflow

1. Collect context
   - Identify the target file(s) to create or modify (e.g., `.instructions.md`, `SKILL.md`).
   - Gather required metadata: skill name, description, inputs, outputs, examples, and allowed tools.

2. Draft the content
   - Use the agent-customization template: goal, triggers, inputs, outputs, constraints, examples, and edge-cases.
   - For UI variant, add explicit interactive steps and suggested prompts users can paste into the editor.

3. Add quality criteria and checks
   - Define completion criteria (e.g., file saved, lint passes, sample prompts produce expected responses).
   - List decision points and branching logic (what the agent should ask next if user input is missing or ambiguous).

4. Save and commit locally
   - Save under `skills/agent-customization/` or another workspace folder.
   - Optionally add a brief commit message summarizing the change.

5. Validate in-editor
   - Open the created file in VS Code and run the following checks:
     - Readability: short sentences, clear headings.
     - Completeness: all required sections present.
     - Example prompts: copy-paste at least one and ensure the agent behaves as expected.

6. Iterate
   - Fix any ambiguities found during validation and re-run the checks.

## Decision points & branching logic

- If required metadata is missing, the agent should prompt the user for: skill name, one-sentence purpose, primary inputs, and at least one example prompt.
- If the user indicates the skill is workspace-scoped vs personal, include or omit repository-specific paths and commit guidance.
- If the skill will call external tools, enumerate them and add permission/usage notes.

## Quality criteria / completion checks

- File contains: name, purpose, scope, outcome, step-by-step workflow, examples, and tests/prompts.
- At least one example prompt that exercises the main flow.
- Clear branching paths for ambiguous inputs.
- No more than 12–16 short, scannable bullets per major section.

## UI-focused guidance

- Provide copy-paste prompts for common actions (create, update, validate) so non-technical users can drive the agent from the editor UI.
- Suggest typical follow-ups (e.g., "Run tests", "Commit change", "Open pull request").
- For interactive flows, include explicit short questions the agent should ask the user when clarifying.

## Example prompts to try

- "Create a SKILL.md for `agent-customization` that focuses on UI interactions and validation steps."
- "Update this skill to require a 'test prompt' section that contains one positive and one negative example." 

## Minimal verification checklist

- [ ] `SKILL.md` saved in `skills/agent-customization/`.
- [ ] One example prompt included.
- [ ] Decision points documented.
- [ ] At least one validation step executed manually in the editor.

## Suggested next customizations

- Add a `copilot-instructions.md` companion file with explicit editor commands and keyboard shortcuts.
- Create a small `templates/` folder with ready-to-fill skill templates for common agent types (ui, cli, ci).

## Implementation notes for maintainers

- Keep sections short and scannable; prefer bullets.
- When adding new required fields, update the verification checklist.
- Avoid embedding secrets or workspace-internal tokens.

## Contact / ownership

Owner: team or individual who maintains agent customization files for this repository. Add a name and contact method here when assigned.

---

This file was generated following the `agent-customization` guidelines with a UI emphasis. Use the example prompts to exercise the workflow interactively in VS Code.
