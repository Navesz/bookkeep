"use client"

/**
 * THE VISIBLE THEME SWITCH.
 *
 * `components/theme-provider.tsx` has listened for the `d` key since the
 * beginning. The problem was never the shortcut: it is that an interface whose
 * only control is an unannounced keystroke is not a control at all. Nobody
 * presses `d` on a page that never said there was a `d`. Hence the two halves
 * of this component — a button you can see, and the `<Kbd>` inside the menu,
 * which is where the key finally gets said out loud.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE HYDRATION MISMATCH, which is the classic defect of this component.
 *
 * `next-themes` cannot know the theme on the server: it reads `localStorage`
 * and the system preference in the browser. `useTheme()` returns `undefined`
 * during the server render AND during the hydration render. Picking the icon
 * from that value paints a sun into the HTML and a moon into the client's first
 * tree; React reports the mismatch and throws the hydrated tree away to rebuild
 * it.
 *
 * The usual escape is `useState(false)` plus `useEffect(() => setMounted(true))`
 * and it is barred here twice over. First, `react-hooks/set-state-in-effect` —
 * a rule `eslint-config-next` turns on in this project — rejects turning a value
 * derived from the environment into state. Second, the visible hole: the button
 * renders empty and the icon appears a frame later.
 *
 * WHAT REPLACED IT: BOTH icons are always in the HTML and the CSS chooses.
 * `next-themes` already writes the `.dark` class onto `<html>` from a blocking
 * script BEFORE the first paint, and this project's `dark` variant is
 * `&:is(.dark *)` (`app/globals.css`) — so `dark:hidden` and `hidden dark:block`
 * do the swap with no JavaScript, no state and no effect. The server's markup
 * and the client's are identical by construction. There is nothing left to
 * diverge.
 *
 * The SELECTED theme (light/dark/system) is read only inside the popup, and the
 * popup is not in the HTML — Base UI's `Menu.Portal` mounts the content when it
 * opens. By the time that `theme` is read for the first time, hydration
 * finished long ago.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

/**
 * The key `theme-provider.tsx` listens for, written the way it is printed on
 * the keyboard. It is not prose and it does not get translated.
 */
const KEY = "D"

/** The three values `next-themes` understands. They are the library's API. */
const LIGHT = "light"
const DARK = "dark"
const SYSTEM = "system"

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Theme"
            title="Theme"
            className={cn(className)}
          />
        }
      >
        <Sun aria-hidden className="size-4 dark:hidden" />
        <Moon aria-hidden className="hidden size-4 dark:block" />
      </DropdownMenuTrigger>

      {/* `w-auto` overrides the component's `w-(--anchor-width)`: anchored to a
          36px button, the menu would be born 36px wide. */}
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(String(value))}
        >
          {/* The group label is what gives the set of options its accessible
              name (Base UI ties the two together with `aria-labelledby`). The
              `<Kbd>` is `aria-hidden` so it stays out of that name: a screen
              reader would otherwise announce "Theme D" on every open, and the
              key has already been told to the people it is for. */}
          <DropdownMenuLabel className="flex items-center justify-between gap-6">
            Theme
            <Kbd aria-hidden>{KEY}</Kbd>
          </DropdownMenuLabel>

          {/* 44px of target on touch. The item is born 28px tall with no gap
              from its neighbour, and a thumb that misses changes the theme
              instead of closing the menu. */}
          <DropdownMenuRadioItem
            value={LIGHT}
            closeOnClick
            className="min-h-11 lg:min-h-0"
          >
            <Sun aria-hidden />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value={DARK}
            closeOnClick
            className="min-h-11 lg:min-h-0"
          >
            <Moon aria-hidden />
            Dark
          </DropdownMenuRadioItem>
          {/* "System" is the provider's default, which is why it is on the
              list: without it, anyone who switched once has no way to hand the
              decision back to the operating system. */}
          <DropdownMenuRadioItem
            value={SYSTEM}
            closeOnClick
            className="min-h-11 lg:min-h-0"
          >
            <Monitor aria-hidden />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
