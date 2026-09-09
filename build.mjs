import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await cp("styles.css", "dist/styles.css");
await cp("public", "dist", { recursive: true });

for (const file of await readdir(".")) {
  if (file.endsWith(".html")) {
    const html = await readFile(file, "utf8");
    const themed = html.replace(
      '<link rel="stylesheet" href="/styles.css">',
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2"><meta name="theme-color" content="#12110f"><script src="/theme.js"></script><link rel="stylesheet" href="/styles.css">'
    );
    await writeFile(`dist/${file}`, themed);
  }
  if (file.endsWith(".js") && file !== "build.mjs") await cp(file, `dist/${file}`);
}

console.log("Fe de ratas lista en dist/");
