import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // the API (npm run server) — `npm run dev` starts both
  server: { proxy: { "/api": "http://localhost:4000" } },
  preview: { proxy: { "/api": "http://localhost:4000" } },
});
