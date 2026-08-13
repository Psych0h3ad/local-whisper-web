import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  await readFile(resolve(projectRoot, "package.json"), "utf8"),
);

if (packageJson.name !== "local-whisper-web") {
  throw new Error("Refusing to clean an unexpected project directory.");
}

await rm(resolve(projectRoot, "dist"), { recursive: true, force: true });
