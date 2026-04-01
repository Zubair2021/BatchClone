import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function resolveBasePath() {
  if (!process.env.GITHUB_ACTIONS) return "/";

  const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
  if (!repository || repository.endsWith(".github.io")) return "/";
  return `/${repository}/`;
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [react()],
});
