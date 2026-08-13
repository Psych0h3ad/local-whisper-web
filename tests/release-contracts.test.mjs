import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("keeps unused platform bindings and starter authentication out", async () => {
  const viteConfig = await read("vite.config.ts");

  assert.doesNotMatch(viteConfig, /d1_databases|r2_buckets|PLACEHOLDER/);
  assert.match(viteConfig, /observability:\s*\{\s*enabled:\s*false\s*\}/);
  await assert.rejects(access(new URL("app/chatgpt-auth.ts", root)), {
    code: "ENOENT",
  });
});

test("documents external privacy boundaries", async () => {
  const [readmeJa, readmeEn, privacy] = await Promise.all([
    read("README.md"),
    read("README.en.md"),
    read("PRIVACY.md"),
  ]);

  for (const document of [readmeJa, readmeEn, privacy]) {
    assert.match(document, /\*\.cdn\.hf\.co/);
    assert.match(document, /clipboard|クリップボード/i);
    assert.match(document, /access metadata|アクセスメタデータ|access and security-log metadata/i);
  }
});

test("ships major third-party license texts in the deployment artifact", async () => {
  const expectedFiles = [
    "Apache-2.0.txt",
    "MIT-Hugging-Face-Jinja.txt",
    "MIT-Next.js.txt",
    "MIT-ONNX-Runtime.txt",
    "MIT-React.txt",
    "MIT-Vite-RSC.txt",
    "MIT-vinext.txt",
    "OFL-1.1-Geist.txt",
    "README.txt",
  ];

  for (const filename of expectedFiles) {
    await access(new URL(`public/third-party-licenses/${filename}`, root));
    await access(new URL(`dist/client/third-party-licenses/${filename}`, root));
  }

  assert.match(
    await read("public/third-party-licenses/Apache-2.0.txt"),
    /Apache License\s+Version 2\.0/,
  );
  assert.match(
    await read("public/third-party-licenses/MIT-ONNX-Runtime.txt"),
    /Copyright \(c\) Microsoft Corporation/,
  );
  assert.match(
    await read("public/third-party-licenses/OFL-1.1-Geist.txt"),
    /SIL OPEN FONT LICENSE Version 1\.1/,
  );

  const [lockfile, notices] = await Promise.all([
    read("package-lock.json").then(JSON.parse),
    read("THIRD_PARTY_NOTICES.md"),
  ]);
  for (const [packageName, noticeName] of [
    ["@huggingface/transformers", "Transformers.js"],
    ["onnxruntime-web", "ONNX Runtime Web"],
    ["@huggingface/jinja", "Hugging Face Jinja"],
    ["next", "Next.js"],
    ["vinext", "vinext"],
    ["@vitejs/plugin-rsc", "Vite React Server Components plugin"],
  ]) {
    const version = lockfile.packages[`node_modules/${packageName}`].version;
    assert.ok(
      notices.includes(`| ${noticeName} | ${version} |`),
      `${noticeName} notice is not synchronized to ${version}`,
    );
  }

  const reactVersion = lockfile.packages["node_modules/react"].version;
  assert.equal(
    lockfile.packages["node_modules/react-dom"].version,
    reactVersion,
  );
  assert.equal(
    lockfile.packages["node_modules/react-server-dom-webpack"].version,
    reactVersion,
  );
  assert.ok(
    notices.includes(
      `| React / React DOM / React Server DOM Webpack | ${reactVersion} |`,
    ),
  );
});

test(
  "generates a complete SBOM with a stable root identity",
  { timeout: 30_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "local-whisper-sbom-"));
    const output = join(directory, "sbom.cdx.json");

    try {
      await execFileAsync(
        process.execPath,
        [fileURLToPath(new URL("scripts/generate-sbom.mjs", root)), output],
        { cwd: rootPath, maxBuffer: 64 * 1024 * 1024 },
      );

      const [sbom, manifest] = await Promise.all([
        readFile(output, "utf8").then(JSON.parse),
        read("package.json").then(JSON.parse),
      ]);
      assert.equal(sbom.metadata.component.name, "local-whisper-web");
      assert.equal(sbom.metadata.component.type, "application");

      const components = new Set(
        sbom.components.map((component) => component.name),
      );
      for (const name of [
        ...Object.keys(manifest.dependencies),
        ...Object.keys(manifest.devDependencies),
      ]) {
        assert.ok(components.has(name), `${name} is missing from the SBOM`);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
