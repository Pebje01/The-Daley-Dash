import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Primary backgrounds — Saturated Lila
          lavender:          "rgb(var(--color-brand-lavender) / <alpha-value>)",
          "lavender-light":  "rgb(var(--color-brand-lavender-light) / <alpha-value>)",
          "lavender-dark":   "rgb(var(--color-brand-lavender-dark) / <alpha-value>)",

          // Page backgrounds
          "page-light":      "rgb(var(--color-brand-page-light) / <alpha-value>)",
          "page-medium":     "rgb(var(--color-brand-page-medium) / <alpha-value>)",

          // Accent pastels
          pink:              "rgb(var(--color-brand-pink) / <alpha-value>)",
          "light-blue":      "rgb(var(--color-brand-light-blue) / <alpha-value>)",
          "lavender-accent": "rgb(var(--color-brand-lavender-accent) / <alpha-value>)",
          lime:              "rgb(var(--color-brand-lime) / <alpha-value>)",

          // Icon accents
          "pink-accent":     "rgb(var(--color-brand-pink-accent) / <alpha-value>)",
          "blue-accent":     "rgb(var(--color-brand-blue-accent) / <alpha-value>)",
          "lav-accent":      "rgb(var(--color-brand-lav-accent) / <alpha-value>)",
          "lime-accent":     "rgb(var(--color-brand-lime-accent) / <alpha-value>)",

          // Cards
          "card-bg":         "rgb(var(--color-brand-card-bg) / <alpha-value>)",
          "card-border":     "rgb(var(--color-brand-card-border) / <alpha-value>)",

          // Highlights
          "yellow-highlight":"rgb(var(--color-brand-yellow-highlight) / <alpha-value>)",

          // Text
          "text-primary":    "rgb(var(--color-brand-text-primary) / <alpha-value>)",
          "text-secondary":  "rgb(var(--color-brand-text-secondary) / <alpha-value>)",

          // Status
          "status-green":    "rgb(var(--color-brand-status-green) / <alpha-value>)",
          "status-orange":   "rgb(var(--color-brand-status-orange) / <alpha-value>)",
          "status-red":      "rgb(var(--color-brand-status-red) / <alpha-value>)",

          // Overig
          purple:            "rgb(var(--color-brand-purple) / <alpha-value>)",
        },
        sidebar: {
          active: "rgb(var(--color-sidebar-active) / <alpha-value>)",
          hover:  "rgb(var(--color-sidebar-hover) / <alpha-value>)",
          text:   "rgb(var(--color-sidebar-text) / <alpha-value>)",
          muted:  "rgb(var(--color-sidebar-text-muted) / <alpha-value>)",
        },
      },
      fontFamily: {
        uxum: ["var(--font-uxum)", "Georgia", "serif"],
        instrument: ["var(--font-instrument)", "Georgia", "serif"],
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "headline":  ["1.75rem",   { lineHeight: "2.25rem", fontWeight: "700" }],
        "stat":      ["1.75rem",   { lineHeight: "2.25rem", fontWeight: "700" }],
        "sidebar-t": ["1.375rem",  { lineHeight: "1.75rem", fontWeight: "700" }],
        "body":      ["0.875rem",  { lineHeight: "1.375rem" }],
        "caption":   ["0.75rem",   { lineHeight: "1rem", fontWeight: "500" }],
        "pill":      ["0.6875rem", { lineHeight: "1rem", fontWeight: "500" }],
      },
      spacing: {
        "brand-xs":     "0.25rem",   /* 4px */
        "brand-sm":     "0.5rem",    /* 8px */
        "brand-md":     "1rem",      /* 16px */
        "brand-lg":     "1.5rem",    /* 24px */
        "brand-xl":     "2rem",      /* 32px */
        "brand-xxl":    "3rem",      /* 48px */
        "card-padding": "1.25rem",   /* 20px */
        "sidebar-w":    "13.75rem",  /* 220px */
      },
      borderRadius: {
        "brand":     "1rem",      /* 16px */
        "brand-sm":  "0.5rem",    /* 8px */
        "brand-btn": "0.625rem",  /* 10px */
      },
      borderWidth: {
        "brand": "1.5px",
      },
    },
  },
  plugins: [],
};
export default config;
