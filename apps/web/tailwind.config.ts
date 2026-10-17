import type { Config } from "tailwindcss";

/**
 * Ashfen design system.
 *
 * Palette is fixed: forest green ink, charcoal, warm ivory paper, muted gold.
 * Data/state hues are earthy and desaturated so the board never turns neon.
 * Spacing follows an 8px rhythm (Tailwind 2 == 8px); use even steps.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core identity
        ink: { DEFAULT: "#14251D", muted: "#55635A", faint: "#8A9188" },
        charcoal: "#202722",
        ivory: { DEFAULT: "#F4F2EB", raised: "#FBFAF5", sunk: "#EBE7D9" },
        gold: { DEFAULT: "#B89A60", soft: "#D3BF95", deep: "#937840" },
        line: { DEFAULT: "#DBD3BF", strong: "#C3B890" },
        // Dark surfaces (hero, map frame, footer)
        forest: {
          900: "#0E1B14",
          800: "#14251D",
          700: "#1E3728",
          600: "#2A4C39",
          500: "#3A6049",
        },
        // Environmental state — muted, cartographic
        state: {
          restore: "#5E7A48",
          water: "#3E6E6A",
          flood: "#3C5566",
          pollution: "#9C5A3B",
          danger: "#9B3B2E",
          warn: "#B89A60",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Fraunces", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Source Sans 3", "system-ui", "sans-serif"],
      },
      fontSize: {
        display: ["clamp(2.6rem, 5.5vw, 4.5rem)", { lineHeight: "1.0", letterSpacing: "-0.022em" }],
        hero: ["clamp(2rem, 3.5vw, 3rem)", { lineHeight: "1.05", letterSpacing: "-0.018em" }],
        eyebrow: ["0.72rem", { lineHeight: "1", letterSpacing: "0.26em" }],
      },
      letterSpacing: {
        eyebrow: "0.26em",
      },
      maxWidth: {
        reading: "42rem",
        shell: "78rem",
      },
      boxShadow: {
        panel: "0 1px 0 rgba(20,37,29,0.03), 0 20px 44px -34px rgba(20,37,29,0.42)",
        raised: "0 28px 70px -44px rgba(20,37,29,0.6)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.4)",
      },
      backgroundImage: {
        "paper-grain":
          "radial-gradient(circle at 20% 10%, rgba(184,154,96,0.05), transparent 45%), radial-gradient(circle at 85% 0%, rgba(42,76,57,0.05), transparent 40%)",
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      },
      keyframes: {
        "fade-rise": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        drift: {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "fade-rise": "fade-rise 0.6s cubic-bezier(0.22,0.61,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
