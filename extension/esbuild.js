const esbuild = require("esbuild");
const path = require("path");

const isWatch = process.argv.includes("--watch");

const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: !isWatch
};

const webviewConfig = {
  entryPoints: ["src/views/webview/main.ts"],
  bundle: true,
  outfile: "dist/webview.js",
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  minify: !isWatch
};

async function build() {
  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const webCtx = await esbuild.context(webviewConfig);
    await extCtx.watch();
    await webCtx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(extensionConfig);
    await esbuild.build(webviewConfig);
    console.log("Build complete.");
  }
}

build().catch(() => process.exit(1));
