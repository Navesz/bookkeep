#!/usr/bin/env node
// Arms the gate's hooks in this repository.
//
// It sets `core.hooksPath` instead of copying files into `.git/hooks`, so the
// hooks stay versioned, get reviewed like any other code, and update when the
// repository does. A hook that lives only on the machine of whoever installed
// it does not exist for anybody else.
//
// Run:        npm run hooks       (or: node .githooks/install.mjs)
// Uninstall:  git config --unset core.hooksPath

import { execFileSync } from "node:child_process"
import { chmodSync, existsSync, readdirSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

// fileURLToPath, not `.pathname`: on Windows the pathname arrives as
// "/C:/Users/…", with a slash before the drive letter, so readdirSync would go
// looking in C:\C:\Users\… and the installer would die before configuring
// anything.
const HOOKS_DIR = dirname(fileURLToPath(import.meta.url))

// rev-parse from the directory of THIS SCRIPT, not from the working directory:
// the repository that receives the hooks has to be the repository the hooks
// live in. With cwd, running this installer from inside another clone would
// silently configure that other clone.
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: HOOKS_DIR,
  encoding: "utf8",
  windowsHide: true,
}).trim()

// Git wants forward slashes in its config, including on Windows.
const relativePath = relative(ROOT, HOOKS_DIR).split(sep).join("/")

const alreadySet = (() => {
  try {
    return execFileSync("git", ["config", "--get", "core.hooksPath"], {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    }).trim()
  } catch {
    return ""
  }
})()

if (alreadySet && alreadySet !== relativePath) {
  console.error(
    `core.hooksPath already points at "${alreadySet}".\n` +
      "I will not overwrite configuration that is not mine.\n" +
      `To switch anyway: git config core.hooksPath ${relativePath}`
  )
  process.exit(1)
}

// An active hook in `.git/hooks` plus `core.hooksPath` means the one in
// `.git/hooks` silently stops running. Better to say so than to leave someone
// believing it still fires.
const oldHooks = join(ROOT, ".git", "hooks")
if (existsSync(oldHooks)) {
  const active = readdirSync(oldHooks).filter((f) => !f.endsWith(".sample"))
  if (active.length > 0) {
    console.warn(
      `Warning: .git/hooks contains ${active.join(", ")}. ` +
        "With core.hooksPath set, those stop running."
    )
  }
}

// The execute bit ON DISK. Only the shell hooks need it; the .mjs files are run
// through `node` by name.
const shellHooks = readdirSync(HOOKS_DIR).filter(
  (f) => !f.endsWith(".mjs") && !f.endsWith(".md") && f !== "co-authors"
)
for (const file of shellHooks) chmodSync(join(HOOKS_DIR, file), 0o755)

execFileSync("git", ["config", "core.hooksPath", relativePath], {
  cwd: ROOT,
  windowsHide: true,
})
console.log(`Hooks armed: core.hooksPath = ${relativePath}`)

// The execute bit IN THE INDEX is a separate thing, and on Windows
// `core.filemode` is false, so the chmod above never becomes mode 100755 in a
// commit. A clone on Linux or macOS would then find a hook it cannot execute.
// Checked and reported rather than fixed silently, because fixing it means
// staging a change the person running an installer did not ask for.
const wrongMode = []
for (const file of shellHooks) {
  const entry = `${relativePath}/${file}`
  let listed = ""
  try {
    listed = execFileSync("git", ["ls-files", "-s", "--", entry], {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    }).trim()
  } catch {
    continue
  }
  if (listed && !listed.startsWith("100755")) wrongMode.push(entry)
}
if (wrongMode.length > 0) {
  console.warn(
    "\nThese hooks are tracked without the execute bit, so a clone on Linux or\n" +
      "macOS would not be able to run them. Fix once, then commit:\n" +
      `  git update-index --chmod=+x ${wrongMode.join(" ")}`
  )
}

console.log("Skip once: git commit --no-verify")
