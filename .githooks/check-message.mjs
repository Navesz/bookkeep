#!/usr/bin/env node
// Refuses a `Co-authored-by:` trailer that does not name a human on the
// allowlist. Called by the commit-msg hook with the path to the message file.
//
// WHY AN ALLOWLIST OF HUMANS AND NOT A LIST OF AI AGENTS. A list of agents is a
// race you lose every week: a new assistant ships, it writes a trailer the list
// has never heard of, and the rule silently passes. The humans working on a
// project are a short list that changes about once a year. So the question this
// hook asks is not "is this an AI?" but "is this one of us?".
//
// WHY IT RUNS HERE AND NOT IN CI. A trailer in the history only comes out by
// rewriting the history. The commit-msg hook runs while the message is still a
// file on disk and the commit does not exist yet — it stops the trailer from
// ENTERING, which is the only cheap moment.
//
// WHY IT ASKS GIT WHAT A TRAILER IS.
//
//   git stripspace --strip-comments   |   git interpret-trailers --parse
//
// Hand-rolled parsing gets this wrong in a way that matters. The obvious
// approach is to cut the text at the `# ---- >8 ----` scissors line so the diff
// that `git commit -v` pastes below it is not scanned. But git drops the
// scissors line BECAUSE IT IS A COMMENT and keeps everything after it — so a
// trailer written below the scissors survives into the commit while the naive
// parser never looks at it. `stripspace --strip-comments` is the same cleanup
// the commit itself applies (it honours a changed `core.commentChar`, which
// hand-cutting does not), and `interpret-trailers` is git stating what it
// considers a trailer, line folding already resolved. Either command alone is
// not enough; both, in this order.
//
// Exit codes: 0 accepted · 1 refused · 2 the hook could not run.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ALLOWLIST_NAME = join(".githooks", "co-authors")

// fileURLToPath, not `.pathname`: on Windows the pathname arrives as
// "/C:/Users/…", with a slash before the drive letter, and join then builds
// C:\C:\Users\… — a path that cannot exist.
const HERE = dirname(fileURLToPath(import.meta.url))

function runGit(argv, input) {
  return execFileSync("git", argv, {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
}

function repoRoot() {
  try {
    const out = runGit(["rev-parse", "--show-toplevel"]).trim()
    if (out) return out
  } catch {
    /* no git: fall back to the known layout */
  }
  return join(HERE, "..")
}

// `Name <email>` is the normal form; a bare address also counts, for anyone who
// writes the allowlist with addresses only. Lower-cased, because the local part
// of an address is not worth arguing about and the display name identifies
// nobody.
const emailOf = (value) => {
  const m = /<([^<>]*)>/.exec(value)
  const raw = (m ? m[1] : value).trim().toLowerCase()
  return raw.includes("@") ? raw : null
}

// Read from disk, not from the index: at commit-msg time the allowlist may be
// edited in this very commit, and demanding that it already be in HEAD would
// make the commit that ADDS a person impossible to write.
function readAllowlist(root) {
  const path = join(root, ALLOWLIST_NAME)
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch (error) {
    return {
      path,
      emails: null,
      error: error.code === "ENOENT" ? "does not exist" : error.code,
    }
  }
  const emails = new Set()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const email = emailOf(line)
    if (email) emails.add(email)
  }
  return { path, emails, error: null }
}

/** The trailers, according to git itself. Throws if git is unavailable. */
function trailersFromGit(text) {
  const clean = runGit(["stripspace", "--strip-comments"], text)
  return runGit(["interpret-trailers", "--parse"], clean)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
}

/**
 * Used only when git does not answer — which inside a git hook is close to
 * impossible, but "close to" is not "never", and this must not degrade into a
 * silent catch that approves everything.
 *
 * It deliberately does NOT cut at the scissors line, and it requires the
 * trailer to start at column 0. Every diff line that `git commit -v` pastes is
 * prefixed with `+`, `-` or a space, so the false positive that cutting was
 * meant to avoid never reaches column 0 anyway. In exchange this parser does
 * not know what a "last paragraph" is, so it may flag a `Co-authored-by:` line
 * loose in the body that git would not treat as a trailer. Erring towards
 * refusing is the right direction here.
 */
function trailersByHand(text) {
  return text
    .split(/\r?\n/)
    .filter((l) => !l.startsWith("#"))
    .filter((l) => /^[A-Za-z][A-Za-z0-9-]*:/.test(l))
    .map((l) => l.trim())
}

// ── main ─────────────────────────────────────────────────────────────────────

const file = process.argv[2]
if (!file) {
  console.error("check-message: missing the path to the message file")
  process.exit(2)
}

let text
try {
  text = readFileSync(file, "utf8")
} catch (error) {
  console.error(`check-message: could not read ${file}: ${error.message}`)
  process.exit(2)
}
// CRLF normalised before anything else: on Windows the message editor writes
// \r\n, and a stray \r left hanging on the end of an address would break the
// comparison without ever showing up in the output.
text = text.replace(/\r\n/g, "\n")

let trailers
let fellBack = false
let whyFellBack = ""
try {
  trailers = trailersFromGit(text)
} catch (error) {
  fellBack = true
  whyFellBack =
    (error.stderr || error.message || "").toString().trim().split("\n")[0] ||
    "git unavailable"
  trailers = trailersByHand(text)
}

if (fellBack) {
  console.error(
    `[co-authors] warning: could not use git to read the trailers (${whyFellBack}).\n` +
      "             Fell back to the parser in this file, which is dumber than\n" +
      "             git: it understands neither line folding nor paragraphs."
  )
}

const coAuthors = trailers
  .filter((t) => /^co-authored-by\s*:/i.test(t))
  .map((t) => ({ line: t, email: emailOf(t.slice(t.indexOf(":") + 1)) }))

if (coAuthors.length === 0) process.exit(0)

const { path, emails, error } = readAllowlist(repoRoot())

// With no allowlist, EVERY co-author is refused. Fail closed: the alternative
// is that deleting one file becomes the easiest way to switch the rule off.
const strangers = emails
  ? coAuthors.filter((c) => !c.email || !emails.has(c.email))
  : coAuthors

if (strangers.length === 0) process.exit(0)

console.error("\n[co-authors] co-authorship trailer outside the allowlist:\n")
for (const s of strangers) console.error(`  ${s.line}`)

if (error) {
  console.error(
    `\nAnd there is no allowlist to consult: ${path} — ${error}.\n` +
      "Until it exists, NO Co-authored-by trailer passes."
  )
} else {
  console.error(
    `\nAccepted humans (${emails.size}), read from ${path}:\n` +
      [...emails].map((e) => `  ${e}`).join("\n")
  )
}

console.error(
  "\nThe policy is an ALLOWLIST OF HUMANS, not a list of AI agents: a list of\n" +
    "agents is out of date the week after it is written, and the rule then\n" +
    "passes in silence. If this co-author is a person on the project, add\n" +
    `their address to ${ALLOWLIST_NAME} — in this same commit, if you like.\n\n` +
    "If it is an AI, drop the line and commit again. The real fix is not to\n" +
    "generate the trailer at all; in Claude Code that is\n" +
    '  .claude/settings.json  ->  { "includeCoAuthoredBy": false }\n' +
    "so the string never exists and there is no false positive to argue about.\n"
)
process.exit(1)
