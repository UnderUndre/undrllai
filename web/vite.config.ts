import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // bind 0.0.0.0 for Docker access
    proxy: {
      "/api": process.env["VITE_API_URL"] ?? "http://localhost:3001",
    },
  },
});
