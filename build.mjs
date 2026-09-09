import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const faviconData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAGhUExURQAAANUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGNUqGAAAAB7XDiIAAACJdFJOUwAAAQknOyMGBVy84fOlOgIDH5Tu5FkZkZ0sHb3+6IMSaa0ID6P7u5v5yRBu/PU2tUsg1+bjaAoirMTC9FrB+NF/uXgWB5+CdOpr54QVBDLtG6aoQ81xQSTZ9qEhR+Xd1UBJZIo0MeyHsymcc8o1608/YkoXK+lyFE2agUYmGEJvgIbPwLiqj1YtlO8gAwAAAAFiS0dEAIgFHUgAAAAHdElNRQfqCQkLKwvm5HS/AAABmUlEQVQ4y62TB1PCQBCFeViiBk0UQVQERREbKhbsjdgLKmLvvVdULNjr/WvvQhQVZ3AcdyaTmdvv3u6+bFSqfw5AjQgA8EutP9SCOio6JpZTSoQDiItP4DV8YpIAFQTxeytAcoqWsEjVidCnGdK/EkBGJiFGGoRkmczZhORYvgK5ecE8Q6z5tgJSWBSSYLMXlyh5yhFitxKtofSjS9qvpUzRJ7KQTPHl7xpUwFEhn1sr34UYVFXtDCJATS27TJ+6ekVBjoZGGQBim4waJmukEzSzV0NLoqnV0OaSgkB7h72zS9Ym3T297Gpf/wAgWATFVPdgmjg03MwyHmnES0uNUqNDTkOnGQPGJ8hk79Q0MDPrmZtP/wYsAItafslNzQE3vLxga1vJFULA6tq6Gs6ZzLoN2yYlSre2+107ebsfToLr2NtXA9LB4ZGPmganWeCOV6UQQMc8OfUj2BjgO9OHfWrH+Z734jLg818Frm9u3eF7Cy7pLuF+5+Fx4+n5xf/j2tJ900e/HjuKxL9sNdtPRAYi/jKfzf3feAMNGF5KuhxxGQAAAABJRU5ErkJggg==";

await mkdir("dist", { recursive: true });
await cp("styles.css", "dist/styles.css");
await cp("public", "dist", { recursive: true });

for (const file of await readdir(".")) {
  if (file.endsWith(".html")) {
    const html = await readFile(file, "utf8");
    const themed = html.replace(
      '<link rel="stylesheet" href="/styles.css">',
      `<link rel="icon" type="image/png" sizes="32x32" href="${faviconData}"><meta name="theme-color" content="#d52a18"><script src="/theme.js"></script><link rel="stylesheet" href="/styles.css">`
    );
    await writeFile(`dist/${file}`, themed);
  }
  if (file.endsWith(".js") && file !== "build.mjs") await cp(file, `dist/${file}`);
}

console.log("Fe de ratas lista en dist/");
