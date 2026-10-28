import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
}

test("service worker caches every app file", () => {
  const sw = readFileSync("sw.js", "utf8");
  const listed = new Set([...sw.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean));
  const needed = [...walk("js"), ...walk("css"), ...walk("icons"), "index.html", "manifest.webmanifest"];
  for (const file of needed) assert.ok(listed.has(file), `${file} fehlt in sw.js`);
  for (const file of listed) assert.ok(needed.includes(file), `${file} in sw.js existiert nicht`);
});

test("manifest is valid", () => {
  const m = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
});
