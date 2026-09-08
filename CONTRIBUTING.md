# Contributing

Thanks for looking. Two things to know, and they take a minute.

## 1. Run the gate

```sh
npm ci
npm run hooks    # once per clone: arms the pre-commit and commit-msg hooks
npm run verify   # lint, typecheck, test, build — the same command CI runs
```

CI runs `npm run verify` and `npm run secrets` on Linux and on Windows. Exit 0
is the only pass, so if it is green locally on either OS you are most of the way
there. If it is red, please do not open the pull request yet.

The hooks refuse two things before a commit exists: a credential in the staged
content, and a `Co-authored-by:` trailer whose address is not a human in
`.githooks/co-authors`.

## 2. Only erasable TypeScript

This is the one rule that will surprise you, because everything looks fine until
`npm test` runs.

The tests import the `.ts` source **directly**. There is no build step: Node
strips the types and runs what is left. So any TypeScript that *emits runtime
code* is refused outright, with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`:

```ts
// refused — a constructor parameter property emits an assignment
class CopyAlreadyOut extends Error {
  constructor(readonly copyId: number) { super() }
}

// fine — declare the field, assign it in the body
class CopyAlreadyOut extends Error {
  readonly copyId: number
  constructor(copyId: number) {
    super(`copy ${copyId} is already on loan`)
    this.copyId = copyId
  }
}
```

Same story for `enum` and `namespace`: use a `const` object with `as const`, or
a plain module. And relative imports carry the explicit extension —
`from "./connection.ts"`, not `from "./connection"`.

Two extra lines, and the test suite needs no toolchain at all.

## Everything else

- **No new dependencies.** If a Node built-in does the job, it wins. A new
  dependency needs a written reason in the pull request.
- **English** in code, comments, file names and commit messages.
- `AGENTS.md` is the short version of the house rules, and it is true; read it
  before a first change.

By contributing you agree that your contribution is licensed under Apache-2.0,
the licence of this project.
