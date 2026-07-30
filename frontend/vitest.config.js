import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest configuration kept separate from vite.config.js so the production
// build configuration is untouched by the test setup.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/test/setup.js"],
    include: ["src/**/*.test.{js,jsx}"],
  },
});
