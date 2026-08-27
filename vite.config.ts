import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => {
  // Cloudflare injects private bindings in production. During `vite dev`,
  // load the same private values into the Node server process only. They are
  // deliberately not added to Vite's client-side `define` configuration.
  if (command === "serve") {
    const localEnvironment = loadEnv(mode, process.cwd(), "");
    for (const [name, value] of Object.entries(localEnvironment)) {
      if (!process.env[name]) process.env[name] = value;
    }
  }

  return {
    plugins: [
      tailwindcss(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
      }),
      ...(command === "build" ? [nitro({ defaultPreset: "cloudflare-module" })] : []),
      react(),
    ],
    build: {
      rolldownOptions: {
        external: ["cloudflare:workers"],
      },
    },
  };
});
