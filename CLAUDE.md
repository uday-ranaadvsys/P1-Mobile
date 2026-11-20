# floman mobile app (P1-Mobile)

The phone app for **floman** (the TENANTS ERP: quotations, sales orders, invoices, delivery challans,
Inward DCs, purchase, GRNs, payments, ledger, reports). This repo holds **only the mobile app**. The web
app and the server live in the P1 repo; this chat works on the app and leaves P1 to the web chat.

## Shared memory with the web project

Read the web project's memory first. Its decisions, rules and the user's preferences apply here too:

@C:/Users/Uday/.claude/projects/d--RANA-SOFTWARE-TO-SELL-P1/memory/MEMORY.md

Open the linked memory files when a task touches them (e.g. permissions, GST rules, document flows).

> **The P1 memory is READ ONLY from this chat.** Never create, edit, rename or delete anything in
> `C:/Users/Uday/.claude/projects/d--RANA-SOFTWARE-TO-SELL-P1/memory/` (not `MEMORY.md`, not any linked
> file), even if a fact there looks out of date or wrong. Only the web chat writes there. If something in
> it seems wrong or missing, tell the user instead.
> Enforced in `.claude/settings.json`: file edits there are denied, and any shell command naming that
> folder is blocked by a hook. Read it with the Read tool only. Don't loosen these settings.

Mobile-only decisions go in **this** project's own memory, not the web one.

## Where things are

| What | Where | Rule here |
|---|---|---|
| Web app (React) | `D:/RANA/SOFTWARE TO SELL/P1/TENANTS/client` | Read only: the reference for screens, wording and flows |
| Server (Express + Prisma, one DB per tenant) | `D:/RANA/SOFTWARE TO SELL/P1/TENANTS/server` | Read only. The app uses its API (`/api/v1/...`) |
| Shared rules (statuses, GST, document totals, permissions, quantity, document types) | `D:/RANA/SOFTWARE TO SELL/P1/TENANTS/shared` | Reuse by path, never copy: one set of rules for web, server and app |
| App reference (what every screen and rule does) | `D:/RANA/SOFTWARE TO SELL/P1/Docs/APP_REFERENCE.md` | Read before building a screen |
| Production | app.thefloman.com | |

## How work is split between the two chats

- **Web chat** (folder `P1`): customer fixes, web features, and **every server / API change**. Branches
  there: `tenants` (customer fixes → production), `uday-development` (new builds).
- **Mobile chat** (this folder): the app only. When the app needs something from the server (e.g. phone
  login with tokens, a new endpoint), **don't edit P1**: write down exactly what is needed (endpoint, fields,
  why) and tell the user, who takes it to the web chat.
- Business rules stay on the server and in `shared/`; the app never re-implements them.

## Working rules (from the user, same as the web project)

- Plan first, ask doubts with a recommendation, then build; stop at checkpoints for the user to test.
- **The user does all git** (commit, switch, merge, push): give the exact commands, explained step by step;
  never run them yourself. No Co-Authored-By line.
- Short, simple messages and app wording, the same words as the web screens.
- Helper text goes in a tooltip / info icon, not grey lines under fields.
- No hardcoded statuses, codes or messages: take them from `shared/` or the server's constants.
- Keep usage lean.

## Open decisions (settle these first in this chat)

1. **How the app is built**: Expo React Native (recommended: real app, camera, push, offline-tolerant),
   or PWA / Capacitor (wrap the web app).
2. **Phones**: Android first (Play Store $25 once) or Android + iPhone (App Store $99/year).
3. **Version 1 screens**: suggested: login + choose company, Today (approvals, Fix list), Approve / Return
   for every document, Ctrl K search + view any document, Receive / Pay, Inward DC and GRN with the camera
   for challans and bills, share PDF (WhatsApp / email). Full create forms later, one at a time.
4. **Server needs for v1**: phone login with tokens (the web uses browser cookies); confirm what else.

## The mobile agent

Once the app's base exists, create a `mobile-sync` agent (`/agents`, or `.claude/agents/mobile-sync.md`):
given web commits from P1, it decides whether the feature belongs on mobile, builds it reusing `shared/`
and the API, type-checks, and reports what to test on a phone. Teach the user each step while creating it.
