import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("JARVIS X shell contains the required workspace views", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const id of ["messages", "composer-input", "sidebar", "model-select", "file-input", "voice-button"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});

test("JARVIS X is configured as a light-first PWA", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const manifest = await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
  assert.match(html, /theme-color" content="#f7f4ed"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.doesNotMatch(html, /prefers-color-scheme:\s*dark/);
});