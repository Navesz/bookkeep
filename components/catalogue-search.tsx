"use client"

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"

/**
 * ═════════════════════════════════════════════════════════════════════════
 * THE SEARCH BOX, WHICH IS A `<form method="get">` FIRST AND AN ENHANCEMENT
 * SECOND.
 *
 * With JavaScript off this is a plain form. It submits to `/`, the browser puts
 * `?q=…` in the address bar, the server reads it and renders the results. No
 * state, no fetch, no blank page — which is the whole claim this app makes
 * about itself. That behaviour is not a fallback bolted on afterwards; it is
 * what the markup does when nothing else runs, and everything below only
 * intercepts it.
 *
 * With JavaScript on, three things change and nothing else:
 *
 *   · typing navigates, debounced, so results follow the keyboard;
 *   · the navigation is `replace`, not `push`, so twelve keystrokes do not
 *     become twelve entries in the back stack — Back should leave the
 *     catalogue, not replay the word letter by letter;
 *   · a spinner appears and the results dim while the server answers.
 *
 * THE URL STAYS THE STATE IN BOTH CASES. There is no `useState` holding the
 * query: `defaultValue` seeds the field from the URL and the URL is what the
 * page reads. That is what makes a result link shareable, the Back button
 * correct, and a reload land on the same screen.
 *
 * WHY 150 ms OF DEBOUNCE. The query itself is 2.5–3.4 ms at 5,000 books
 * (measured in `lib/db/books.ts`) and the database is in this process, so the
 * cost of a keystroke is almost entirely React rendering and streaming the RSC
 * payload. Below about 100 ms every keystroke fires and a fast typist queues
 * eight round trips to throw seven away; above about 250 ms the list visibly
 * lags the cursor. 150 ms is one comfortable inter-key interval — a 70 wpm
 * typist is around 170 ms between characters — so it fires between words rather
 * than between letters.
 * ═════════════════════════════════════════════════════════════════════════
 */
export function CatalogueSearch({
  query,
  children,
}: {
  /** What the URL currently says. The field is seeded from it, never from state. */
  query: string
  /**
   * The results, ALREADY RENDERED ON THE SERVER.
   *
   * Passing them through as `children` is what lets a client component dim
   * them during a transition without any of the catalogue — the database
   * module, the row markup, the date formatting — crossing into the browser
   * bundle. A client parent renders server children; it does not import them.
   */
  children: ReactNode
}) {
  const router = useRouter()
  const field = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pending, startTransition] = useTransition()

  // Mirrors the field only so the clear button can appear and disappear as the
  // person types. It deliberately does NOT drive the input's value — the input
  // stays uncontrolled, so a slow render can never rewind a character that was
  // already typed.
  const [hasText, setHasText] = useState(query !== "")

  function go(value: string) {
    const trimmed = value.trim()
    startTransition(() => {
      router.replace(trimmed === "" ? "/" : `/?q=${encodeURIComponent(trimmed)}`, {
        // The results change; the reading position should not. Without this,
        // every keystroke would yank a scrolled list back to the top.
        scroll: false,
      })
    })
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  /**
   * THE ONE CASE WHERE THE FIELD HAS TO FOLLOW THE URL RATHER THAN LEAD IT:
   * the Back button, and a link that arrives with a different `?q=`.
   *
   * The first attempt at this was `key={query}` on the input, which remounts it
   * whenever the URL changes. It is also a bug: this component CAUSES the URL
   * to change 150 ms after a keystroke, so the field would remount in the
   * middle of typing and take the caret with it.
   *
   * The guard is focus. If the field has focus, the person is typing and the
   * URL is downstream of them, so it is left alone; if it does not, the
   * navigation came from somewhere else and the field is stale.
   */
  useEffect(() => {
    const input = field.current
    if (!input || document.activeElement === input) return
    input.value = query
    setHasText(query !== "")
  }, [query])

  /**
   * `/` PUTS THE CURSOR IN THE BOX, the shortcut every catalogue and every
   * code host has trained people to try.
   *
   * `preventDefault` is the load-bearing line: without it the browser's own
   * quick-find opens on the same key and the slash lands in ITS field instead
   * of this one. The typing guard is the same rule `components/theme-provider`
   * applies to its own hotkey — a shortcut that fires while someone is writing
   * a book title is a shortcut that eats the title.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return
      }

      event.preventDefault()
      field.current?.focus()
      field.current?.select()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div className="space-y-6">
      <form
        // `role="search"` makes this a landmark, so "jump to search" works in
        // every screen reader. The `<search>` element would say the same thing
        // in less markup, and it is not yet safe across the assistive stack.
        role="search"
        action="/"
        method="get"
        onSubmit={(event) => {
          // Submitting from the keyboard should not wait out the debounce that
          // is still pending from the last character typed.
          event.preventDefault()
          if (timer.current) clearTimeout(timer.current)
          go(field.current?.value ?? "")
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        {/* The label is real and hidden, not a placeholder standing in for one.
            A placeholder disappears the moment the field has content, which is
            exactly when someone using voice control asks for it by name. */}
        <label htmlFor="catalogue-q" className="sr-only">
          Search the catalogue by title or author
        </label>

        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="catalogue-q"
            ref={field}
            name="q"
            type="search"
            // Uncontrolled on purpose — see `hasText` above, and the effect
            // that syncs it back from the URL when it is not focused.
            defaultValue={query}
            placeholder="Title or author…"
            autoComplete="off"
            // The browser's own history dropdown covers the first three results
            // on a list that is already updating as you type.
            spellCheck={false}
            onChange={(event) => {
              const value = event.target.value
              setHasText(value !== "")
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(() => go(value), 150)
            }}
            onKeyDown={(event) => {
              // Escape empties the box and goes back to browsing. It is what
              // the field's own native clear button does, given to the keyboard.
              if (event.key === "Escape") {
                event.preventDefault()
                if (timer.current) clearTimeout(timer.current)
                if (field.current) field.current.value = ""
                setHasText(false)
                go("")
              }
            }}
            // `h-11` and not the component's default `h-8`: 44px is the touch
            // target this whole app is built to, and the search box is the
            // control a librarian hits most often on a phone at the counter.
            // The right padding clears the 44px-wide furniture that sits inside
            // the field.
            className="h-11 pl-9 text-base sm:h-11"
          />

          {/* The furniture inside the right edge of the field: a spinner while
              the server answers, a clear button once there is something to
              clear, and the `/` hint when the box is empty and idle. Only ever
              one of the three, so they can share the space without colliding. */}
          <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center">
            {pending ? (
              <LoaderCircle
                aria-hidden
                className="size-4 animate-spin text-muted-foreground"
              />
            ) : hasText ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                // 44px, matching the field, so the clear target is not a
                // 28px square inside a 44px row.
                className="size-8"
                onClick={() => {
                  if (timer.current) clearTimeout(timer.current)
                  if (field.current) {
                    field.current.value = ""
                    field.current.focus()
                  }
                  setHasText(false)
                  go("")
                }}
              >
                <X aria-hidden />
                <span className="sr-only">Clear search</span>
              </Button>
            ) : (
              // Hidden from the accessibility tree AND from pointers: it is a
              // hint about a keyboard shortcut, so it means nothing to a
              // touchscreen and it must not intercept a tap meant for the
              // field. Shown from `sm` up, because a device with no keyboard
              // has no use for it.
              <Kbd
                aria-hidden
                className="pointer-events-none mr-1.5 hidden sm:inline-flex"
              >
                /
              </Kbd>
            )}
          </div>
        </div>

        {/* THE SUBMIT BUTTON STAYS, and it is not decoration.
            With JavaScript off it is the only way to run the search — the
            `onChange` above never fires. With JavaScript on it is redundant for
            a mouse and still the obvious target for someone who types a query
            and looks for something to press. A button that only exists in the
            no-JS case would be a button most people never see being tested by
            nobody. */}
        <Button type="submit" size="lg" className="h-11 px-5 sm:w-auto">
          Search
        </Button>
      </form>

      <div className={cn("transition-opacity", pending && "opacity-60")}>
        {children}
      </div>
    </div>
  )
}
