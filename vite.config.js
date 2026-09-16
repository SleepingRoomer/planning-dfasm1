import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Servi sous https://<compte>.github.io/planning-dfasm1/ par GitHub Pages :
// les assets doivent être résolus depuis ce sous-chemin, pas depuis la racine.
export default defineConfig({
  base: "/planning-dfasm1/",
  plugins: [react()],
});
