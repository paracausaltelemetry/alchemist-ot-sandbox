import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  { ignores: ["dist", "coverage", "*.config.js", "*.config.ts"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // react-hooks v6 ships two experimental rules that flag correct, common
      // patterns here — the latest-handler ref (useKeyboardShortcuts) and a
      // modal resetting its step on open. Off until they stabilise.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      // jsx-a11y recommended stays at its default (error): the pre-existing
      // findings were fixed, so accessibility regressions now block merges.
      // The few genuine pointer-only affordances (canvas drag, drop zones)
      // carry scoped, justified per-line disables.
    },
  },
  // Test files: allow node + vitest globals.
  {
    files: ["src/**/*.test.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
