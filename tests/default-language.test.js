const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "..", "github-pages", "index.html"), "utf8");

test("the first visit starts in English before the application script runs", () => {
  assert.match(html, /^<!doctype html>\s*<html lang="en">/);
  assert.match(html, /<title>ARPES Superconductivity Explorer<\/title>/);
  assert.match(html, /data-i18n="loginTitle">NSRL Light Source Access<\/h2>/);
  assert.match(html, /data-i18n="guestLoginBtn"[^>]*>Open Website<\/button>/);
  assert.match(html, /class="lang-option active"[^>]*data-lang="en"[^>]*aria-pressed="true"/);
});

test("stored Chinese or English is preserved, with English as the only fallback", () => {
  assert.match(html, /const LANG_STORAGE_KEY = "arpes-explorer-lang-v2";/);
  assert.match(html, /function getInitialLanguage\(\)\s*{[\s\S]*?storedLanguage === "zh" \|\| storedLanguage === "en" \? storedLanguage : "en";[\s\S]*?}/);
  assert.match(html, /let currentLang = getInitialLanguage\(\);/);
  assert.match(html, /async function init\(\)\s*{\s*applyStaticLanguage\(\);\s*initLogin\(\);/);
});

test("language switching updates semantics, static copy, and the saved preference", () => {
  assert.match(html, /function applyStaticLanguage\(\)/);
  assert.match(html, /document\.documentElement\.lang = currentLang === "zh" \? "zh-CN" : "en";/);
  assert.match(html, /document\.querySelectorAll\("\[data-i18n\]"\)/);
  assert.match(html, /safeStorageSet\(LANG_STORAGE_KEY, currentLang\);/);
});
