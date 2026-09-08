# bookkeep

> **A library management system that cannot lend the same copy twice — because
> the row cannot exist, not because someone remembered to check.** Catalogue,
> copies, members and loans, on one machine, in one file. **No accounts. No
> authentication. No static host: it needs a process and a writable disk.**

[![verify](https://github.com/Navesz/bookkeep/actions/workflows/verify.yml/badge.svg)](https://github.com/Navesz/bookkeep/actions/workflows/verify.yml)
[![License](https://img.shields.io/github/license/Navesz/bookkeep)](LICENSE)

[About page](https://navesz.github.io/bookkeep/) · [House rules](AGENTS.md) · [Contributing](CONTRIBUTING.md)

```sh
npm ci
npm run seed   # 15 books, 28 copies, 5 members, 5 loans already out
npm run dev
```

Node 24 (`.nvmrc`). The database creates itself in the project root on first
boot, from `lib/db/schema.sql`, and `.gitignore` keeps it out of the history —
it holds member names and e-mail addresses, and this repository is public.

---

## The one rule

Two librarians scan the same barcode at the same moment. "Select the open loans
for this copy; if there are none, insert" reads zero on both desks and inserts
twice, and the shelf now owes two people the same object. The window is
milliseconds and it opens on the busy afternoon when two people are working the
desk.

So the rule is not in the application:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS one_open_loan_per_copy
  ON loan (copy_id) WHERE returned_at IS NULL;
```

The second `INSERT` fails. `lend()` in `lib/db/loans.ts` never asks whether the
copy is free — it inserts, catches SQLite's
`UNIQUE constraint failed: loan.copy_id`, and throws `CopyAlreadyOut`. Try, then
translate; never check, then act. The `WHERE returned_at IS NULL` is what keeps
it usable: closed loans leave the index, so a returned copy goes out again and
its history stays whole.

`tests/loans.test.mjs` proves it the only way worth proving: it lends, lends
again, and asserts that exactly one open loan exists whatever the caller tried.

## What is here today

Nine routes, and a librarian can work a whole day in them: the catalogue with
search, a book with its copies, the desk that stays open all day, members, one
member's loans and history, what is overdue, and the three forms that add a
book, a copy and a member.

`lib/db/` — schema, catalogue, members, loans, seed — and the server actions in
`app/actions.ts` are covered by 69 test cases that run against a real SQLite
file in a temporary directory, because a mock of the database would be a mock of
the exact thing under test.

**Reading works without JavaScript.** Search is a plain GET with the query in
the URL, and the pages are server components that call the database in the same
process — which is the whole reason to choose SQLite. JavaScript makes it
quicker; it is not what makes it work.

`npm run build` prints the routes that actually answer, which is the only
version of that list that cannot go stale. Worth running rather than trusting
this paragraph, because the repository this one replaces had a 12 KB README, a
`package.json` with eight scripts pointing at files that are not in the tree,
and no `app/` directory at all.

## Zero dependencies under the UI

`lib/db/` imports `node:sqlite`, `node:fs`, `node:path` and `node:url`. Nothing
else. Node 24 ships SQLite 3.50.4 in the standard library, so there is no
database server to run, no native module to compile on every machine that
installs, and no rebuild when Node bumps its ABI.

**The price, stated.** `node:sqlite` is experimental: it prints
`ExperimentalWarning: SQLite is an experimental feature and might change at any
time` on every boot, and its API can move between Node minor releases. Every
call into it lives behind `lib/db/connection.ts`, so trading it for
`better-sqlite3` means rewriting one file. The bet is cheap to lose.

**It cannot be published to GitHub Pages.** It answers requests and writes to a
file; a static host gives you neither a process nor a writable disk. One machine
with Node on it is the deployment. There *is* a page at
[navesz.github.io/bookkeep](https://navesz.github.io/bookkeep/), and it is a
page **about** this — not a copy you can use. The distinction is the same one
this paragraph is making, so the page makes it too.

**There is no authentication.** Anyone who can reach the port is the librarian.
Run it where you control who can.

## The gate

```sh
npm run verify   # lint → typecheck → test → build
npm run secrets  # scan everything Git tracks for credentials
npm run hooks    # once per clone: arms pre-commit and commit-msg
```

`verify` is the whole gate and CI runs exactly it, plus `secrets`, on
`ubuntu-latest` **and** `windows-latest` — the same command, so green on your
machine means something. Exit 0 is the only pass; no step may continue on error.

Two things are refused before the commit exists, because afterwards is too late:

- **A credential in the staged content.** A secret that reaches the history is
  not undone by a later commit — the credential has to be rotated.
- **A `Co-authored-by:` trailer whose address is not a human listed in
  [`.githooks/co-authors`](.githooks/co-authors).** An allowlist, not a list of
  AI assistants: that list is stale the week after it is written.

`git commit --no-verify` skips both once. CI has no such option, and there
`secrets` reads the whole repository rather than one commit.

## Three things that will surprise you

| | |
| --- | --- |
| **Erasable TypeScript only** | The tests import the `.ts` files directly, with no build step — Node strips types, it does not compile them. A constructor parameter property, an `enum` or a `namespace` emits runtime code, and the run dies with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Declare the field, assign it in the constructor body |
| **Relative imports carry the extension** | `from "./connection.ts"`, including from the `.mjs` tests. Node's ESM resolver does not guess; `tsconfig.json` has `allowImportingTsExtensions` for exactly this |
| **Zero new dependencies** | A built-in that does the job wins. Anything else needs a written reason in the pull request |

The long version, with the reasoning, is in [`AGENTS.md`](AGENTS.md) and
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

[Apache-2.0](LICENSE) — permissive like MIT, plus an explicit patent grant and a
[`NOTICE`](NOTICE) file, which is what lets a company adopt it without asking a
lawyer first.

Copyright 2026 Naves.
