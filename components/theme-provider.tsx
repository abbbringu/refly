"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export const ACCENT_THEMES = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "cyan",
  "violet",
  "lime",
  "coral",
] as const

export type AccentTheme = (typeof ACCENT_THEMES)[number]

const ACCENT_THEME_STORAGE_KEY = "refly-accent-theme"

type AccentThemeContextValue = {
  accentTheme: AccentTheme
  setAccentTheme: (theme: AccentTheme) => void
}

const AccentThemeContext = React.createContext<AccentThemeContextValue | undefined>(undefined)

function applyAccentTheme(theme: AccentTheme) {
  document.documentElement.setAttribute("data-accent-theme", theme)
}

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const [accentTheme, setAccentThemeState] = React.useState<AccentTheme>("blue")

  React.useEffect(() => {
    const storedTheme = window.localStorage.getItem(ACCENT_THEME_STORAGE_KEY)
    if (storedTheme && ACCENT_THEMES.includes(storedTheme as AccentTheme)) {
      const parsedTheme = storedTheme as AccentTheme
      setAccentThemeState(parsedTheme)
      applyAccentTheme(parsedTheme)
      return
    }

    applyAccentTheme("blue")
  }, [])

  const setAccentTheme = React.useCallback((theme: AccentTheme) => {
    setAccentThemeState(theme)
    applyAccentTheme(theme)
    window.localStorage.setItem(ACCENT_THEME_STORAGE_KEY, theme)
  }, [])

  const value = React.useMemo(
    () => ({ accentTheme, setAccentTheme }),
    [accentTheme, setAccentTheme]
  )

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <AccentThemeContext.Provider value={value}>
        {children}
      </AccentThemeContext.Provider>
    </NextThemesProvider>
  )
}

function useAccentTheme() {
  const context = React.useContext(AccentThemeContext)

  if (!context) {
    throw new Error("useAccentTheme must be used within ThemeProvider")
  }

  return context
}

export { ThemeProvider, useAccentTheme }
