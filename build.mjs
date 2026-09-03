import { cp, mkdir, readdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await cp("styles.css", "dist/styles.css");
await cp("public", "dist", { recursive: true });

for (const file of await readdir(".")) {
  if (file.endsWith(".html")) await cp(file, `dist/${file}`);
  if (file.endsWith(".js") && file !== "build.mjs") await cp(file, `dist/${file}`);
}

console.log("Fe de ratas lista en dist/");
