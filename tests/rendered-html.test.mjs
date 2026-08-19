import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Pages build contains its entry assets and project base path", async () => {
  const outputRoot = new URL("../dist-pages/", import.meta.url);
  const html = await readFile(new URL("index.html", outputRoot), "utf8");

  assert.match(html, /<title>Retro Tactical Notes<\/title>/);
  assert.match(html, /href="\/retro-tactical-notes\/favicon\.svg"/);

  const entry = html.match(/<script[^>]+src="([^"]+)"/i)?.[1];
  assert.ok(entry?.startsWith("/retro-tactical-notes/assets/"));
  await access(new URL(entry.replace("/retro-tactical-notes/", ""), outputRoot));
});
