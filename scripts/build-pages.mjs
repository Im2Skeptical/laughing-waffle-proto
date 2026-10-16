import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { getBuildInfo, stampBuildInfo } from './build-info.mjs';

const entryPoint = "src/views/ui-root-pixi.js";
const workerEntryPoint = "src/controllers/timegraph-forecast-worker.js";
const outDir = "dist";
const assetsDir = path.join(outDir, "assets");

function relativeUrl(filePath) {
  return `./${path.relative(outDir, filePath).split(path.sep).join("/")}`;
}

function shortContentHash(contents) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 12);
}

async function assertUnpublished(filePath) {
  try {
    await access(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Pages published ${filePath}`);
}

async function buildPagesArtifact() {
  const buildInfo = await getBuildInfo('pages');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });

  const workerResult = await build({
    entryPoints: { "timegraph-forecast-worker": workerEntryPoint, "life-decision-worker": "src/controllers/life-decision-worker.js",
      "save-load-worker": "src/controllers/save-load-worker.js" },
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
  const workerOutput = Object.entries(workerResult.metafile.outputs).find(
    ([, metadata]) => metadata.entryPoint === workerEntryPoint,
  )?.[0];
  if (!workerOutput) {
    throw new Error(`esbuild did not report an output for ${workerEntryPoint}`);
  }
  const decisionOutput = Object.entries(workerResult.metafile.outputs).find(
    ([, metadata]) => metadata.entryPoint === "src/controllers/life-decision-worker.js"
  )?.[0];
  if (!decisionOutput) throw new Error("Missing life decision worker output");
  const saveLoadOutput = Object.entries(workerResult.metafile.outputs).find(
    ([, metadata]) => metadata.entryPoint === "src/controllers/save-load-worker.js"
  )?.[0];
  if (!saveLoadOutput) throw new Error("Missing save load worker output");
  const workerModuleUrl = `./${path.basename(workerOutput)}`;

  const result = await build({
    entryPoints: { app: entryPoint },
    bundle: true,
    outdir: assetsDir,
    entryNames: "[name]-[hash]",
    platform: "browser",
    format: "esm",
    target: ["es2020"],
    define: {
      __SAVE_LOAD_WORKER_URL__: JSON.stringify(`./${path.basename(saveLoadOutput)}`),
      __LIFE_DECISION_WORKER_URL__: JSON.stringify(`./${path.basename(decisionOutput)}`),
      __TIMEGRAPH_FORECAST_WORKER_URL__: JSON.stringify(workerModuleUrl),
    },
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

  await cp("images", path.join(outDir, "images"), {
    recursive: true,
    filter(source) {
      const parts = source.split(/[/\\]/);
      const filename = parts.at(-1) ?? "";
      const darkFantasyIndex = parts.indexOf("dark-fantasy");
      // fs.cp does not visit children of a rejected directory, so dark-fantasy
      // itself is entered. The workbench loads v4 paintings by path; the other
      // source masters stay out of the published site.
      const keepDarkFantasy = darkFantasyIndex === -1
        || parts.length === darkFantasyIndex + 1
        || parts.includes("card-chrome-prototype")
        || parts.includes("vassal-chrome-prototype")
        || parts.includes("life-map-opening-prototype")
        || parts.includes("map-generation-prototype")
        || parts.includes("settlement-pieces-v4");
      // Retired card workbench keeps only styles shared by the game and Vassals.
      const keepSharedCardStyles = !parts.includes("card-chrome-prototype")
        || filename === "card-chrome-prototype" || filename.endsWith(".css");
      return keepDarkFantasy && keepSharedCardStyles
        && !(parts.includes("map-generation-prototype") && (parts.includes("masters")
          || /^composable-.*-v1\.png$/.test(filename)
          || filename === "terrain-engraving-v1.png" || filename === "landmark-lod-v1.png"))
        && !parts.includes("GameElements")
        && !/^resource-language-[01]\.(json|png)$/.test(filename)
        && !/^test-(data|sheet)-/.test(filename);
    },
  });
  await access(path.join(outDir, "images/dark-fantasy/card-chrome-prototype/display.css"));
  await access(path.join(outDir, "images/dark-fantasy/vassal-chrome-prototype/components.png"));
  await access(path.join(outDir, "images/dark-fantasy/settlement-pieces-v4/forage.webp"));
  await assertUnpublished(path.join(outDir, "images/dark-fantasy/settlement-pieces-v2"));
  await assertUnpublished(path.join(outDir, "images/dark-fantasy/settlement-pieces-v3"));
  await assertUnpublished(path.join(outDir, "images/dark-fantasy/card-chrome-prototype/index.html"));
  await assertUnpublished(path.join(outDir, "images/dark-fantasy/structure-chrome-prototype"));
  await assertUnpublished(path.join(outDir, "images/dark-fantasy/keyword-inspection-prototype"));
  await assertUnpublished(path.join(outDir, "images/dark-fantasy/map-generation-prototype/assets/masters"));
  await assertUnpublished(path.join(outDir, "images/dark-fantasy/map-generation-prototype/assets/composable-forest-v1.png"));
  await access(path.join(outDir, "images/dark-fantasy/map-generation-prototype/assets/runtime/terrain-kit-v1.webp"));
  await copyFile(".nojekyll", path.join(outDir, ".nojekyll"));

  // Isolated workbenches bundle their read-only imports separately from the game.
  for (const folder of ["life-map-opening-prototype", "vassal-chrome-prototype", "map-generation-prototype"]) {
    const studyPath = `images/dark-fantasy/${folder}/study.js`;
    await build({
      entryPoints: [studyPath], outfile: path.join(outDir, studyPath),
      bundle: true, platform: "browser", format: "esm", target: ["es2020"],
      legalComments: "none", logLevel: "silent",
    });
    // Each deployed build needs a new module URL; Pages can cache study.js
    // while the editor HTML is already showing a newer version.
    const htmlPath = path.join(outDir, `images/dark-fantasy/${folder}/index.html`);
    const moduleHash = shortContentHash(await readFile(path.join(outDir, studyPath)));
    const html = await readFile(htmlPath, "utf8");
    await writeFile(htmlPath, html.replace(/src="([^"]+)"/g, (attribute, source) =>
      source.split("?")[0] === studyPath ? `src="${source}${source.includes("?") ? "&" : "?"}build=${moduleHash}"` : attribute));
  }

  const sourceHtml = stampBuildInfo(await readFile("index.html", "utf8"), buildInfo);
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
    ...buildInfo,
    entryPoint,
    bundle: bundleUrl,
    worker: relativeUrl(workerOutput),
    saveLoadWorker: relativeUrl(saveLoadOutput),
    stylesheet: stylesheetUrl,
  };
  await Promise.all([
    writeFile(path.join(outDir, 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`),
    writeFile(path.join(outDir, "index.html"), deploymentHtml),
    writeFile(
      path.join(outDir, "build-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    ),
  ]);

  console.log(
    `[build] OK: ${bundleUrl} + ${relativeUrl(workerOutput)} + ${stylesheetUrl}`,
  );
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
