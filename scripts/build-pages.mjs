import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const entryPoint = "src/views/ui-root-pixi.js";
const outDir = "dist";
const assetsDir = path.join(outDir, "assets");

function relativeUrl(filePath) {
  return `./${path.relative(outDir, filePath).split(path.sep).join("/")}`;
}

function shortContentHash(contents) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 12);
}

async function buildPagesArtifact() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });

  const result = await build({
    entryPoints: { app: entryPoint },
    bundle: true,
    outdir: assetsDir,
    entryNames: "[name]-[hash]",
    platform: "browser",
    format: "esm",
    target: ["es2020"],
    legalComments: "none",
    metafile: true,
    logLevel: "silent",
  });

  const bundleOutput = Object.entries(result.metafile.outputs).find(
    ([, metadata]) => metadata.entryPoint === entryPoint,
  )?.[0];
  if (!bundleOutput) {
    throw new Error(`esbuild did not report an output for ${entryPoint}`);
  }

  const stylesheet = await readFile("styles.css");
  const stylesheetOutput = path.join(
    assetsDir,
    `styles-${shortContentHash(stylesheet)}.css`,
  );
  await writeFile(stylesheetOutput, stylesheet);

  await cp("images", path.join(outDir, "images"), { recursive: true });
  await copyFile(".nojekyll", path.join(outDir, ".nojekyll"));

  const sourceHtml = await readFile("index.html", "utf8");
  const bundleUrl = relativeUrl(bundleOutput);
  const stylesheetUrl = relativeUrl(stylesheetOutput);
  const deploymentHtml = sourceHtml
    .replace('href="styles.css"', `href="${stylesheetUrl}"`)
    .replace(
      'src="./src/views/ui-root-pixi.js"',
      `src="${bundleUrl}"`,
    );

  if (deploymentHtml === sourceHtml) {
    throw new Error("index.html deployment entry points were not replaced");
  }
  if (deploymentHtml.includes("./src/")) {
    throw new Error("deployment index still references source modules");
  }

  const manifest = {
    entryPoint,
    bundle: bundleUrl,
    stylesheet: stylesheetUrl,
  };
  await Promise.all([
    writeFile(path.join(outDir, "index.html"), deploymentHtml),
    writeFile(
      path.join(outDir, "build-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    ),
  ]);

  console.log(`[build] OK: ${bundleUrl} + ${stylesheetUrl}`);
}

try {
  await buildPagesArtifact();
} catch (error) {
  console.error("[build] Failed");
  if (error?.errors?.length) {
    for (const buildError of error.errors) {
      const file = buildError?.location?.file ?? "<unknown>";
      const line = buildError?.location?.line ?? 0;
      const column = buildError?.location?.column ?? 0;
      console.error(`- ${file}:${line}:${column} ${buildError.text}`);
    }
  } else if (error?.message) {
    console.error(error.message);
  }
  process.exit(1);
}
