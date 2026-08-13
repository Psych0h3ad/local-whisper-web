import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputPath = resolve(
  projectRoot,
  process.argv[2] ?? "artifacts/local-whisper-web.cdx.json",
);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const [packageJson, packageLock] = await Promise.all([
  readJson(resolve(projectRoot, "package.json")),
  readJson(resolve(projectRoot, "package-lock.json")),
]);

// Intentionally do not pass --omit=dev. Reading package-lock.json also keeps
// optional platform packages in the inventory, rather than describing only
// the subset installed on the machine that happens to generate the release.
const result = spawnSync(
  npmCommand,
  ["sbom", "--package-lock-only", "--sbom-format=cyclonedx"],
  {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(
    `npm sbom failed with exit code ${result.status}:\n${result.stderr.trim()}`,
  );
}

let sbom;
try {
  sbom = JSON.parse(result.stdout);
} catch (error) {
  throw new Error(`npm sbom returned invalid JSON: ${error.message}`);
}

normalizeRootComponent(sbom, packageJson);
validateDirectDependencies(sbom, packageJson, packageLock);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
console.log(`Wrote complete CycloneDX SBOM to ${outputPath}`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function normalizeRootComponent(document, manifest) {
  const root = document.metadata?.component;
  if (!root) throw new Error("SBOM is missing metadata.component");

  // npm currently derives this field from the checkout directory instead of
  // package.json. Make the released component identity stable across clones.
  root.name = manifest.name;
  root.type = "application";

  if (root.version !== manifest.version) {
    throw new Error(
      `SBOM root version ${root.version} does not match ${manifest.version}`,
    );
  }
  if (root["bom-ref"] !== `${manifest.name}@${manifest.version}`) {
    throw new Error(`Unexpected SBOM root reference: ${root["bom-ref"]}`);
  }
}

function validateDirectDependencies(document, manifest, lockfile) {
  const componentRefs = new Map(
    (document.components ?? []).map((component) => [
      component["bom-ref"],
      component,
    ]),
  );
  const rootRef = document.metadata.component["bom-ref"];
  const rootGraph = (document.dependencies ?? []).find(
    (dependency) => dependency.ref === rootRef,
  );
  if (!rootGraph) throw new Error("SBOM is missing the root dependency graph");

  const rootDependencies = new Set(rootGraph.dependsOn ?? []);
  const dependencyGroups = [
    ["runtime", manifest.dependencies ?? {}],
    ["development", manifest.devDependencies ?? {}],
  ];

  for (const [group, dependencies] of dependencyGroups) {
    for (const name of Object.keys(dependencies)) {
      const locked = lockfile.packages?.[`node_modules/${name}`];
      if (!locked?.version) {
        throw new Error(`${group} dependency ${name} is missing from package-lock.json`);
      }

      const expectedRef = `${name}@${locked.version}`;
      const component = componentRefs.get(expectedRef);
      if (!component) {
        throw new Error(`${group} dependency ${expectedRef} is missing from SBOM`);
      }
      if (!rootDependencies.has(expectedRef)) {
        throw new Error(
          `${group} dependency ${expectedRef} is missing from the root graph`,
        );
      }
    }
  }

  for (const requiredName of [
    "@huggingface/transformers",
    "next",
    "react",
    "react-dom",
  ]) {
    if (!(requiredName in (manifest.dependencies ?? {}))) {
      throw new Error(`Required browser runtime ${requiredName} is not declared`);
    }
  }

  for (const [installPath, locked] of Object.entries(lockfile.packages ?? {})) {
    if (!installPath || locked.link || !locked.version) continue;

    const name =
      locked.name ??
      installPath.slice(installPath.lastIndexOf("node_modules/") + 13);
    const expectedRef = `${name}@${locked.version}`;
    if (!componentRefs.has(expectedRef)) {
      throw new Error(`Locked dependency ${expectedRef} is missing from SBOM`);
    }
  }
}
