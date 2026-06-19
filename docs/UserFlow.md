# UserFlow: SiteAgent v1 — The Human Journey
_Locked via grill — by Claude + Dineshraj. Terms per `CONTEXT.md`. Builds on `AgentPlan.md` (what it does) + `Architecture.md` (what runs where). This doc = how people move through it._

## Goal
Define the end-to-end user experience for v1: who the actors are and the concrete step-by-step flows for onboarding, editing (content + structural), previewing, publishing, discarding, failure/rollback, and the edge cases (rejections, concurrency). The guiding principle: **the customer sees a simple "edit → preview → Publish" loop; all the ChangeSet/branch/saga machinery from `Architecture.md` stays invisible.** Non-technical customers should never see a branch name, a deploy step, or a raw error.

## Actors
- **Operator** — owns the Product; onboards Tenants by hand in v1; receives failure notifications; is the only one who can roll back a *published* change.
- **Tenant (customer)** — non-technical; logs in to a ready workspace and edits their one Site by chatting with the **Agent** or editing directly in the tenant-scoped CMS.
- **Site visitor** — out of scope here; they only ever see the published static Site.

## Visible state model (what the customer can perceive)
The customer-visible Site states (machinery stays hidden):
1. **Published** — live site and draft are in sync; nothing pending.
2. **Draft changes pending** — one or more unpublished edits accumulated in the (invisible) active ChangeSet; banner: *"● N draft changes not yet live"* with a **short list of what changed** + **[Publish]** / **[Discard changes]**.
3. **Reviewing changes** (transient, structural/code publishes only) — *"We're reviewing your layout changes before they go live."* Some structural publishes touch code paths that require **CODEOWNERS human review** (`Architecture.md` §D); the customer waits on a person, not a spinner. Content-only publishes skip this state.
4. **Publishing…** (transient) — editing paused; ~1–2 min; resolves to Published or to a failure state.
5. **Publishing paused / recovery in progress** (failure) — the Site is in an unresolved failure state (`deployed_pending_publish` etc., `Architecture.md` §2/§D) where **new ChangeSets are blocked**; banner: *"Publishing is temporarily paused while we sort out an issue — your draft is safe."* Only the Operator can clear it.

The words **ChangeSet, branch, merge, deploy, saga, snapshot, CODEOWNERS** never appear in the customer UI. (They appear in the Operator's audit/logs only.)

### Loading/transient micro-states (first-class, not afterthoughts)
Every edit and every preview surfaces explicit states so the customer is never left guessing:
- **Agent:** *Thinking… → Applying your change… → Updating preview… → Done* (or *Couldn't apply that — nothing was changed, try rephrasing*).
- **Preview:** *Refreshing…* between a write and the rendered result, so a customer doesn't re-issue a request thinking it failed.
- **Direct editor:** *Saving… → Saved* (or *Couldn't save*).

## Flows

### Flow 0 — Operator onboards a Tenant (manual, v1)
1. Operator runs `provisionTenant()` (`Architecture.md` §1): private GitHub repo from Template, Payload tenant + **minimal-role service principal**, Cloudflare production (Pages) + preview (Workers) surfaces, Tenant→{repo, deploy} mapping, and a **human Tenant login** (Payload user).
2. Provisioning is an idempotent queued job; on partial failure it rolls back/cleans up and the Operator retries. **The Tenant is not invited until provisioning fully succeeds** (no half-built workspace ever shown).
3. Operator sends the Tenant a login link. _(Self-serve signup is out of scope — `AgentPlan.md` §8 future.)_

### Flow 1 — Tenant first login → workspace
1. Tenant logs in (Payload auth, multi-tenant scoped → they can only ever see their own Site).
2. Lands in the **workspace**: mode toggle on top, **chat on the left**, **live preview on the right** (already rendering their starter site from the Template), draft-status bar on the bottom.
3. Starter site means the preview is **never blank** on first run.

### Ensuring the active ChangeSet (shared precondition — Codex #1, R2-1)
Because the `beforeChange` hook **rejects any write with no active ChangeSet** (`AgentPlan.md` §3), the workspace **ensures an active ChangeSet atomically as part of the first actual write** — the first chat edit that produces a change, or the first editor **Save** — *not* on mere intent or on opening the direct editor. The ensure-then-write is one transaction, so a first write can never dead-end on `Forbidden`, **and** opening an editor and cancelling without saving creates **no** ChangeSet. As a backstop, any ChangeSet that ends up with **zero writes** is auto-deleted, so the *"Draft changes pending"* state never lights up for a ghost/empty ChangeSet. This applies to **both** edit paths.

### Flow 2 — Content edit via chat (the primary path)
1. Mode toggle is on **"Edit content"** (default).
2. Tenant types: *"change the hero heading to 'Summer Sale'"*.
3. Agent shows **Thinking…**; Agent (Gemini for content) interprets → calls the **Tool broker** (the write itself ensures the active ChangeSet, above) → broker writes via the **single audited Local-API adapter** as the Tenant's **service principal** (`overrideAccess:false`); the `beforeChange` hook stamps the active ChangeSet.
4. UI shows **Applying your change… → Updating preview…**; the **live preview (SSR-on-Workers, drafts)** refreshes to show the change; draft media (if any) loads via the Brain's **draft-media proxy**.
5. Draft-status bar updates: *"● 1 draft change not yet live"*. Agent confirms in chat: *"Done — your hero heading now reads 'Summer Sale'."*
6. **If the write fails** (broker/validation error): *"I couldn't apply that — nothing was changed. Want to try rephrasing?"* — no partial state, draft count unchanged.
7. Tenant keeps editing; changes accumulate in the same ChangeSet.

### Flow 3 — Content edit via direct CMS (secondary path) (Codex #1, #11)
1. Tenant clicks **"Edit this directly"** on a previewed element → opens an **embedded, element-scoped editor panel** (a focused Payload field group for *just that element*) — **not** a navigation into the full Payload admin. The panel has clear **Cancel / Save** and its own error state.
2. They edit fields and Save (**Saving… → Saved**). The first Save **ensures the active ChangeSet atomically** (above), so it can't hit `Forbidden`; the **same `beforeChange` hook** forces the write into the active ChangeSet — so admin edits and agent edits land in the exact same batch.
4. Preview refreshes the same way. Draft-status bar reflects it. (Agent and human edits are interchangeable within one ChangeSet.)
5. **Cancel** discards the in-panel edits only (not the whole ChangeSet) and closes the panel.

### Flow 4 — Structural edit ("Change layout")
1. Tenant flips the mode toggle to **"Change layout"** (explicit — no auto-classification, `AgentPlan.md` §6).
2. Tenant provides a **design reference**: either **describes it in words** ("add a 3-column pricing section under the hero") or **uploads an image/screenshot** (URL-copy and Figma are out of scope for v1).
3. Agent (Claude for structural) maps the reference to **pre-approved global Section primitives** from the **primitive registry** — choosing/ordering/configuring them. Most of this is page-builder content via the broker → Payload; any per-Tenant code tweak is theme/CSS only, on the ChangeSet branch, within the path allowlist.
4. The composed layout renders in the **live preview**. Tenant refines in chat (*"make the columns wider"*) → repeat.
5. **No-fit case (Codex #4, R2-4):** if the reference needs a primitive that doesn't exist, the Agent says plainly *"I can't build that exact section yet — here's the closest I can do,"* and shows the closest primitives as an **ephemeral client-side preview overlay** — a temporary mock rendered in the preview pane that is **NOT written to the ChangeSet** (the real preview still reflects only the committed draft, consistent with `Architecture.md` §C). Only on explicit confirm (*"Use this version?"* **[Add to my changes] / [No, leave it]**) does the Agent actually compose the primitives through the broker into the draft/ChangeSet. It also logs a **new-primitive request for the Operator**. The Tenant cannot force a new primitive (it would be a Product-level/global release, `AgentPlan.md` §4).

### Flow 5 — Preview review (Codex #7)
- The preview pane always shows the **draft** (live SSR), gated by Cloudflare Access but seamless to the logged-in Tenant. The preview reflects every accumulated draft change in the active ChangeSet.
- **Open-in-new-tab fallback:** if Cloudflare Access can't be proven seamless for the preview URL shape (`Architecture.md` §C/#16), the preview is **served through the Brain** (already behind the Tenant's session) instead of a raw `*.workers.dev` link — the customer always gets a working preview, never an Access login wall they can't pass.
- **Session-expired:** if the preview load 401s (session lapsed), the pane shows *"Your session expired — refresh to see your preview"* with a re-auth action, not a broken frame.

### Flow 6 — Publish (happy path) (Codex #3)
1. Tenant clicks **[Publish]**.
2. UI → **"⏳ Publishing your changes… (~1–2 min)"**; the workspace is **locked from new edits** for this Site.
3. **Only if the batch modifies code-owned paths** (the build-surface/structural-code set that CODEOWNERS protects — `Architecture.md` §D/§9, R2-2) does the publish **wait for a human (Operator/platform) review** before it can merge. The customer sees the **"Reviewing changes"** state — *"We're reviewing your layout changes before they go live; we'll email you when they're up."* — and may safely leave. **Content-only publishes and pure-composition layout changes** (which touch only the generated snapshot/manifest data, not code-owned paths) **auto-satisfy the review check and go straight through** — no manual approval per content edit.
4. Behind the scenes the publish **saga** runs (`Architecture.md` §D): materialize+sanitize snapshot → stage media → protected merge (after review, if required) → single build → deploy → publish-via-Payload-API. The customer sees **none** of these mechanics.
5. On success → **"✅ You're live! [View site]"**; state returns to **Published**; editing unlocks.
6. Promise shown once, plainly and honestly (R2-3): *"If publishing hits a problem, we preserve your draft and restore the last safe version of your live site."* (Avoids the over-absolute "completely or not at all," since a post-deploy failure can briefly serve the new version before rollback — Flow 7.)

### Flow 7 — Publish failure (auto-safe, honest copy — Codex #2)
The message depends on **whether production was touched yet**:
1. **Pre-live failure** (failed before the merge/deploy reached production — e.g. merge conflict, build fail): compensation runs (`Architecture.md` §D); customer sees **"⚠️ Publish didn't complete. Your live site is unchanged and your draft changes are safe. [Try again]"**.
2. **Post-deploy failure** (`deployed_pending_publish` / failed-after-merge — production briefly served the new version): the truthful copy is **"⚠️ Publish hit a problem. We're restoring your previous live version — your draft changes are safe."** — **not** "unchanged," because for a moment it wasn't. The saga reverts the merge and waits for the rollback deploy to succeed before clearing the state.
3. In both cases: **never** a stack trace or a request to debug. **Draft changes are preserved** (the ChangeSet survives). The **Operator is notified** (correlation ID + audit detail).
4. While the Site is in an unresolved failure state, it sits in the **Publishing paused / recovery** visible state (above); **new ChangeSets are blocked** until the Operator clears it.

### Flow 8 — Discard (self-serve undo, pre-publish) — a locked transaction (Codex #9)
1. Tenant clicks **[Discard changes]** → confirm dialog (*"This removes all N unpublished changes and restores your last published version. This can't be undone."*).
2. Discard is **disabled while Publishing/Reviewing** (you can't discard mid-publish).
3. On confirm, discard runs as a **single locked transaction** that:
   - **takes the per-Site lock and quiesces in-flight work first (R2-5):** it does not claim to abort an already-committed write — instead it acquires the lock, **waits for any in-flight agent/editor write to finish (or marks its result to be ignored)**, and blocks new ones, so no write can re-create draft state mid-discard,
   - discards the active ChangeSet's **draft content** *and* tears down its **code branch** and **preview deployment** (not just content — covers layout/structural edits too),
   - reference-safe-GCs any **staged media** (`Architecture.md` §2 `media_refs`),
   - **invalidates stale editor/admin tabs** (see Flow 10) so a leftover tab can't save into the now-gone ChangeSet,
   - returns the Site to **Published**.
4. This is the everyday "oops, start over" path.

### Flow 9 — Rejected / blocked edits (plain-language)
- Any edit the broker refuses returns a **plain reason**, never a raw error:
  - cross-Tenant / out-of-scope → *"I can't do that."*
  - structural request with no matching primitive → Flow 4 no-fit message.
  - edit attempted with no active ChangeSet on a system path → impossible for the customer (hook guarantees it); logged for the Operator.

### Flow 10 — Concurrency (one editor per Site, v1) — lease-based (Codex #5, #6)
- **One active editing session per Site**, held by a **heartbeat lease** (the editing tab renews it every ~N seconds), not a permanent flag.
- A **second person** from the same Tenant opening the workspace sees a **read-only "Someone is editing this site right now"** state.
- **Stale/crashed session:** if the lease isn't renewed within the timeout (tab closed, crash, network drop), the lock is considered stale and another editor may **[Take over editing]** — with a plain warning that the previous session will become read-only. No Site is ever permanently locked by a dead tab.
- **Server-side enforcement (not just UI):** the lock + the publish/discard "locked" state are enforced **on the write path**, so a **stale Payload admin tab** that tries to Save during publish/discard or after a takeover is **rejected server-side** with *"Publishing is in progress (or someone else is editing) — your edit was not applied"* + a refresh action. The UI lock is a convenience; the server check is the guarantee (same posture as the `beforeChange` hook).

### Flow 11 — Post-publish regret → Operator rollback
1. A *published* change is bad. The Tenant clicks **"Something's wrong with my live site — get help"** → **notifies the Operator** (no self-serve live-revert in v1).
2. The Operator triggers the **rollback** (`git revert` + Payload version restore → re-run saga, `Architecture.md` §D). The Tenant is kept informed in plain language (*"We're restoring your previous version."*).

## Accessibility & responsive (Codex #12)
The chat-left / preview-right split and "click an element to edit it" are **pointer-and-wide-screen assumptions** that must not be the only path:
- **Responsive:** on narrow/mobile screens the workspace collapses to **switchable tabs** (Chat · Preview · Changes) instead of a side-by-side split.
- **Keyboard:** every previewed editable element is **keyboard-selectable** (focusable + Enter to open its editor); the mode toggle, Publish, Discard, and Take-over are all keyboard-reachable and labeled.
- **Screen readers:** controls and state changes (draft count, publishing, success/failure) are announced via labeled controls / live regions, not colour-only cues.
- **Non-pointer direct editing:** "Edit this directly" is reachable without hovering a preview element (e.g. a list of editable elements), so direct editing doesn't require a mouse.

## Key decisions & tradeoffs
- **Operator-provisioned onboarding, not self-serve** (v1). Simpler + safer at pilot scale; self-serve is a later milestone. _(Grill Q1.)_
- **Implicit ChangeSet — edit → Publish, no session concept.** The branch/ChangeSet stays invisible; customer sees only Published vs Draft-pending. Tradeoff: less explicit control, but far simpler for non-technical users; **Discard** covers undo-all. _(Grill Q2.)_
- **Chat-first workspace; direct-CMS editing as a secondary side panel.** True to the AI-first pitch; one main place to work. Tradeoff: slightly de-emphasizes the "both edit equally" promise. _(Grill Q3.)_
- **Structural references = words + image upload only** in v1; URL-copy + Figma deferred. _(Grill Q4.)_
- **Publish shows a simple status, not the saga steps;** all-or-nothing messaging; draft preserved + Operator notified on failure; editing locked during publish. _(Grill Q5.)_
- **Rollback is Operator-only in v1;** Discard is the customer's self-serve undo (pre-publish only). _(Grill Q6.)_
- **One editor per Site at a time;** a second editor gets a read-only "someone's editing" state.

## Risks / open questions
_(Items the flows above already mitigate — preview "Refreshing…" state, a short list of pending changes by Publish/Discard, and the embedded element-scoped editor — are resolved in-flow and not repeated here.)_
- **Locked-during-publish** on a flaky free host could strand a Site in "Publishing…" — depends on the saga's durability/timeout handling (`Architecture.md` §D) and a **max-time fallback** that surfaces Flow 7. (Another reason the warm paid tier is the real pilot floor.)
- **Mode-toggle discoverability** — customers may try a layout change while in "Edit content" mode. The agent should detect the intent mismatch and *suggest* switching modes (without auto-switching, per `AgentPlan.md` §6).
- **Tenant roles / multiple users per Tenant** — v1 assumes effectively one editor; real teams (roles, who-can-publish) are unspecified, inherited from `AgentPlan.md`.

## Out of scope (v1)
- Self-serve signup; customer-facing live rollback; multi-user/role-based Tenant teams.
- URL-copy and Figma design references; auto-classification of content vs layout intent.
- Any visitor-facing flow; analytics; billing/upgrade UX.

## Review status
- Act 1 (grill) complete — flows locked with the user. PLAN_FILE=`UserFlow.md`.
- Act 2 (Codex): **R1 REVISE (12) → R2 REVISE (5) → R3 ✅ APPROVED.** Converged in 3 rounds; 17 findings raised, all resolved, 0 rejected.
