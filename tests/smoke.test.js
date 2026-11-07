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

test("private workspace opens without account or login controls", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /auth-google|signout-button|Continue with Google/);
  assert.match(app, /loadLocal\(\)/);
  assert.match(app, /plan_task/);
});

test("Gemini edge function source uses a valid URL expression", async () => {
  const source = await readFile(new URL("../supabase/functions/jarvis-chat/index.ts", import.meta.url), "utf8");
  const brokenExpression = "fetch(" + String.fromCharCode(96) + "https:";
  assert.equal(source.includes(brokenExpression), false);
  assert.match(source, /generativelanguage\.googleapis\.com/);
});

test("agent planner asks for clarification and does not claim execution", async () => {
  const source = await readFile(new URL("../supabase/functions/jarvis-agent/index.ts", import.meta.url), "utf8");
  assert.match(source, /needs_clarification/);
  assert.match(source, /executed:false/);
  assert.match(source, /plan_task/);
});
