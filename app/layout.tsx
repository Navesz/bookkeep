import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Literata } from "next/font/google"
import Link from "next/link"

import "./globals.css"
import { Mark } from "@/components/mark"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * THREE FACES, and each one has a job.
 *
 * Geist is the interface: menus, buttons, four hundred rows of a loans table.
 * Literata is the reading face — Google drew it for the body text of e-books —
 * and it takes the headings, because this is a library system and its headings
 * should look like something you read rather than something you click. Geist
 * Mono takes the ISBNs, the call numbers and the barcodes, which are read digit
 * by digit and need figures of one width.
 *
 * Each one lands on `<html>` as a custom property; `app/globals.css` maps them
 * onto `--font-sans`, `--font-heading` and `--font-mono` inside `@theme inline`.
 * Without that mapping the Tailwind utilities silently fall back to their own
 * default stacks and the downloaded fonts never paint a glyph.
 */
const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontSerif = Literata({
  subsets: ["latin"],
  variable: "--font-serif",
  // Only the weights the scale actually asks for: 400 for a lead paragraph,
  // 600 for every heading level. Shipping the full 200–900 axis would download
  // a variable file for weights nothing selects.
  weight: ["400", "600"],
})

const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

const REPOSITORY = "https://github.com/Navesz/bookkeep"

const DESCRIPTION =
  "An open-source library management system: books, copies, members and loans, " +
  "on SQLite through Node's own driver."

export const metadata: Metadata = {
  /**
   * The Open Graph card is referenced by a path, and a path needs an origin to
   * become the absolute URL that a crawler can fetch. This application is
   * self-hosted and has no canonical domain, so the deployer supplies it;
   * localhost is the honest default rather than someone else's domain baked in
   * as a guess.
   */
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: {
    default: "bookkeep",
    // Every page under here is a section of one system, so the product name
    // travels with the page title instead of being repeated inside it.
    template: "%s · bookkeep",
  },
  description: DESCRIPTION,
  applicationName: "bookkeep",
  openGraph: {
    type: "website",
    siteName: "bookkeep",
    title: "bookkeep",
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "bookkeep — three volumes on a shelf, one leaning into the gap left by the one on loan",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
}

export const viewport: Viewport = {
  /**
   * The colour the browser paints its own chrome with on a phone. Written as
   * hex and not as `oklch()` because a browser that does not parse the value
   * drops the whole declaration and paints its default; these two are the
   * measured sRGB of `--background` in each theme —
   * `oklch(0.977 0.009 92)` and `oklch(0.205 0.012 76)`.
   */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1611" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      // `next-themes` writes the `.dark` class onto this element from a
      // blocking script before the first paint, so the server's markup and the
      // client's first tree differ on this one attribute by design.
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontSerif.variable,
        fontMono.variable
      )}
    >
      <body className="min-h-svh">
        <ThemeProvider>
          {/*
            THE SKIP LINK, and it is first in the DOM on purpose. Its whole
            value is being the first thing a keyboard reaches, so it has to come
            before the header — put it after and it skips nothing that has not
            already been waded through.

            It is moved out of sight with a transform rather than with
            `sr-only`: `sr-only` and the `focus:fixed` that would have to undo
            it both set `position`, and which one wins then depends on the order
            Tailwind happens to emit two unrelated utilities in. A transform is
            not in a fight with anything. `display:none` and
            `visibility:hidden` are out for a different reason — both take the
            link out of the tab order, which is the one thing it must stay in.
          */}
          <a
            href="#main"
            className="fixed top-3 left-3 z-50 -translate-y-24 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground shadow-raised focus:translate-y-0"
          >
            Skip to content
          </a>

          <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-sm">
            <div className="mx-auto flex h-(--header-offset) max-w-6xl items-center gap-3 px-4">
              <Link
                href="/"
                className="flex items-center gap-2.5 rounded-md focus-visible:outline-none"
              >
                <Mark className="size-7" />
                {/* The wordmark is lower case because the product is called
                    `bookkeep`, the way a command is. */}
                <span className="font-heading text-[1.0625rem] leading-none font-semibold tracking-tight">
                  bookkeep
                </span>
              </Link>

              <nav
                aria-label="Main"
                className="ml-auto flex items-center gap-1"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  // NOT optional. Base UI's `Button` assumes it renders a real
                  // `<button>` and warns at run time when a `render` prop
                  // swaps in an anchor — and it is right to: the two differ on
                  // the Space key, which activates a button and scrolls the
                  // page on a link. Saying so is what makes it stop adding
                  // button behaviour this element must not have.
                  nativeButton={false}
                  render={
                    <a
                      href={REPOSITORY}
                      target="_blank"
                      // `noreferrer` alongside `noopener` because older
                      // browsers only honour the second one via the first.
                      rel="noopener noreferrer"
                    />
                  }
                >
                  Repository
                  <span className="sr-only"> (opens in a new tab)</span>
                </Button>
                <ThemeToggle />
              </nav>
            </div>
          </header>

          {/* The target of the skip link. `tabIndex={-1}` is what makes the
              jump actually move focus: without it the browser scrolls the
              element into view and leaves focus on the link, so the next Tab
              goes back to the header. */}
          <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  )
}
