#!/usr/bin/env node
// Secret scan. Refuses a commit that carries a credential.
//
// WHY THIS IS THE ONE CHECK THAT RUNS BEFORE THE COMMIT EXISTS. Lint, types,
// tests and build are all fixable by a later commit. A secret is not: once it
// is in the history the credential has to be ROTATED, and rewriting history
// comes after that, not instead of it. The project this repository replaces
// shipped a committed `.env.local`. Nobody decided to do that — there was
// simply nothing in the way.
//
// Zero dependencies, and it scans what Git tracks rather than what is on disk:
// an ignored file is not a risk, and `node_modules` is not ours.
//
// Usage:
//   node .githooks/scan-secrets.mjs            everything Git tracks
//   node .githooks/scan-secrets.mjs --staged   only what is staged (the hook)
//   node .githooks/scan-secrets.mjs --json
//
// Escape hatch, on the line of the finding:  // secret-ok: <reason>
// The reason is required. A suppression with no reason written next to it is
// the exact shortcut this tool exists to close.
//
// Exit codes: 0 clean · 1 findings · 2 the tool itself could not run.

import { execFileSync, spawnSync } from "node:child_process"
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const stagedOnly = args.includes("--staged")
const asJson = args.includes("--json")

// A file bigger than this is scanned up to the ceiling and the truncation is
// PRINTED. The ceiling exists so a huge blob cannot hang the hook; it does not
// silently drop anything, because a skip nobody sees is worse than a false
// positive, which a human at least reads.
const MAX_BYTES = 8 * 1024 * 1024

// A minified bundle is one enormous line. Long lines are sliced into
// overlapping windows instead of being skipped; the overlap is wider than the
// longest token we recognise, so nothing can hide on a seam.
const WINDOW = 2000
const OVERLAP = 200

// Memory ceiling per `git cat-file --batch` round. Blobs over MAX_BYTES never
// enter a batch, so a batch only grows by file count.
const BATCH_BYTES = 32 * 1024 * 1024

const ALLOW_MARK = /secret-ok:\s*\S+/

// ── What is not a secret ─────────────────────────────────────────────────────
//
// These are tested against the MATCHED SPAN, never against the whole line.
// Testing the line is the classic hole: `{ host: "localhost", token: "ghp_…" }`
// is a line any project writes, and one harmless word on it would switch off
// every rule for the real credential sitting beside it.

const STRONG_PLACEHOLDER =
  /\bexample\b|\bplaceholder\b|\bdummy\b|\bfake\b|\bsample\b|\bchange[_-]?me\b|\bxxx+\b|\byour[_-]|\.{4,}|\*{4,}/i

const PLACEHOLDER = new RegExp(
  [
    /process\.env|import\.meta\.env|\$\{|\$\(|<[^>]*>|\bnull\b|\bundefined\b/,
    /\btest[_-]?(?:key|token|secret|password)\b/,

    // The canonical Postgres/Docker development credential, and only in VALUE
    // position. The two lookaheads keep `postgres` from excusing itself when it
    // is the KEY, which is what keeps a real `POSTGRES_PASSWORD` a finding.
    /(?:^\s*|[=:(,[{]\s*|["'`])(?:postgres(?:ql)?|docker|local(?:host)?)(?![A-Za-z0-9_-])(?!\s*[:=])/,

    // A value that declares itself development-only. Marker plus separator plus
    // noun, so that `device`, `developer` and `devops` do not become a way to
    // switch the rule off.
    /(?<![a-z0-9])(?:dev|sandbox|staging)[_-](?:only|local|password|pass|pwd|key|token|secret|tests?)(?![a-z0-9])/,

    // A credential whose HOST is this machine. Whoever has the password already
    // has the machine. Anchored to the `@` of the userinfo, so it excuses the
    // host and never the line.
    /@(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)(?![\w.-])/,
  ]
    .map((r) => r.source)
    .join("|"),
  "i"
)

// ── What makes an identifier a credential key ────────────────────────────────
//
// The identifier is matched WHOLE and split into words here, in JavaScript.
// A lookbehind cannot do this: `(?<![A-Za-z0-9])token` never matches inside
// `githubToken`, because the character before `Token` is alphanumeric.
// Splitting handles camelCase, snake_case, UPPER_SNAKE, kebab and dotted at
// once.

const STRONG_KEYS = new Set([
  "password",
  "passwd",
  "passphrase",
  "pwd",
  "secret",
  "token",
  "apikey",
  "apitoken",
  "credential",
  "credentials",
])

// `key` and `auth` alone are noise: `sortKey`, `cacheKey`, `authUrl`. They
// count only next to a qualifier that turns them into a credential.
const WEAK_KEYS = new Set(["key", "keys", "auth", "cred", "creds", "signature"])
const QUALIFIERS = new Set([
  "api",
  "secret",
  "access",
  "private",
  "auth",
  "client",
  "signing",
  "encryption",
  "refresh",
  "session",
  "bearer",
  "master",
  "admin",
  "service",
])

// The subset whose value is a password a human typed rather than a token a
// machine generated. The two have different shapes and different false
// positives — see `looksLikeCredential`.
const PASSWORD_KEYS = new Set(["password", "passwd", "passphrase", "pwd"])

function identifierWords(identifier) {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // githubToken -> github Token
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // AWSSecret   -> AWS Secret
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
}

function keyKind(identifier) {
  const words = identifierWords(identifier)
  if (words.some((w) => PASSWORD_KEYS.has(w))) return "password"
  if (words.some((w) => STRONG_KEYS.has(w))) return "token"
  if (
    words.some((w) => WEAK_KEYS.has(w)) &&
    words.some((w) => QUALIFIERS.has(w))
  )
    return "token"
  return null
}

// A gate on the shape of the VALUE, because `token`, `key` and `secret` are
// compiler words as much as credential words. Two rules, each cutting one
// observed shape:
//   · a value containing whitespace is prose. An error message is not a secret.
//   · for the `token` kind the value must mix letters and digits. A generated
//     token essentially always has a digit; a PascalCase parser identifier
//     never does. Not applied to `password`, where a letters-only value is
//     ordinary and the word itself is not ambiguous in code.
function looksLikeCredential(kind, value) {
  if (/\s/.test(value)) return false
  if (kind === "password") return true
  return /[0-9]/.test(value) && /[A-Za-z]/.test(value)
}

function mixesCase(text) {
  return /[a-z]/.test(text) && /[A-Z]/.test(text) && /[0-9]/.test(text)
}

// Context NEAR the match, not the whole line. In a minified file the whole file
// is one line, so "does the line mention credentials?" is always yes and the
// gate gates nothing.
function contextMentions(line, start, end, pattern) {
  return pattern.test(line.slice(Math.max(0, start - 64), end + 16))
}

/**
 * `high: true` means a vendor prefix with a fixed length. Two consequences: the
 * placeholder list is not consulted (there is no 40-character placeholder that
 * starts with a GitHub token prefix), and the rule also runs inside binary
 * files, where the generic heuristics would be pure noise.
 *
 * `sensitive: false` means the matched span is not itself the secret — a PEM
 * header is public — so it can be printed in full.
 *
 * Order matters: the first rule to claim a span keeps it, so an assigned GitHub
 * token is one finding rather than two.
 */
const RULES = [
  {
    name: "private-key",
    high: true,
    sensitive: false,
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
  },
  {
    name: "aws-access-key-id",
    high: true,
    pattern:
      /(?<![A-Za-z0-9])(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}(?![A-Za-z0-9])/g,
  },
  {
    name: "github-token",
    high: true,
    pattern: /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{30,}(?![A-Za-z0-9])/g,
  },
  {
    // The current GitHub PAT does not use the old prefix, and a scanner that
    // only knows the old shape passes the new one straight through.
    name: "github-pat",
    high: true,
    pattern: /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{50,}(?![A-Za-z0-9])/g,
  },
  {
    name: "gitlab-token",
    high: true,
    pattern:
      /(?<![A-Za-z0-9])(?:glpat|gldt|glrt|glcbt|glptt|glsoat)-[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/g,
  },
  {
    name: "slack-token",
    high: true,
    pattern: /(?<![A-Za-z0-9])xox[baprse]-[A-Za-z0-9-]{10,}(?![A-Za-z0-9])/g,
  },
  {
    name: "google-api-key",
    high: true,
    pattern: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])/g,
  },
  {
    name: "google-oauth-secret",
    high: true,
    pattern: /(?<![A-Za-z0-9])GOCSPX-[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/g,
  },
  {
    // Stripe separates with an underscore, so a rule written for a hyphen
    // misses it entirely. The publishable key is deliberately out of scope: it
    // is published.
    name: "stripe-key",
    high: true,
    pattern:
      /(?<![A-Za-z0-9])[sr]k_(?:live|test)_[A-Za-z0-9]{16,}(?![A-Za-z0-9])/g,
  },
  {
    name: "sendgrid-key",
    high: true,
    pattern:
      /(?<![A-Za-z0-9])SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_-])/g,
  },
  {
    name: "npm-token",
    high: true,
    pattern: /(?<![A-Za-z0-9])npm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g,
  },
  {
    name: "huggingface-token",
    high: true,
    pattern: /(?<![A-Za-z0-9])hf_[A-Za-z0-9]{30,}(?![A-Za-z0-9])/g,
  },
  {
    name: "api-key",
    high: true,
    pattern:
      /(?<![A-Za-z0-9])sk-(?:ant-|proj-|or-)?[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/g,
  },
  {
    name: "jwt",
    high: true,
    pattern:
      /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?![A-Za-z0-9_-])/g,
  },
  {
    // The AWS secret key is 40 base64 characters with NO prefix — the id that
    // the rule above catches is the PUBLIC half. Because the secret half is
    // indistinguishable from a hash, this rule is deliberately not `high`: it
    // demands that the surrounding text mention credentials and that the value
    // mix upper, lower and digits. Without both it would flag every
    // `integrity: "sha512-…"` in the lockfile, and a rule that screams is a
    // rule that gets switched off.
    //
    // No `=` in the character class: with it, the match walks across an
    // assignment and glues an identifier to a number, and the number then
    // supplies the digit the mix test asked for. A real AWS secret is 30 bytes
    // in base64 — exactly 40 characters, never padded.
    name: "aws-secret-key",
    pattern: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/g,
    filter: (match, line, start, end) =>
      contextMentions(
        line,
        start,
        end,
        /\b(?:aws|secret|credential|password)\b/i
      ) && mixesCase(match[0]),
  },
  {
    // The span deliberately runs through to the HOST: the host is what decides
    // whether the credential is worth anything, and it is what the `@localhost`
    // placeholder reads. Stopping at the `@` would leave the span-scoped
    // placeholder nothing to read.
    name: "connection-string",
    pattern:
      /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mssql|redis|amqp|ftp|ssh):\/\/[^\s:@/]+:[^\s:@/]+@[^\s/"'`,)\]}]+/gi,
  },
  {
    name: "password-in-dsn",
    pattern: /\b(?:password|pwd)\s*=\s*[^;\s"'<${]{6,}/gi,
  },
  {
    // The key is matched as a whole identifier; `filter` decides whether that
    // identifier is a credential by looking at the words inside it.
    name: "assigned-credential",
    pattern:
      /([A-Za-z_$][A-Za-z0-9_$.-]{0,60})\s*[:=]\s*(["'`])([^"'`\r\n]{8,}?)\2/g,
    filter: (match) => {
      const kind = keyKind(match[1])
      return kind !== null && looksLikeCredential(kind, match[3])
    },
  },
  {
    // The same thing WITHOUT quotes, and this is the half that matters most
    // here: `.env`, YAML, shell, Dockerfiles and documentation all write values
    // bare. A committed `.env.local` — the exact artefact this gate was built
    // to refuse — has no quotes anywhere in it.
    //
    // The minimum length is 16 rather than 8: without quotes there is no
    // delimiter, the cut is cheaper, and the floor has to pay for it.
    name: "assigned-credential-unquoted",
    pattern:
      /([A-Za-z_$][A-Za-z0-9_$.-]{0,60})\s*[:=]\s*([A-Za-z0-9+/_=.~-]{16,})(?=[\s;,)\]}]|$)/g,
    filter: (match) => {
      const kind = keyKind(match[1])
      return kind !== null && looksLikeCredential(kind, match[2])
    },
  },
  {
    name: "authorization-header",
    pattern:
      /\b(?:Authorization|Proxy-Authorization)\s*[:=]\s*["'`]?\s*(?:Bearer|Basic|Token)\s+[A-Za-z0-9+/=_.-]{12,}/gi,
  },
]

// ── Git ──────────────────────────────────────────────────────────────────────
//
// Every git call runs with `cwd` at the repository root. Without it the verdict
// depends on which directory the hook happened to start in, and a swallowed
// ENOENT turns "git is missing" into "no findings".

function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim()
  } catch (error) {
    console.error(
      `[secrets] not a Git repository, or git is unavailable: ${error.message}`
    )
    process.exit(2)
  }
}

const ROOT = repoRoot()

function git(argv, options = {}) {
  try {
    return execFileSync("git", argv, {
      cwd: ROOT,
      encoding: options.binary ? null : "utf8",
      input: options.input,
      maxBuffer: BATCH_BYTES + 8 * 1024 * 1024,
      windowsHide: true,
    })
  } catch (error) {
    console.error(
      `[secrets] failed: git ${argv.join(" ")}\n          ${error.message}`
    )
    process.exit(2)
  }
}

// `-z` gives the raw path, NUL-separated. Without it Git applies
// `core.quotePath`, which is on by default on every OS, and any path outside
// ASCII comes back C-quoted — the read then fails on a name that does not
// exist, and a file with an accented name sails through green.
function pathsToScan() {
  const raw = stagedOnly
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
    : git(["ls-files", "-z"])
  return raw.split("\0").filter(Boolean)
}

// THE POINT OF THE WHOLE FILE, in `--staged` mode: the content comes from the
// INDEX, not from the working tree. Taking names from the index and bytes from
// disk reads one file and commits another — and that is not only an attack, it
// happens on its own every time someone edits a file after `git add`.
//
// `ls-files -s` gives every index entry's object id in one call, and `cat-file
// --batch` returns the blobs in another, so the cost is three processes no
// matter how many files the commit touches.
function indexContents(paths) {
  const wanted = new Set(paths)
  const oidByPath = new Map()
  for (const record of git(["ls-files", "-s", "-z"]).split("\0")) {
    if (!record) continue
    const tab = record.indexOf("\t")
    if (tab === -1) continue
    const path = record.slice(tab + 1)
    if (!wanted.has(path)) continue
    // format: "<mode> <oid> <stage>\t<path>"
    const [, oid, stage] = record.slice(0, tab).split(" ")
    // During a conflict the same path carries stages 1, 2 and 3. Stage 0 wins
    // when it is there; otherwise any side beats skipping the file.
    if (stage === "0" || !oidByPath.has(path)) oidByPath.set(path, oid)
  }

  const oids = [...new Set(oidByPath.values())]
  const sizeByOid = new Map()
  if (oids.length > 0) {
    const check = git(["cat-file", "--batch-check"], {
      input: `${oids.join("\n")}\n`,
    })
    for (const line of check.split("\n")) {
      const parts = line.trim().split(" ")
      if (parts.length === 3 && parts[1] === "blob")
        sizeByOid.set(parts[0], Number(parts[2]))
    }
  }

  // A blob over the ceiling leaves the batch and is read alone, TRUNCATED.
  // `spawnSync` with an exceeded `maxBuffer` reports ENOBUFS but still hands
  // back the partial output it already read, which is what lets us scan the
  // first 8 MiB of an enormous file instead of declaring it unscanned.
  const truncatedByOid = new Map()
  const readTruncated = (oid) => {
    const r = spawnSync("git", ["cat-file", "blob", oid], {
      cwd: ROOT,
      maxBuffer: MAX_BYTES,
      windowsHide: true,
    })
    return Buffer.isBuffer(r.stdout)
      ? r.stdout.subarray(0, MAX_BYTES)
      : Buffer.alloc(0)
  }

  const contentByOid = new Map()
  let batch = []
  let batchBytes = 0
  const flush = () => {
    if (batch.length === 0) return
    const buffer = git(["cat-file", "--batch"], {
      input: `${batch.join("\n")}\n`,
      binary: true,
    })
    let at = 0
    while (at < buffer.length) {
      const headerEnd = buffer.indexOf(0x0a, at)
      if (headerEnd === -1) break
      const header = buffer.toString("utf8", at, headerEnd).split(" ")
      at = headerEnd + 1
      if (header[1] !== "blob") continue // "<oid> missing"
      const size = Number(header[2])
      contentByOid.set(header[0], buffer.subarray(at, at + size))
      at += size + 1 // git closes each blob with an extra newline
    }
    batch = []
    batchBytes = 0
  }
  for (const [oid, size] of sizeByOid) {
    if (size > MAX_BYTES) {
      truncatedByOid.set(oid, readTruncated(oid))
      continue
    }
    if (batchBytes + size > BATCH_BYTES) flush()
    batch.push(oid)
    batchBytes += size
  }
  flush()

  return { oidByPath, sizeByOid, contentByOid, truncatedByOid }
}

// Git hands back forward slashes; Windows disks do not. Rebuilding the path
// from its segments with `join` is what makes the two agree.
function readFromDisk(path) {
  const absolute = join(ROOT, ...path.split("/"))
  const size = statSync(absolute).size
  if (size <= MAX_BYTES) return { data: readFileSync(absolute), size }

  const fd = openSync(absolute, "r")
  try {
    const buffer = Buffer.allocUnsafe(MAX_BYTES)
    const read = readSync(fd, buffer, 0, MAX_BYTES, 0)
    return { data: buffer.subarray(0, read), size }
  } finally {
    closeSync(fd)
  }
}

// ── Scanning ─────────────────────────────────────────────────────────────────

function isPlaceholder(rule, line, start, end) {
  const span = line.slice(start, end)
  if (STRONG_PLACEHOLDER.test(span)) return true
  // Below here is for the heuristics only. A vendor rule is not switched off by
  // angle brackets or a template hole wrapped around it — the disabling word
  // has to live INSIDE the token, or hiding a credential would be a matter of
  // putting brackets around it.
  if (rule.high) return false
  if (PLACEHOLDER.test(span)) return true
  const before = line.slice(0, start)
  const after = line.slice(end)
  if (/<[^<>]*$/.test(before) && /^[^<>]*>/.test(after)) return true
  if (/\$\{[^{}]*$/.test(before) && /^[^{}]*\}/.test(after)) return true
  return false
}

// This output goes to a CI log, which is another place a secret does not
// belong. Show enough to find it, never enough to use it.
function redact(text, sensitive) {
  if (!sensitive) return text.length > 80 ? `${text.slice(0, 80)}…` : text
  if (text.length <= 8) return `<${text.length} chars>`
  return `${text.slice(0, 4)}…<${text.length} chars>`
}

function scanLine(path, number, line, highOnly, findings) {
  if (ALLOW_MARK.test(line)) return

  const chunks = []
  if (line.length <= WINDOW) chunks.push([0, line])
  else
    for (let at = 0; at < line.length; at += WINDOW - OVERLAP)
      chunks.push([at, line.slice(at, at + WINDOW)])

  const claimed = []
  for (const rule of RULES) {
    if (highOnly && !rule.high) continue
    for (const [offset, chunk] of chunks) {
      rule.pattern.lastIndex = 0
      let match
      while ((match = rule.pattern.exec(chunk)) !== null) {
        if (match[0].length === 0) {
          rule.pattern.lastIndex += 1
          continue
        }
        const start = offset + match.index
        const end = start + match[0].length
        if (rule.filter && !rule.filter(match, line, start, end)) continue
        if (isPlaceholder(rule, line, start, end)) continue
        // A span already claimed by an earlier, more specific rule does not
        // become a second finding — and the window overlap does not double
        // count.
        if (claimed.some(([s, e]) => start < e && s < end)) continue
        claimed.push([start, end])
        findings.push({
          path,
          line: number,
          column: start + 1,
          rule: rule.name,
          span: redact(match[0], rule.sensitive !== false),
        })
      }
    }
  }
}

function scanContent(path, data, report) {
  let text = data.toString("utf8")
  let binary = false
  if (text.indexOf("\u0000") !== -1) {
    // A NUL byte used to mean "skip the whole file", silently. A secret inside
    // a binary leaks exactly like a secret inside a `.ts`. Replacing control
    // bytes with newlines turns the ASCII islands into scannable lines; only
    // the `high` rules run here, because heuristics over binary rubble are
    // noise.
    binary = true
    text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "\n")
    report.binaries.push(path)
  }

  const findings = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++)
    scanLine(path, i + 1, lines[i], binary, findings)
  return findings
}

// ── Run ──────────────────────────────────────────────────────────────────────
//
// There is no ignore list. "It is third-party code" is an argument about style
// and about technical debt; it is not an argument about secrets, because a
// credential committed under `vendor/` leaks exactly like one committed under
// `lib/`, and whoever clones the repository cannot tell the two apart. The only
// exclusion left is the one Git already applies: an ignored file is not
// tracked, so `node_modules` never appears here.

const paths = pathsToScan()
const report = { truncated: [], unreadable: [], binaries: [], scanned: 0 }
const findings = []

const fromIndex = stagedOnly ? indexContents(paths) : null

for (const path of paths) {
  // A tracked environment file is a finding by itself, whatever is inside it.
  // This is the rule that would have refused the `.env.local` in the repository
  // this project replaces.
  if (
    /(^|\/)\.env(\.|$)/.test(path) &&
    !/\.(?:example|sample|template)$/.test(path)
  ) {
    findings.push({
      path,
      line: 0,
      column: 0,
      rule: "tracked-env-file",
      span: path,
    })
    continue
  }

  let data
  if (stagedOnly) {
    const oid = fromIndex.oidByPath.get(path)
    const size = oid === undefined ? undefined : fromIndex.sizeByOid.get(oid)
    if (size !== undefined && size > MAX_BYTES) {
      data = fromIndex.truncatedByOid.get(oid)
      report.truncated.push(
        `${path} (${size} bytes, first ${MAX_BYTES} scanned)`
      )
    } else {
      data = oid === undefined ? undefined : fromIndex.contentByOid.get(oid)
    }
    if (data === undefined) {
      report.unreadable.push(`${path} — no blob in the index`)
      continue
    }
  } else {
    try {
      const read = readFromDisk(path)
      data = read.data
      if (read.size > MAX_BYTES)
        report.truncated.push(
          `${path} (${read.size} bytes, first ${MAX_BYTES} scanned)`
        )
    } catch (error) {
      // Not `catch { continue }`. A read failure is a printed line, not
      // silence: silence here reads exactly like "clean".
      report.unreadable.push(`${path} — ${error.code ?? error.message}`)
      continue
    }
  }

  report.scanned += 1
  findings.push(...scanContent(path, data, report))
}

// In `--staged`, a file that could not be scanned is a file entering the commit
// unchecked, and the hook cannot approve what it did not read. Outside
// `--staged` this is routine (a tracked file deleted from disk), so it warns.
const unchecked = stagedOnly ? report.unreadable.length : 0

function printList(label, items) {
  if (items.length === 0) return
  console.error(`\n  ${label} (${items.length}):`)
  for (const item of items.slice(0, 20)) console.error(`    ${item}`)
  if (items.length > 20) console.error(`    …and ${items.length - 20} more`)
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        total: findings.length,
        mode: stagedOnly ? "staged" : "tracked",
        scanned: report.scanned,
        unchecked,
        findings,
        skipped: {
          truncated: report.truncated,
          unreadable: report.unreadable,
          binariesScanned: report.binaries,
        },
      },
      null,
      2
    )
  )
} else {
  // The summary prints on the happy path too. The most expensive lie a scanner
  // can tell is not a wrong finding — it is "no findings" printed after it
  // quietly skipped six files.
  const summary =
    `[secrets] ${report.scanned} file(s) scanned in ` +
    `${stagedOnly ? "the index" : "tracked files"}` +
    ` · ${report.binaries.length} binary · ${report.truncated.length} truncated` +
    ` · ${report.unreadable.length} unscanned`

  const unreadWarning = () => {
    const unread = report.truncated.length + report.unreadable.length
    if (unread === 0) return
    console.error(
      `  ! this verdict does not cover ${unread} file(s): ` +
        `${report.truncated.length} partly scanned, ` +
        `${report.unreadable.length} not scanned`
    )
    printList("partly scanned", report.truncated)
    printList("not scanned", report.unreadable)
  }

  if (findings.length === 0 && unchecked === 0) {
    console.log(`${summary} · no findings.`)
    unreadWarning()
  } else {
    console.error(summary)
    if (findings.length > 0) {
      console.error(`\n[secrets] ${findings.length} finding(s):\n`)
      for (const f of findings) {
        console.error(`  error  ${f.path}:${f.line}:${f.column}  ${f.rule}`)
        console.error(`         ${f.span}`)
      }
    }
    unreadWarning()
    console.error(
      "\n  A secret that reached the history is not removed by another commit:\n" +
        "  it has to be ROTATED. Rewriting history comes after that, not\n" +
        "  instead of it. False positive? Put  // secret-ok: <reason>  on the\n" +
        "  line, with the reason written out.\n"
    )
  }
}

process.exit(findings.length > 0 || unchecked > 0 ? 1 : 0)
