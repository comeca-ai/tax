/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // reembolsa.ia design tokens (design.md)
        ink: {
          950: "#070B09",
          900: "#0C1210",
          800: "#131B18",
        },
        paper: "#F4F6F3",
        surface: "#FFFFFF",
        line: {
          DEFAULT: "#E3E8E2",
          dark: "#1E2A25",
        },
        brand: {
          400: "#2BE08C",
          500: "#0EA968",
          900: "#0B3D2A",
        },
        text: {
          500: "#5B6762",
          900: "#101613",
          dark: {
            100: "#E8F0EB",
            400: "#8FA39A",
          },
        },
        amber: { 500: "#D97706" },
        orange: { 500: "#EA580C" },
        red: { 500: "#DC2626" },
        blue: { 500: "#2563EB" },
        // Confidence system (design.md — use EXACTLY these)
        conf: {
          alta: { bg: "#DCF5E8", text: "#0B7A4B", dot: "#0EA968" },
          media: { bg: "#FCEFD9", text: "#9A5B07", dot: "#D97706" },
          baixa: { bg: "#FBE6D9", text: "#B4470F", dot: "#EA580C" },
          vedado: { bg: "#F9DDDD", text: "#B91C1C", dot: "#DC2626" },
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        card: "0 1px 2px rgba(16,22,19,0.04), 0 8px 24px -12px rgba(16,22,19,0.08)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "float-y": {
          "0%,100%": { transform: "translateY(-10px)" },
          "50%": { transform: "translateY(10px)" },
        },
        "glow-pulse": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(43,224,140,0)" },
          "50%": { boxShadow: "0 0 32px 4px rgba(43,224,140,0.25)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "float-y": "float-y 6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
