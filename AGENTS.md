# bookkeep — read this before writing a line

A library management system: books, copies, members, loans. Next 16 App Router,
React 19, Tailwind 4, shadcn in the `base-nova` style over `@base-ui/react`,
SQLite through Node's built-in `node:sqlite`.

**This project is written in English** — code, comments, file names, commit
messages, documentation. It is public; the owner's other repositories are not.

## Before you say you are finished

```sh
npm run verify   # lint, typecheck, test, build
npm run secrets  # the credential scan, over everything Git tracks
```

Those two are the whole gate, and they are the two steps `.github/workflows/verify.yml`
runs — on `ubuntu-latest` and on `windows-latest`, nothing CI-only added.

Green bought by switching a rule off is debt, not completion.

## The five things that are invisible until they bite

| if you do this | what actually happens |
| --- | --- |
| write TypeScript that is not ERASABLE — a constructor parameter property (`constructor(private id: number)`), an `enum`, a `namespace`, `declare` fields with initialisers | `npm test` dies with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. The tests import the `.ts` files **directly**, with no build step; Node strips types, it does not compile them. Anything that emits runtime code from a type is refused. Declare the field and assign it in the constructor body — two extra lines buy a test suite that needs no toolchain |
| write a relative import without the extension (`from "./connection"`) | it does not resolve. Node's ESM resolver does not guess extensions, so relative imports are written **`./connection.ts`**, including from `.mjs` test files. `tsconfig.json` has `allowImportingTsExtensions` for this reason |
| `npm install` anything | **zero new dependencies.** `node:sqlite` is in the standard library, and everything the app needs is already installed. A new dependency needs a written reason and a built-in that cannot do the job. `better-sqlite3` in particular buys a native compiler on every machine and a rebuild on every Node ABI bump |
| ask the database a question and then act on the answer — `if (copyIsFree) lend()` | that is two statements with a gap between them, and the gap is where the same copy goes home with two people. The shape here is **"try, then translate"**: run the insert, let the constraint refuse, catch the SQLite error and throw a domain error (`CopyAlreadyOut`). Never "check, then act" for anything the database itself can refuse |
| commit a credential, or sign a commit with `Co-authored-by:` | the hooks refuse it before the commit exists. Arm them once with `npm run hooks`. A secret that reaches the history is not fixed by another commit — the credential has to be ROTATED. The co-author allowlist is `.githooks/co-authors`, it holds **humans**, and the owner edits it |

## Two more facts, so you do not "fix" them

- **`node:sqlite` prints an `ExperimentalWarning` on every boot.** Known and
  accepted. The API can move between Node minors, which is exactly why every
  call into it lives behind `lib/db/connection.ts` — swapping the driver means
  rewriting that one file. The bet is cheap to lose, and that is the point.
- **The database file is created and migrated on boot**, from
  `lib/db/schema.sql`, on every start. The schema is idempotent, so a database
  cannot drift from the file that describes it. Do not add a migration runner.

## The scaffold's own notice, kept as it came

The block below is from `shadcn create`. It stays INTACT on purpose: it talks
about the version of Next installed here and ages together with it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
