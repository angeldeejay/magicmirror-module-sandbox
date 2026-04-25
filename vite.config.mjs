/**
 * Vite build configuration for the sandbox shell bundle.
 */
import { resolve } from "node:path";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
	plugins: [preact()],
	publicDir: false,
	build: {
		outDir: resolve("client", "generated"),
		emptyOutDir: false,
		cssCodeSplit: false,
		codeSplitting: false,
		target: "es2021",
		rollupOptions: {
			input: resolve("client", "app", "main.tsx"),
			output: {
				entryFileNames: "shell-app.js",
				assetFileNames: "shell-app.[ext]"
			}
		}
	}
});
