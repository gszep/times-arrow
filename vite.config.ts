import { defineConfig } from "vite";

export default defineConfig({
  base: "/times-arrow/",
  build: {
    rollupOptions: {
      input: ["index.html", "experiments/000-plumbing/index.html", "experiments/001-irreversibility/index.html", "experiments/002-arrow-kl/index.html"],
    },
  },
});
