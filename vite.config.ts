import { defineConfig } from "vite";

export default defineConfig({
  base: "/times-arrow/",
  build: {
    rollupOptions: {
      input: ["index.html", "experiments/000-plumbing/index.html"],
    },
  },
});
