#!/usr/bin/env bun
/**
 * S15 — Google Flow via Chrome DevTools Protocol (CDP)
 *
 * Validates driving Google Flow from a signed-in Chrome over CDP — the
 * foundation for the FlowAdapter (Decisions Log D020).
 *
 * Supports the full character-video workflow:
 *   - Navigate to a specific Flow project URL
 *   - Select a character from the project's character roster (via Add button)
 *   - Configure generation settings: mode (video), aspect ratio (9:16),
 *     model (Omni Flash), duration (4s), count (1x)
 *   - Type the prompt
 *   - Optionally submit and intercept the generation response
 *
 * Prerequisites:
 *   1. ./scripts/flow-chrome.sh login   (sign in to Google in plain Chrome)
 *   2. ./scripts/flow-chrome.sh attach   (reopen profile with CDP on :9222)
 *
 * Usage:
 *   bun run spikes/s15-google-flow-cdp.ts [prompt] [options]
 *
 * Options:
 *   --project-url <url>     Flow project URL (default: the Musachi test project)
 *   --character <name>      Character name to select (e.g. "Musachi")
 *   --mode <image|video>    Generation mode (default: video)
 *   --aspect <ratio>        Aspect ratio (default: 9:16)
 *   --model <name>          Model name substring (default: Omni Flash)
 *   --duration <seconds>    Video duration (default: 4)
 *   --count <n>             Generation count multiplier (default: 1)
 *   --no-submit             Configure everything + type prompt but DON'T submit
 *   --no-generate           Alias for --no-submit
 *   --port <n>              CDP port (default: 9222)
 */

import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import CDP from "chrome-remote-interface";
import { loadEnv, writeBinaryArtifact, writeArtifact, type SpikeResult } from "./lib/spike.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPIKE_ID = "s15";

const DEFAULT_PROJECT_URL = "https://labs.google/fx/tools/flow/project/28a694c1-afc4-4327-b964-2d3416fc716c";
const AISANDBOX_HOST = "aisandbox-pa.googleapis.com";
const DEFAULT_PROMPT = "Musachi walking through a busy market street, cinematic, golden hour";

await loadEnv();

// --- arg parsing ---
const args = process.argv.slice(2);
let port = 9222;
let doSubmit = true;
let prompt = DEFAULT_PROMPT;
let projectUrl = DEFAULT_PROJECT_URL;
let characterName = "Musachi";
let mode = "video";
let aspect = "9:16";
let modelName = "Omni Flash";
let duration = 4;
let count = 1;

for (let i = 0; i < args.length; i++) {
  const a = args[i] ?? "";
  if (a === "--port") { port = Number(args[++i] ?? port); }
  else if (a === "--no-submit" || a === "--no-generate") { doSubmit = false; }
  else if (a === "--project-url") { projectUrl = args[++i] ?? projectUrl; }
  else if (a === "--character") { characterName = args[++i] ?? characterName; }
  else if (a === "--mode") { mode = args[++i] ?? mode; }
  else if (a === "--aspect") { aspect = args[++i] ?? aspect; }
  else if (a === "--model") { modelName = args[++i] ?? modelName; }
  else if (a === "--duration") { duration = Number(args[++i] ?? duration); }
  else if (a === "--count") { count = Number(args[++i] ?? count); }
  else if (!a.startsWith("--")) { prompt = a; }
}

const measurements: Record<string, string | number | boolean> = {
  cdpPort: port,
  projectUrl,
  character: characterName,
  mode,
  aspect,
  model: modelName,
  duration,
  count,
  prompt,
  doSubmit,
};
const artifacts: string[] = [];
const notes: string[] = [];
let stageA = false, stageB = false, stageD = false, stageE = false, stageF = false, stageC = false;

function log(msg: string) { console.log(`[s15] ${msg}`); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================================
// CDP interaction helpers
// ============================================================================

/** Evaluate JS in the page and return parsed JSON. */
async function evalJS(client: any, expression: string): Promise<any> {
  const res = await client.Runtime.evaluate({
    expression,
    returnByValue: true,
  });
  const value = res.result?.value ?? null;
  // With returnByValue: true, CDP may return the value already parsed as a
  // JS object (array/object) or as a JSON string. Handle both.
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

/** Real mouse click at (x, y) via CDP Input domain (reCAPTCHA-friendly). */
async function realClick(client: any, x: number, y: number): Promise<void> {
  const { Input } = client;
  await Input.dispatchMouseEvent({ type: "mouseMoved", x, y });
  await sleep(150);
  await Input.dispatchMouseEvent({ type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await Input.dispatchMouseEvent({ type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(200);
}

/** Type text via CDP Input.insertText (real keyboard input). */
async function typeText(client: any, text: string): Promise<void> {
  const { Input } = client;
  await Input.insertText({ text });
  await sleep(300);
}

/** Press a key via CDP. */
async function pressKey(client: any, key: string, code: string, vk: number, modifiers = 0): Promise<void> {
  const { Input } = client;
  await Input.dispatchKeyEvent({ type: "keyDown", modifiers, code, key, windowsVirtualKeyCode: vk });
  await Input.dispatchKeyEvent({ type: "keyUp", modifiers, code, key, windowsVirtualKeyCode: vk });
  await sleep(100);
}

/**
 * Dump all clickable elements (buttons, [role=button], divs with click handlers
 * that look interactive) with rich metadata. Writes to an artifact file.
 */
async function dumpClickables(client: any, artifactName: string): Promise<any[]> {
  const data = await evalJS(client, `(() => {
    const sel = 'button, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [data-testid], a[href]';
    const els = Array.from(document.querySelectorAll(sel));
    const out = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (el.disabled) continue;
      const text = (el.innerText || '').trim();
      const aria = el.getAttribute('aria-label') || '';
      const title = el.getAttribute('title') || '';
      const testid = el.getAttribute('data-testid') || '';
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const cls = (el.className || '').toString().slice(0, 100);
      const label = text || aria || title || testid;
      out.push({
        tag: el.tagName.toLowerCase(), role, text: text.slice(0, 80),
        aria: aria.slice(0, 60), title: title.slice(0, 60), testid,
        cls, label: label.slice(0, 80),
        x: r.x + r.width/2, y: r.y + r.height/2,
        w: r.width, h: r.height,
      });
    }
    return JSON.stringify(out);
  })()`);
  await writeArtifact(SPIKE_ID, artifactName, JSON.stringify(data, null, 2));
  artifacts.push(`spikes/output/s15/${artifactName}`);
  return data ?? [];
}

/**
 * Find a clickable element whose label matches a regex, and click it.
 * Returns { clicked, label, x, y } or { clicked: false }.
 */
async function findAndClick(
  client: any,
  pattern: RegExp,
  opts: { exact?: boolean; dumpName?: string } = {},
): Promise<{ clicked: boolean; label?: string; x?: number; y?: number }> {
  const { Runtime } = client;
  // Build the JS expression to find and return the element's bounding box.
  const exactFlag = opts.exact ? "true" : "false";
  const res = await Runtime.evaluate({
    expression: `(() => {
      const pattern = ${pattern.toString()};
      const exact = ${exactFlag};
      const sel = 'button, [role="button"], [role="menuitem"], [role="option"], [role="tab"], a[href], div[tabindex], span[tabindex]';
      const els = Array.from(document.querySelectorAll(sel));
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (el.disabled) continue;
        const text = (el.innerText || '').trim();
        const aria = el.getAttribute('aria-label') || '';
        const title = el.getAttribute('title') || '';
        const testid = el.getAttribute('data-testid') || '';
        const label = text || aria || title || testid;
        if (!label) continue;
        const match = exact ? label.toLowerCase() === pattern.source.toLowerCase() : pattern.test(label);
        if (match) {
          return JSON.stringify({
            ok: true, label: label.slice(0, 80),
            tag: el.tagName.toLowerCase(),
            x: r.x + r.width/2, y: r.y + r.height/2,
            w: r.width, h: r.height,
          });
        }
      }
      return JSON.stringify({ ok: false });
    })()`,
    returnByValue: true,
  });
  const result = JSON.parse(res.result?.value ?? '{"ok":false}');
  if (!result.ok) {
    log(`  findAndClick: no match for ${pattern}`);
    return { clicked: false };
  }
  log(`  findAndClick: found "${result.label}" at (${Math.round(result.x)}, ${Math.round(result.y)})`);
  await realClick(client, result.x, result.y);
  return { clicked: true, label: result.label, x: result.x, y: result.y };
}

/** Focus the prompt textbox and type text into it via real keyboard input. */
async function typeIntoPrompt(client: any, text: string): Promise<{ ok: boolean; length: number; preview: string }> {
  const { Runtime, Input } = client;

  // Focus the textbox.
  const focus = await evalJS(client, `(() => {
    const el = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
    if (!el) return JSON.stringify({ ok: false });
    el.focus();
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el.focus();
    return JSON.stringify({ ok: true, tag: el.tagName, role: el.getAttribute('role') });
  })()`);
  if (!focus?.ok) return { ok: false, length: 0, preview: "" };
  await sleep(400);

  // Clear existing content: Ctrl+A, Backspace.
  await pressKey(client, "a", "KeyA", 65, 2);
  await pressKey(client, "Backspace", "Backspace", 8);
  await sleep(150);

  // Type the prompt.
  await Input.insertText({ text: text });
  log(`  typed prompt via Input.insertText (${text.length} chars)`);
  await sleep(600);

  // Verify.
  const verify = await evalJS(client, `(() => {
    const el = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
    if (!el) return JSON.stringify({ ok: false, length: 0 });
    const val = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.innerText;
    return JSON.stringify({ ok: true, length: (val || '').length, preview: (val || '').slice(0, 100) });
  })()`);
  return { ok: !!verify?.ok, length: verify?.length ?? 0, preview: verify?.preview ?? "" };
}

// ============================================================================
// Stage A — CDP connect + navigate to project URL
// ============================================================================

async function stageA_connect(): Promise<{ client: any; target: any }> {
  log(`Stage A: listing targets on http://127.0.0.1:${port} ...`);
  const targets: any[] = await CDP.List({ port });
  measurements.targetCount = targets.length;

  // Prefer a tab already on this project URL; else a Flow tab; else create one.
  let target = targets.find(
    (t) => t.type === "page" && t.url?.includes(projectUrl),
  );
  if (!target) {
    // Check if any Flow tab is open and navigate it.
    target = targets.find(
      (t) => t.type === "page" && /labs\.google\/fx\/(tools\/)?flow/.test(t.url || ""),
    );
    if (target) {
      log(`Stage A: navigating existing Flow tab to project URL ...`);
      const navClient = await CDP({ target: target.id, port });
      await navClient.Page.enable();
      await navClient.Page.navigate({ url: projectUrl });
      await sleep(6000);
      await navClient.close();
    } else {
      log("Stage A: no Flow tab open — creating one at project URL ...");
      target = await CDP.New({ port, url: projectUrl });
      measurements.createdNewTab = true;
      await sleep(8000);
    }
  } else {
    measurements.createdNewTab = false;
    log("Stage A: found tab already on project URL.");
  }

  log(`Stage A: attaching to target ${target.id}`);
  const client = await CDP({ target: target.id, port });
  const { Page, Network, Runtime } = client;
  await Promise.all([Page.enable(), Network.enable(), Runtime.enable()]);
  measurements.cdpAttached = true;
  stageA = true;
  log("Stage A: PASS — connected to project page.");
  return { client, target };
}

// ============================================================================
// Stage B — read page state
// ============================================================================

async function stageB_readState(client: any): Promise<void> {
  log("Stage B: reading page state ...");
  await sleep(3000);

  const state = await evalJS(client, `(() => {
    const body = document.body ? document.body.innerText.slice(0, 3000) : '';
    const hasSignInBtn = !!document.querySelector('button[aria-label*="Sign in" i], a[href*="accounts.google.com"]');
    const textareas = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')).length;
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean).slice(0, 40);
    const creditsMatch = body.match(/(\\d+)\\s*credits?/i);
    return JSON.stringify({
      url: location.href,
      title: document.title,
      bodySnippet: body.slice(0, 1500),
      hasSignInBtn,
      textareaCount: textareas,
      buttonLabels: buttons,
      creditsMatch: creditsMatch ? creditsMatch[0] : null,
    });
  })()`);

  measurements.flowUrl = state?.url ?? "unknown";
  measurements.flowTitle = state?.title ?? "unknown";
  measurements.hasSignInButton = !!state?.hasSignInBtn;
  measurements.textareaCount = state?.textareaCount ?? 0;
  measurements.creditsMatch = state?.creditsMatch ?? null;
  measurements.buttonCount = state?.buttonLabels?.length ?? 0;

  await writeArtifact(SPIKE_ID, "page-state.json", JSON.stringify(state, null, 2));
  artifacts.push("spikes/output/s15/page-state.json");

  const loggedIn = !state?.hasSignInBtn;
  measurements.loggedIn = loggedIn;
  if (loggedIn) {
    stageB = true;
    log(`Stage B: PASS — logged in. textareas=${state?.textareaCount}, credits=${state?.creditsMatch ?? "?"}`);
    log(`Stage B: buttons: ${(state?.buttonLabels ?? []).slice(0, 20).join(" | ")}`);
    log(`Stage B: body snippet: ${(state?.bodySnippet ?? "").slice(0, 200)}`);
  } else {
    log("Stage B: FAIL — not logged in.");
    notes.push("Not logged in to Google Flow.");
  }
}

// ============================================================================
// Stage D — select character(s) via Add button next to prompt box
// ============================================================================

/**
 * Find the Add button that is specifically next to the prompt box.
 * We locate the prompt textbox first, then find the closest button labeled
 * "+" or "Add" within a reasonable distance (same row / adjacent).
 */
async function findAddButtonNearPrompt(client: any): Promise<{ ok: boolean; x?: number; y?: number; label?: string }> {
  const { Runtime } = client;
  const res = await Runtime.evaluate({
    expression: `(() => {
      // 1. Find the prompt textbox.
      const tx = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
      if (!tx) return JSON.stringify({ ok: false, reason: 'no textbox' });
      const txRect = tx.getBoundingClientRect();
      const txCenter = { x: txRect.x + txRect.width/2, y: txRect.y + txRect.height/2 };

      // 2. Find all buttons, score by proximity to the textbox and add-like label.
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      let best = null;
      let bestScore = -1;
      for (const b of btns) {
        const r = b.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || b.disabled) continue;
        const cx = r.x + r.width/2, cy = r.y + r.height/2;
        const dist = Math.hypot(cx - txCenter.x, cy - txCenter.y);
        // Must be reasonably close (within 300px of the textbox).
        if (dist > 300) continue;
        const text = (b.innerText || '').trim();
        const aria = b.getAttribute('aria-label') || '';
        const title = b.getAttribute('title') || '';
        const label = text || aria || title;
        // Score: add-like label + close to textbox.
        let score = 0;
        if (/^(\\+|add|add reference|add ingredient|add character|attach)/i.test(label)) score += 100;
        if (/add|reference|ingredient|character|attach/i.test(label)) score += 30;
        // Icon-only "+" buttons near the textbox are strong candidates.
        if (!text && r.width < 60 && dist < 150) score += 50;
        // Closer = better.
        score += Math.max(0, 50 - dist / 5);
        if (score > bestScore) { bestScore = score; best = { label: label.slice(0, 60), x: cx, y: cy, w: r.width, h: r.height, dist, score }; }
      }
      if (!best || bestScore < 30) return JSON.stringify({ ok: false, reason: 'no add button near textbox' });
      return JSON.stringify({ ok: true, ...best });
    })()`,
    returnByValue: true,
  });
  return JSON.parse(res.result?.value ?? '{"ok":false}');
}

/**
 * Select a single character from the bottom modal:
 *   1. The modal is already open with a focused search box.
 *   2. Type the character name.
 *   3. Wait for the results list to render.
 *   4. Click the first result item.
 */
async function selectCharacterFromModal(client: any, name: string): Promise<boolean> {
  const { Runtime, Input } = client;

  // The search box should already be focused when the modal opens.
  // Type the character name via real keyboard input.
  log(`  typing "${name}" in search box ...`);
  await Input.insertText({ text: name });
  await sleep(1500); // wait for results to render

  // Find and click the first result item in the list.
  // Results are typically list items, cards, or buttons below the search box.
  // We look for elements containing the character name that appeared after
  // typing, prioritizing list-like structures.
  const result = await Runtime.evaluate({
    expression: `(() => {
      // Look for the character name in clickable elements that are likely
      // list items: [role="option"], [role="listitem"], li, or elements
      // inside a list/grid container.
      const selectors = [
        '[role="option"]', '[role="listitem"]', '[role="gridcell"]',
        'li', '[data-testid*="result"]', '[data-testid*="item"]',
        '[data-testid*="character"]',
      ];
      // Also check generic clickable elements containing the name.
      const name = ${JSON.stringify(name)};
      const nameLower = name.toLowerCase();

      // First pass: structured list items containing the name.
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          const text = (el.innerText || '').trim().toLowerCase();
          if (text.includes(nameLower)) {
            return JSON.stringify({ ok: true, label: el.innerText.trim().slice(0, 80), x: r.x + r.width/2, y: r.y + r.height/2, via: sel });
          }
        }
      }

      // Second pass: any clickable element containing the name, that is NOT
      // the search box itself.
      const clickables = Array.from(document.querySelectorAll('button, [role="button"], [tabindex], div[class*="item"], div[class*="card"], div[class*="result"]'));
      for (const el of clickables) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const text = (el.innerText || '').trim();
        if (text.toLowerCase().includes(nameLower) && text.length < 200) {
          // Skip if this is the search input itself.
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true') continue;
          return JSON.stringify({ ok: true, label: text.slice(0, 80), x: r.x + r.width/2, y: r.y + r.height/2, via: 'clickable-scan' });
        }
      }

      // Third pass: any visible element containing the name (leaf text nodes),
      // then click its nearest clickable ancestor.
      const allEls = Array.from(document.querySelectorAll('*'));
      for (const el of allEls) {
        if (el.children.length > 0) continue;
        const text = (el.innerText || el.textContent || '').trim();
        if (text.toLowerCase().includes(nameLower) && text.length < 100) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          // Find nearest clickable ancestor.
          let ancestor = el.parentElement;
          while (ancestor && !ancestor.matches('button, [role="button"], [role="option"], [tabindex]')) {
            ancestor = ancestor.parentElement;
          }
          if (ancestor) {
            const ar = ancestor.getBoundingClientRect();
            return JSON.stringify({ ok: true, label: text.slice(0, 80), x: ar.x + ar.width/2, y: ar.y + ar.height/2, via: 'ancestor' });
          }
          // Click the text element itself.
          return JSON.stringify({ ok: true, label: text.slice(0, 80), x: r.x + r.width/2, y: r.y + r.height/2, via: 'text-node' });
        }
      }

      return JSON.stringify({ ok: false });
    })()`,
    returnByValue: true,
  });
  const found = JSON.parse(result.result?.value ?? '{"ok":false}');

  if (!found.ok) {
    log(`  could not find "${name}" in search results — dumping visible text ...`);
    // Dump all visible text for debugging.
    const allText = await evalJS(client, `(() => {
      const els = Array.from(document.querySelectorAll('*'));
      const results = [];
      for (const el of els) {
        if (el.children.length > 0) continue;
        const text = (el.innerText || el.textContent || '').trim();
        if (text && text.length < 200) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            results.push({ text: text.slice(0, 100), tag: el.tagName.toLowerCase(), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
          }
        }
      }
      return JSON.stringify(results.slice(0, 150));
    })()`);
    await writeArtifact(SPIKE_ID, `modal-text-${name}.json`, JSON.stringify(allText, null, 2));
    artifacts.push(`spikes/output/s15/modal-text-${name}.json`);
    return false;
  }

  log(`  found "${found.label}" via ${found.via} at (${Math.round(found.x)}, ${Math.round(found.y)}) — clicking ...`);
  await realClick(client, found.x, found.y);
  await sleep(1500); // wait for character to be added
  return true;
}

async function stageD_selectCharacter(client: any): Promise<void> {
  // Support multiple characters via comma-separated --character "Musachi, George"
  const characters = characterName.split(",").map((c) => c.trim()).filter(Boolean);
  log(`Stage D: selecting ${characters.length} character(s): ${characters.join(", ")} ...`);

  const selectedChars: string[] = [];

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i]!;
    log(`Stage D: [${i + 1}/${characters.length}] selecting "${char}" ...`);

    // 1. Find and click the Add button next to the prompt box.
    log(`  looking for Add button near prompt box ...`);
    const addBtn = await findAddButtonNearPrompt(client);
    if (!addBtn.ok) {
      log(`  Add button not found near prompt — dumping clickables ...`);
      await dumpClickables(client, `clickables-stage-d-${i}.json`);
      notes.push(`Stage D: Add button not found for character "${char}".`);
      continue;
    }
    log(`  Add button found: "${addBtn.label}" at (${Math.round(addBtn.x!)}, ${Math.round(addBtn.y!)}) — clicking ...`);
    await realClick(client, addBtn.x!, addBtn.y!);
    measurements.addButtonClicked = true;
    log(`  waiting for bottom modal to open ...`);
    await sleep(2000);

    // 2. The modal is open with a focused search box. Type the character name.
    const selected = await selectCharacterFromModal(client, char);
    if (selected) {
      selectedChars.push(char);
      log(`  PASS — "${char}" selected.`);
    } else {
      log(`  FAIL — could not select "${char}".`);
      notes.push(`Stage D: could not select "${char}".`);
    }

    // 3. Close the modal — press Escape.
    await pressKey(client, "Escape", "Escape", 27);
    await sleep(800);
  }

  measurements.charactersSelected = selectedChars.length;
  measurements.selectedCharacterNames = selectedChars.join(", ");
  if (selectedChars.length > 0) {
    stageD = true;
    log(`Stage D: PASS — ${selectedChars.length} character(s) selected: ${selectedChars.join(", ")}`);
  } else {
    log(`Stage D: FAIL — no characters selected.`);
  }
}

// ============================================================================
// Stage E — configure generation settings via the settings dialog
// ============================================================================

/**
 * Find the settings button in the prompt toolbar.
 * Layout (left to right): [Add] [Agent] [Settings] ... [Submit]
 * The settings button is near the prompt box, to the right of the Agent button,
 * and before the submit/generate button. It may be an icon-only button.
 *
 * Strategy: find all buttons near the prompt box, exclude Add/Agent/Submit
 * buttons, and pick the remaining one (or the one that looks like a settings/
 * gear icon).
 */
async function findSettingsButton(client: any): Promise<{ ok: boolean; x?: number; y?: number; label?: string }> {
  const { Runtime } = client;
  const res = await Runtime.evaluate({
    expression: `(() => {
      const tx = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
      if (!tx) return JSON.stringify({ ok: false, reason: 'no textbox' });
      const txRect = tx.getBoundingClientRect();
      const txCenter = { x: txRect.x + txRect.width/2, y: txRect.y + txRect.height/2 };

      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const candidates = [];
      for (const b of btns) {
        const r = b.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || b.disabled) continue;
        const cx = r.x + r.width/2, cy = r.y + r.height/2;
        const dist = Math.hypot(cx - txCenter.x, cy - txCenter.y);
        // Must be in the toolbar row near the textbox (within 250px).
        if (dist > 250) continue;
        const text = (b.innerText || '').trim();
        const aria = b.getAttribute('aria-label') || '';
        const title = b.getAttribute('title') || '';
        const label = text || aria || title;
        // Exclude Add, Agent, and Submit/Generate buttons — we want the
        // settings button between Agent and Submit.
        if (/^(\\+|add|agent)/i.test(label)) continue;
        if (/generate|create|submit|send|make|build/i.test(label)) continue;
        // The settings button might have aria-label like "settings", "config",
        // "options", or be icon-only.
        let score = 0;
        if (/setting|config|option|prefer|gear|tool/i.test(label)) score += 80;
        // Icon-only buttons in the toolbar are likely the settings button.
        if (!text && r.width < 60) score += 40;
        // Closer to textbox = better.
        score += Math.max(0, 40 - dist / 6);
        candidates.push({ label: label.slice(0, 60), x: cx, y: cy, w: r.width, h: r.height, dist, score, text: text.slice(0, 30), aria: aria.slice(0, 40) });
      }
      if (candidates.length === 0) return JSON.stringify({ ok: false, reason: 'no settings button found' });
      // Sort by score descending — pick the best.
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      return JSON.stringify({ ok: true, ...best, allCandidates: candidates.slice(0, 5) });
    })()`,
    returnByValue: true,
  });
  const result = JSON.parse(res.result?.value ?? '{"ok":false}');
  if (result.ok) {
    log(`  settings button candidates: ${(result.allCandidates ?? []).map((c: any) => `"${c.label}"(${c.score})`).join(", ")}`);
  }
  return result;
}

/**
 * Click an option inside the settings dialog by text match.
 * Flow's dialog options are <div>/<button> elements with icon+label text
 * like "videocam\nVideo". We match against ANY individual line of the text,
 * not the full concatenated label. We SKIP container elements (those with
 * clickable children or very long text) and prefer leaf buttons.
 */
async function clickDialogOption(client: any, pattern: RegExp, label: string): Promise<boolean> {
  const { Runtime } = client;
  const res = await Runtime.evaluate({
    expression: `(() => {
      const pattern = ${pattern.toString()};
      const sel = 'button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [tabindex], div[class*="toggle"], div[class*="option"], div[class*="button"], div[class*="tab"], div[class*="chip"], div[class*="select"]';
      const els = Array.from(document.querySelectorAll(sel));
      const matches = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (el.disabled) continue;
        const text = (el.innerText || '').trim();
        const aria = el.getAttribute('aria-label') || '';
        const lab = text || aria;
        if (!lab) continue;
        // Split into lines and check if ANY line matches the pattern.
        // Flow buttons have text like "videocam\\nVideo" (icon + label).
        const lines = lab.split('\\n').map(s => s.trim()).filter(Boolean);
        const matchingLine = lines.find(l => pattern.test(l));
        if (!matchingLine) continue;
        // SKIP containers: if this element has children that also match the
        // selector, it's a wrapper — we want the leaf.
        const hasClickableChild = Array.from(el.children).some(c =>
          c.matches(sel) && c.getBoundingClientRect().width > 0
        );
        const isContainer = hasClickableChild || lab.length > 40;
        // Exact match = the matching line is short and matches exactly.
        const exactMatch = matchingLine.length < 30;
        matches.push({
          label: lab.slice(0, 80), matchingLine: matchingLine.slice(0, 40),
          x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height,
          isContainer, exactMatch, textLen: lab.length,
        });
      }
      if (matches.length === 0) return JSON.stringify({ ok: false });
      // Sort: prefer non-container > exact match > shorter text.
      matches.sort((a, b) => {
        if (a.isContainer !== b.isContainer) return a.isContainer ? 1 : -1;
        if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
        return a.textLen - b.textLen;
      });
      const best = matches[0];
      return JSON.stringify({ ok: true, ...best, allMatches: matches.slice(0, 5).map(m => ({ line: m.matchingLine.slice(0, 30), exact: m.exactMatch, container: m.isContainer })) });
    })()`,
    returnByValue: true,
  });
  const found = JSON.parse(res.result?.value ?? '{"ok":false}');
  if (!found.ok) {
    log(`  E: could not find "${label}" option — dumping dialog elements ...`);
    await dumpDialogElements(client, `dialog-${label.replace(/[^a-z0-9]/gi, "-")}.json`);
    return false;
  }
  log(`  E: clicking "${found.matchingLine}" (exact=${found.exactMatch}, container=${found.isContainer}) at (${Math.round(found.x)}, ${Math.round(found.y)}) ...`);
  if (found.allMatches) {
    log(`  E: all matches: ${found.allMatches.map((m: any) => `"${m.line}"(exact=${m.exact},container=${m.container})`).join(", ")}`);
  }
  await realClick(client, found.x, found.y);
  await sleep(600);
  return true;
}

/**
 * Dump ALL visible elements in the dialog area (not just buttons) for debugging.
 * Captures divs, spans, and other non-button elements that Flow uses.
 */
async function dumpDialogElements(client: any, artifactName: string): Promise<void> {
  const data = await evalJS(client, `(() => {
    // Dump all visible elements with text content, not just buttons.
    const els = Array.from(document.querySelectorAll('*'));
    const out = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      // Only leaf elements (no element children) or elements with < 3 children.
      if (el.children.length > 3) continue;
      const text = (el.innerText || '').trim();
      if (!text || text.length > 100) continue;
      const cls = (el.className || '').toString().slice(0, 80);
      out.push({
        tag: el.tagName.toLowerCase(), cls, text: text.slice(0, 60),
        x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2),
        w: Math.round(r.width), h: Math.round(r.height),
        childCount: el.children.length,
      });
    }
    return JSON.stringify(out);
  })()`);
  await writeArtifact(SPIKE_ID, artifactName, JSON.stringify(data, null, 2));
  artifacts.push(`spikes/output/s15/${artifactName}`);
}

/**
 * Select an option from a <select> dropdown (native HTML select) inside the
 * dialog. Used for the model selector which may be a native <select>.
 */
async function selectDropdownOption(client: any, optionPattern: RegExp, label: string): Promise<boolean> {
  const { Runtime } = client;
  // First, find a <select> element in the dialog.
  const selectRes = await Runtime.evaluate({
    expression: `(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const sel of selects) {
        const r = sel.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        // Check if any option matches.
        const options = Array.from(sel.options);
        const match = options.find(o => ${optionPattern.toString()}.test(o.text || o.value || ''));
        if (match) {
          return JSON.stringify({ ok: true, selectFound: true, optionValue: match.value, optionText: match.text, x: r.x + r.width/2, y: r.y + r.height/2 });
        }
        // Return the select info even if no match (for debugging).
        return JSON.stringify({ ok: false, selectFound: true, options: options.map(o => o.text).slice(0, 10), x: r.x + r.width/2, y: r.y + r.height/2 });
      }
      return JSON.stringify({ ok: false, selectFound: false });
    })()`,
    returnByValue: true,
  });
  const selectInfo = JSON.parse(selectRes.result?.value ?? '{"ok":false}');

  if (selectInfo.ok) {
    // Set the select value via JS and dispatch change event.
    log(`  E: selecting "${selectInfo.optionText}" from dropdown ...`);
    await Runtime.evaluate({
      expression: `(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
          const options = Array.from(sel.options);
          const match = options.find(o => ${optionPattern.toString()}.test(o.text || o.value || ''));
          if (match) {
            sel.value = match.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            return 'ok';
          }
        }
        return 'fail';
      })()`,
      returnByValue: true,
    });
    await sleep(500);
    return true;
  }

  // If no native <select>, try clicking a custom dropdown trigger then
  // clicking the option.
  log(`  E: no native <select> with "${label}" — trying custom dropdown ...`);
  // Look for a clickable element that shows the current model name or a
  // dropdown trigger, click it, then click the option.
  const triggerResult = await clickDialogOption(client, /model|veo|omni|nano|imagen|select|choose/i, "model-trigger");
  if (triggerResult) {
    await sleep(800);
    // Now the dropdown is open — click the option.
    const optResult = await clickDialogOption(client, optionPattern, label);
    return optResult;
  }

  // Last resort: just try clicking the model name directly.
  log(`  E: trying direct click on "${label}" ...`);
  return clickDialogOption(client, optionPattern, label);
}

async function stageE_configureSettings(client: any): Promise<void> {
  log(`Stage E: configuring settings — mode=${mode}, type=Ingredients, aspect=${aspect}, model=${modelName}, duration=${duration}s, count=${count}x ...`);

  const results: Record<string, boolean> = {};

  // E.0 — Find and click the settings button (between Agent and Submit).
  log(`Stage E.0: finding settings button near prompt box ...`);
  const settingsBtn = await findSettingsButton(client);
  if (!settingsBtn.ok) {
    log(`Stage E.0: FAIL — settings button not found. Dumping all clickables ...`);
    await dumpClickables(client, "clickables-stage-e0.json");
    notes.push("Stage E: settings button not found.");
    return;
  }
  log(`Stage E.0: settings button found: "${settingsBtn.label}" at (${Math.round(settingsBtn.x!)}, ${Math.round(settingsBtn.y!)}) — clicking ...`);
  await realClick(client, settingsBtn.x!, settingsBtn.y!);
  measurements.settingsButtonClicked = true;
  log(`Stage E.0: waiting for dialog to open ...`);
  await sleep(2000);

  // Dump dialog contents for debugging.
  await dumpDialogElements(client, "dialog-contents.json");

  // E.1 — Row 1: Click "Video" (Image / Video toggle).
  // IMPORTANT: This must be done FIRST because selecting Video mode reveals
  // additional rows (Ingredients/Frames, duration buttons) that don't exist
  // in Image mode.
  log(`Stage E.1: clicking "${mode}" (Image/Video toggle) ...`);
  results.modeSet = await clickDialogOption(client, new RegExp(`^${mode}$`, "i"), mode);
  if (results.modeSet) log(`Stage E.1: PASS — mode set to "${mode}".`);
  else log(`Stage E.1: FAIL — could not set mode.`);
  // Wait for Video-mode-specific UI elements to appear.
  log(`Stage E.1: waiting for Video mode UI to render ...`);
  await sleep(1500);

  // Dump dialog again after mode switch to see new rows.
  await dumpDialogElements(client, "dialog-after-mode.json");

  // E.2 — Row 2: Click "Ingredients" (Frames / Ingredients toggle).
  // This row only appears in Video mode.
  log(`Stage E.2: clicking "Ingredients" (Frames/Ingredients toggle) ...`);
  results.ingredientsSet = await clickDialogOption(client, /^ingredients$/i, "Ingredients");
  if (results.ingredientsSet) log(`Stage E.2: PASS — Ingredients selected.`);
  else log(`Stage E.2: FAIL — could not select Ingredients.`);
  await sleep(800);

  // E.3 — Aspect ratio: Click "9:16".
  log(`Stage E.3: clicking "${aspect}" (aspect ratio toggle) ...`);
  const aspectPattern = new RegExp(aspect.replace(":", "\\s*:\\s*"), "i");
  results.aspectSet = await clickDialogOption(client, aspectPattern, aspect);
  if (results.aspectSet) log(`Stage E.3: PASS — aspect set to "${aspect}".`);
  else log(`Stage E.3: FAIL — could not set aspect.`);
  await sleep(600);

  // E.4 — Model selection: click the model dropdown trigger, then select.
  // The model selector is a custom button showing the current model name
  // (e.g. "🍌 Nano Banana 2 Lite\narrow_drop_down"). Click it to open a
  // dropdown list, then click "Omni Flash" in that list.
  log(`Stage E.4: selecting model "${modelName}" ...`);
  // Step 1: Click the model dropdown trigger (button with arrow_drop_down).
  const modelTriggerClicked = await clickDialogOption(client, /arrow_drop_down|nano banana|veo|omni|imagen/i, "model-trigger");
  if (modelTriggerClicked) {
    await sleep(1000); // wait for dropdown list to open
    // Step 2: Click the model name in the opened dropdown list.
    results.modelSet = await clickDialogOption(client, new RegExp(modelName, "i"), modelName);
  } else {
    // Fallback: try the selectDropdownOption function (native <select>).
    results.modelSet = await selectDropdownOption(client, new RegExp(modelName, "i"), modelName);
  }
  if (results.modelSet) log(`Stage E.4: PASS — model set to "${modelName}".`);
  else log(`Stage E.4: FAIL — could not set model.`);
  await sleep(600);

  // E.5 — Duration: click "4s" (first of 4 duration buttons).
  // Duration buttons only appear in Video mode.
  log(`Stage E.5: clicking "${duration}s" (duration button) ...`);
  results.durationSet = await clickDialogOption(client, new RegExp(`${duration}\\s*s`, "i"), `${duration}s`);
  if (results.durationSet) log(`Stage E.5: PASS — duration set to ${duration}s.`);
  else log(`Stage E.5: FAIL — could not set duration.`);
  await sleep(600);

  // E.6 — Generation count: click "x1" (first count button).
  // Flow labels these as "x1", "x2", "x3", "x4" (x BEFORE the number).
  log(`Stage E.6: clicking "x${count}" (generation count) ...`);
  results.countSet = await clickDialogOption(client, new RegExp(`x\\s*${count}`, "i"), `x${count}`);
  if (results.countSet) log(`Stage E.6: PASS — count set to x${count}.`);
  else log(`Stage E.6: FAIL — could not set count.`);
  await sleep(600);

  // Close the dialog — press Escape.
  await pressKey(client, "Escape", "Escape", 27);
  await sleep(500);

  // Record results.
  measurements.modeSet = results.modeSet ?? false;
  measurements.ingredientsSet = results.ingredientsSet ?? false;
  measurements.aspectSet = results.aspectSet ?? false;
  measurements.modelSet = results.modelSet ?? false;
  measurements.durationSet = results.durationSet ?? false;
  measurements.countSet = results.countSet ?? false;

  const allSet = Object.values(results).every((v) => v === true);
  if (allSet) {
    stageE = true;
    log("Stage E: PASS — all settings configured.");
  } else {
    const failed = Object.entries(results).filter(([, v]) => v !== true).map(([k]) => k);
    log(`Stage E: PARTIAL — failed: ${failed.join(", ")}. See dialog dumps.`);
    notes.push(`Stage E partial: ${failed.join(", ")} not set.`);
  }
}

// ============================================================================
// Stage F — type prompt (without submitting)
// ============================================================================

async function stageF_typePrompt(client: any): Promise<void> {
  log(`Stage F: typing prompt (${doSubmit ? "will submit" : "will NOT submit"}) ...`);

  const result = await typeIntoPrompt(client, prompt);
  measurements.promptTextLength = result.length;
  measurements.promptTyped = result.ok;

  if (!result.ok || result.length === 0) {
    log(`Stage F: FAIL — text entry failed. length=${result.length}`);
    notes.push("Stage F: prompt text entry failed.");
    return;
  }

  log(`Stage F: PASS — prompt typed. length=${result.length}, preview="${result.preview.slice(0, 60)}..."`);
  stageF = true;
}

// ============================================================================
// Stage C — submit + intercept + download (optional)
// ============================================================================

function makeInterceptor(client: any) {
  const { Network } = client;
  const seen: any[] = [];
  const generations: any[] = [];
  Network.responseReceived((params: any) => {
    const url: string = params.response?.url ?? "";
    if (url.includes(AISANDBOX_HOST)) {
      seen.push({
        requestId: params.requestId,
        url,
        status: params.response?.status ?? 0,
        method: params.response?.requestMethod ?? "",
      });
      if (/:(generate|batchAsyncGenerate)/i.test(url)) {
        generations.push({ requestId: params.requestId, url, status: params.response?.status ?? 0 });
        log(`  >> generation response: ${params.response?.status} ${url.slice(0, 90)}`);
      }
    }
  });
  return { seen, generations };
}

async function stageC_submit(client: any): Promise<void> {
  const interceptor = makeInterceptor(client);
  log("Stage C: finding and clicking Generate button ...");

  // Find the generate button — exclude add/upload/reference buttons.
  const { Runtime, Input } = client;
  const dumpRes = await evalJS(client, `(() => {
    const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
    const out = [];
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const text = (b.innerText || '').trim();
      const aria = b.getAttribute('aria-label') || '';
      const label = text || aria;
      out.push({
        label: label.slice(0, 60), text: text.slice(0, 60), aria: aria.slice(0, 60),
        x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height,
        disabled: b.disabled, iconOnly: !text && r.width < 60,
        hasGen: /generate|create|make|build|submit|send/i.test(label),
        hasAdd: /^(\\+|add|upload|reference|ingredient)/i.test(label),
      });
    }
    return JSON.stringify(out);
  })()`);

  await writeArtifact(SPIKE_ID, "buttons-before-submit.json", JSON.stringify(dumpRes, null, 2));
  artifacts.push("spikes/output/s15/buttons-before-submit.json");

  const candidates = (dumpRes ?? []).filter((b: any) => !b.disabled && !b.hasAdd && (b.hasGen || (!b.iconOnly && b.w > 80)));
  if (candidates.length === 0) {
    log("Stage C: FAIL — no generate button found.");
    notes.push("Stage C: no generate button.");
    return;
  }
  // Prefer buttons with gen text.
  candidates.sort((a: any, b: any) => (b.hasGen ? 1 : 0) - (a.hasGen ? 1 : 0));
  const pick = candidates[0]!;
  log(`Stage C: clicking "${pick.label}" at (${Math.round(pick.x)}, ${Math.round(pick.y)}) ...`);
  await realClick(client, pick.x, pick.y);
  measurements.generateClicked = true;

  // Wait for generation response.
  log("Stage C: waiting for generation response (up to 180s) ...");
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await sleep(3000);
    if (interceptor.generations.length > 0) break;
  }

  measurements.aisandboxResponses = interceptor.seen.length;
  measurements.generationResponses = interceptor.generations.length;
  await writeArtifact(SPIKE_ID, "aisandbox-responses.json", JSON.stringify(interceptor.seen, null, 2));
  artifacts.push("spikes/output/s15/aisandbox-responses.json");

  if (interceptor.generations.length === 0) {
    log(`Stage C: FAIL — no generation response. Saw ${interceptor.seen.length} aisandbox calls.`);
    return;
  }

  const gen = interceptor.generations[0]!;
  measurements.generationStatus = gen.status;
  let body: string | null = null;
  try {
    const r: any = await client.Network.getResponseBody({ requestId: gen.requestId });
    body = r.body ?? null;
  } catch { /* ignore */ }
  if (body) {
    await writeArtifact(SPIKE_ID, "generation-response.json", body);
    artifacts.push("spikes/output/s15/generation-response.json");
  }

  if (gen.status >= 400) {
    log(`Stage C: FAIL — HTTP ${gen.status}`);
    notes.push(`Generation HTTP ${gen.status}.`);
    return;
  }

  // Try to extract media URL.
  const mediaUrl = body?.match(/"(?:mediaUrl|signedUrl|downloadUrl|url)"\s*:\s*"([^"]+)"/i)?.[1] ?? null;
  measurements.mediaUrlFound = !!mediaUrl;
  if (mediaUrl) {
    log("Stage C: downloading media ...");
    const imgRes = await fetch(mediaUrl);
    if (imgRes.ok) {
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const ext = mediaUrl.match(/\.(png|jpe?g|webp|mp4|mov)/i)?.[1]?.toLowerCase() ?? "bin";
      const path = await writeBinaryArtifact(SPIKE_ID, `result.${ext}`, buf);
      artifacts.push(path);
      measurements.downloadedBytes = buf.length;
      measurements.downloadedExt = ext;
      stageC = true;
      log(`Stage C: PASS — downloaded ${buf.length} bytes -> ${path}`);
      return;
    }
  }
  stageC = true;
  log("Stage C: PASS — generation response captured (media URL extraction may need refinement).");
}

// ============================================================================
// main
// ============================================================================

async function run(): Promise<SpikeResult> {
  log(`Starting — project=${projectUrl.slice(-12)}, character=${characterName}, mode=${mode}, ${aspect}, ${modelName}, ${duration}s, ${count}x`);
  log(`Prompt: "${prompt.slice(0, 60)}..."`);
  log(`Submit: ${doSubmit ? "YES" : "NO (--no-submit)"}`);

  let client: any | null = null;
  try {
    const { client: c } = await stageA_connect();
    client = c;
    await stageB_readState(client);

    if (!measurements.loggedIn) {
      notes.push("Not logged in — aborting.");
      log("Aborting: not logged in.");
    } else {
      // Stage D: select character.
      await stageD_selectCharacter(client);

      // Stage E: configure settings.
      await stageE_configureSettings(client);

      // Stage F: type prompt.
      await stageF_typePrompt(client);

      // Stage C: submit (only if --no-submit is NOT passed).
      if (doSubmit && stageF) {
        await stageC_submit(client);
      } else if (!doSubmit) {
        log("Skipping Stage C (submit) — --no-submit mode. Review the browser to verify settings.");
      }
    }
  } catch (err) {
    notes.push(`Fatal: ${String(err).slice(0, 300)}`);
    log(`Fatal error: ${String(err).slice(0, 300)}`);
  } finally {
    if (client) {
      try { await client.close(); } catch { /* ignore */ }
    }
  }

  // Determine overall result.
  const stagesPassed = [stageA, stageB, stageD, stageE, stageF, stageC].filter(Boolean).length;
  let resultStr: SpikeResult["result"] = "fail";
  if (doSubmit && stageC) resultStr = "pass";
  else if (!doSubmit && stageA && stageB && stageF) resultStr = "pass";
  else if (stagesPassed >= 3) resultStr = "partial";

  const result: SpikeResult = {
    id: SPIKE_ID,
    name: "Google Flow via CDP — character video workflow",
    goal: "Drive Google Flow from a signed-in Chrome over CDP: navigate to project, select character, configure video settings (9:16, Omni Flash, 4s, 1x), type prompt, optionally submit.",
    result: resultStr,
    measurements,
    notes: notes.join(" ") || "(none)",
    artifactPaths: artifacts,
  };

  const md = `### ${result.id} — ${result.name}\n- **Goal:** ${result.goal}\n- **Result:** ${result.result}\n- **Measurements:**\n${
    Object.entries(result.measurements).map(([k, v]) => `  - ${k}: ${v}`).join("\n")
  }\n- **Notes:** ${result.notes}\n- **Artifacts:**\n${artifacts.map((a) => `  - \`${a}\``).join("\n") || "  - (none)"}\n`;
  await mkdir(join(__dirname, "output", SPIKE_ID), { recursive: true });
  await writeArtifact(SPIKE_ID, "result.md", md);
  console.log("\n" + md);
  return result;
}

export { run };

if (import.meta.path === fileURLToPath(import.meta.url)) {
  run().then((r) => {
    process.exit(r.result === "fail" ? 1 : 0);
  });
}
