/**
 * FlowAdapter — Google Flow generation via Chrome DevTools Protocol (CDP).
 *
 * D020/D021: Drives a real signed-in Chrome instance over CDP to generate
 * 4s video clips and static images from Google Flow. This is an unofficial
 * client and may break if Google changes Flow's UI or reCAPTCHA.
 *
 * Prerequisites (one-time):
 *   1. ./scripts/flow-chrome.sh login   (sign in to Google in plain Chrome)
 *   2. ./scripts/flow-chrome.sh attach   (reopen profile with CDP on :9222)
 *
 * The adapter attaches to an existing CDP endpoint rather than launching its
 * own browser. Generation is serialized with configurable inter-request delays
 * to keep reCAPTCHA pass rate high (per D020).
 *
 * Cost = 0 (Flow uses subscription credits, not metered API calls).
 *
 * Faithfully ported from the S15 spike (spikes/s15-google-flow-cdp.ts), which
 * validated every stage against the live Flow UI. The spike's selector logic,
 * proximity scoring, multi-pass character search, two-step model dropdown,
 * and reCAPTCHA-friendly mouse/keyboard input are all preserved here.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { uuid, sha256 } from "../utils.ts";

// === Types ===

export interface FlowGenerateOptions {
  /** Flow project URL (e.g. https://labs.google/fx/tools/flow/project/<id>) */
  projectUrl: string;
  /** CDP endpoint (default http://127.0.0.1:9222) */
  cdpEndpoint?: string;
  /** Character name to select (e.g. "Musachi") */
  characterName?: string;
  /** Generation mode: "video" or "image" */
  mode: "video" | "image";
  /** Aspect ratio (default "9:16") */
  aspectRatio?: string;
  /** Model name substring (default "Omni Flash") */
  modelName?: string;
  /** Video duration in seconds (default 4) */
  durationSeconds?: number;
  /** Generation count multiplier (default 1) */
  count?: number;
  /** Prompt text */
  prompt: string;
  /** Artifact store path (for saving downloaded media) */
  artifactStorePath: string;
  /** Channel ID (for asset path scoping) */
  channelId: string;
  /** Run ID (for asset path scoping) */
  runId: string;
  /** Scene ID (for asset path scoping) */
  sceneId: string;
  /** Scene order (for filename) */
  sceneOrder: number;
}

export interface FlowGenerateResult {
  assetId: string;
  filePath: string;
  mediaType: "video-clip" | "image";
  mimeType: string;
  width: number;
  height: number;
  checksum: string;
  provider: string;
  model: string;
  costUsd: number;
}

// === Constants ===

const AISANDBOX_HOST = "aisandbox-pa.googleapis.com";
const FLOW_URL_PATTERN = /labs\.google\/fx\/(tools\/)?flow/;
const MEDIA_URL_REGEX = /"(?:mediaUrl|signedUrl|downloadUrl|url)"\s*:\s*"([^"]+)"/i;

// === FlowAdapter ===

/**
 * Generate a single video clip or image via Google Flow using CDP.
 *
 * High-level flow (mirrors S15 spike stages A–F):
 *   A. Connect to CDP endpoint, find/create a tab on the project URL
 *   B. Wait for SPA to render, verify logged in
 *   D. Select character (if specified) — Add button near prompt → modal search
 *   E. Configure settings — settings button near prompt → dialog: mode, ingredients, aspect, model, duration, count
 *   F. Type the prompt — focus textbox, Ctrl+A clear, Input.insertText
 *   C. Submit and intercept the generation response, download media
 *
 * Returns the asset metadata. Throws on failure.
 */
export async function generateViaFlow(
  options: FlowGenerateOptions,
): Promise<FlowGenerateResult> {
  const {
    projectUrl,
    cdpEndpoint = "http://127.0.0.1:9222",
    characterName,
    mode,
    aspectRatio = "9:16",
    modelName = "Omni Flash",
    durationSeconds = 4,
    count = 1,
    prompt,
    artifactStorePath,
    channelId,
    runId,
    sceneId: _sceneId,
    sceneOrder,
  } = options;

  // Parse host and port from cdpEndpoint.
  // When running inside Docker, 127.0.0.1/localhost refers to the container,
  // not the host where Chrome is running. Rewrite to host.docker.internal.
  // The FLOW_CDP_HOST env var can override this (e.g. for custom Docker setups).
  // FLOW_CDP_PORT can override the port (e.g. a socat forwarder on a different port).
  const endpointStr = cdpEndpoint.replace(/^https?:\/\//, "");
  const [rawHost, portStr] = endpointStr.split(":");
  const port = Number(process.env.FLOW_CDP_PORT ?? portStr ?? "9222");

  // Determine the CDP host: env override > Docker rewrite > channel config
  const flowCdpHostOverride = process.env.FLOW_CDP_HOST;
  const isDocker = process.env.RUNNING_IN_DOCKER === "true" || existsSync("/.dockerenv");
  let cdpHost = rawHost;
  if (flowCdpHostOverride) {
    cdpHost = flowCdpHostOverride;
  } else if (isDocker && (rawHost === "127.0.0.1" || rawHost === "localhost")) {
    // Chrome's CDP rejects Host headers that aren't IP addresses or localhost.
    // host.docker.internal is a hostname, so resolve it to an IP before connecting.
    try {
      const { lookup } = await import("node:dns/promises");
      const result = await lookup("host.docker.internal");
      cdpHost = result.address;
    } catch {
      // DNS lookup failed — fall back to the hostname (might work in some setups)
      cdpHost = "host.docker.internal";
    }
  }

  // Dynamic import of chrome-remote-interface (optional dependency)
  let CDP: any;
  try {
    const mod = await import("chrome-remote-interface");
    CDP = mod.default ?? mod;
  } catch {
    throw new Error(
      "chrome-remote-interface is not installed. Run: bun add chrome-remote-interface",
    );
  }

  // === Stage A: Connect to CDP and find/create a tab on the project URL ===
  console.log(`[FlowAdapter] Connecting to CDP at ${cdpHost}:${port} (raw: ${rawHost}, docker: ${isDocker})`);
  const targets: any[] = await CDP.List({ port, host: cdpHost });

  // Prefer a tab already on this project URL
  let target = targets.find(
    (t) => t.type === "page" && t.url?.includes(projectUrl),
  );

  if (!target) {
    // Check if any Flow tab is open and navigate it
    target = targets.find(
      (t) => t.type === "page" && FLOW_URL_PATTERN.test(t.url || ""),
    );
    if (target) {
      console.log(`[FlowAdapter] Navigating existing Flow tab to project URL ...`);
      const navClient = await CDP({ target: target.id, port, host: cdpHost });
      await navClient.Page.enable();
      await navClient.Page.navigate({ url: projectUrl });
      await sleep(6000);
      await navClient.close();
    } else {
      // No Flow tab open — create one
      console.log(`[FlowAdapter] Creating new tab at project URL ...`);
      target = await CDP.New({ port, host: cdpHost, url: projectUrl });
      await sleep(8000);
    }
  } else {
    console.log(`[FlowAdapter] Found tab already on project URL.`);
  }

  // Attach to the target
  const client = await CDP({ target: target.id, port, host: cdpHost });

  try {
    const { Page, Runtime, Network } = client;
    await Promise.all([Page.enable(), Runtime.enable(), Network.enable()]);

    // === Stage B: Wait for SPA to render and verify logged in ===
    console.log(`[FlowAdapter] Stage B: waiting for SPA to render ...`);
    await sleep(3000);

    const state = await evalJS(client, `(() => {
      const hasSignInBtn = !!document.querySelector('button[aria-label*="Sign in" i], a[href*="accounts.google.com"]');
      const textareas = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')).length;
      return JSON.stringify({ hasSignInBtn, textareaCount: textareas, url: location.href });
    })()`);

    if (state?.hasSignInBtn) {
      throw new Error("FlowAdapter: not logged in to Google Flow. Run ./scripts/flow-chrome.sh login first.");
    }
    console.log(`[FlowAdapter] Stage B: logged in. textareas=${state?.textareaCount ?? 0}`);

    // === Stage D: Select character (if specified) ===
    if (characterName) {
      console.log(`[FlowAdapter] Stage D: selecting character "${characterName}" ...`);
      await stageD_selectCharacter(client, characterName);
    }

    // === Stage E: Configure settings ===
    console.log(`[FlowAdapter] Stage E: configuring settings — mode=${mode}, aspect=${aspectRatio}, model=${modelName}, duration=${durationSeconds}s, count=${count}x ...`);
    await stageE_configureSettings(client, mode, aspectRatio, modelName, durationSeconds, count);

    // === Stage F: Type the prompt ===
    console.log(`[FlowAdapter] Stage F: typing prompt (${prompt.length} chars) ...`);
    await stageF_typePrompt(client, prompt);

    // === Stage C: Submit and intercept response ===
    console.log(`[FlowAdapter] Stage C: submitting and waiting for generation ...`);
    const mediaUrl = await stageC_submitAndIntercept(client);

    // Download the media
    console.log(`[FlowAdapter] Downloading media from ${mediaUrl.slice(0, 80)} ...`);
    const mediaBuffer = await downloadMedia(mediaUrl);
    const ext = mediaUrl.match(/\.(png|jpe?g|webp|mp4|mov)/i)?.[1]?.toLowerCase() ?? (mode === "video" ? "mp4" : "png");
    const mimeType = ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime" : `image/${ext === "jpg" ? "jpeg" : ext}`;

    // Save to artifact store
    const dir = join(artifactStorePath, "channels", channelId, "runs", runId, "flow-generated");
    await mkdir(dir, { recursive: true });
    const fileName = `scene-${String(sceneOrder).padStart(2, "0")}.${ext}`;
    const filePath = join(dir, fileName);
    await writeFile(filePath, mediaBuffer);

    const checksum = sha256(mediaBuffer);
    const assetId = uuid();

    console.log(`[FlowAdapter] Done — ${mediaBuffer.length} bytes saved to ${filePath}`);

    return {
      assetId,
      filePath,
      mediaType: mode === "video" ? "video-clip" : "image",
      mimeType,
      width: 0, // Flow doesn't report dimensions in the response; video-service can probe
      height: 0,
      checksum,
      provider: "flow",
      model: modelName,
      costUsd: 0, // D020: Flow uses subscription credits
    };
  } finally {
    await client.close();
  }
}

// ============================================================================
// CDP interaction helpers (ported from S15 spike)
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Evaluate JS in the page and return parsed value.
 * Handles both JSON strings and already-parsed objects (CDP returnByValue quirk).
 */
async function evalJS(client: any, expression: string): Promise<any> {
  const { Runtime } = client;
  const res = await Runtime.evaluate({
    expression,
    returnByValue: true,
  });
  const value = res.result?.value ?? null;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

/**
 * Real mouse click at (x, y) via CDP Input domain (reCAPTCHA-friendly).
 * Includes mouseMoved before press — this is critical for reCAPTCHA to accept
 * the click as human-like. Ported exactly from S15 spike.
 */
async function realClick(client: any, x: number, y: number): Promise<void> {
  const { Input } = client;
  await Input.dispatchMouseEvent({ type: "mouseMoved", x, y });
  await sleep(150);
  await Input.dispatchMouseEvent({ type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await Input.dispatchMouseEvent({ type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(200);
}

/**
 * Type text via CDP Input.insertText (real keyboard input, bulk).
 * This is what the S15 spike uses — much more reliable than per-character
 * dispatchKeyEvent for React-controlled inputs.
 */
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

// ============================================================================
// Stage D — Select character via Add button near prompt box (S15 spike port)
// ============================================================================

/**
 * Find the Add button that is specifically next to the prompt box.
 * Locates the prompt textbox first, then finds the closest button labeled
 * "+" or "Add" within a reasonable distance (same row / adjacent).
 * Ported from S15 spike findAddButtonNearPrompt().
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
 * Select a character from the bottom modal:
 *   1. The modal is already open with a focused search box.
 *   2. Type the character name via Input.insertText.
 *   3. Wait for the results list to render.
 *   4. Click the character result — NOT generated media (images/videos).
 *
 * IMPORTANT: The search results include both characters AND previously
 * generated images/videos for that character. We must ONLY select the
 * character entry. Character entries have the word "Character" as a
 * subtitle/label below the character name. Generated media entries have
 * labels like "Image", "Video", "Clip", etc.
 *
 * Ported from S15 spike selectCharacterFromModal() with the character-only
 * filtering added per D021 field testing.
 */
async function selectCharacterFromModal(client: any, name: string): Promise<boolean> {
  const { Runtime, Input } = client;

  // The search box should already be focused when the modal opens.
  // Type the character name via real keyboard input.
  console.log(`[FlowAdapter]   typing "${name}" in search box ...`);
  await Input.insertText({ text: name });
  await sleep(1500); // wait for results to render

  // Find the CHARACTER result item (not generated media).
  // The search results contain both characters and previously generated
  // images/videos for that character. Character entries have "Character"
  // text somewhere in their label/subtitle. We filter for that.
  //
  // We return the element's bounding box AND a JS expression that can
  // re-find and click it directly (as a fallback if CDP mouse click fails).
  //
  // 3-pass search strategy from S15 spike, with character-only filtering:
  //   Pass 1: structured list items containing name AND "Character"
  //   Pass 2: clickable elements containing name AND "Character"
  //   Pass 3: leaf text nodes containing name, walk up to ancestor, check ancestor text for "Character"
  const result = await Runtime.evaluate({
    expression: `(() => {
      const name = ${JSON.stringify(name)};
      const nameLower = name.toLowerCase();

      // Helper: check if an element's text contains the character name
      // AND has "Character" as a type label (not "Image", "Video", etc.).
      function isCharacterItem(el) {
        const text = (el.innerText || '').trim();
        if (!text.toLowerCase().includes(nameLower)) return false;
        // Must contain "Character" as a type indicator.
        if (!/\\bcharacter\\b/i.test(text)) return false;
        return true;
      }

      // Helper: build result object with click coordinates.
      // Finds the best click target within the element — the element itself
      // if it's a button/role=button, or the nearest clickable child.
      function buildResult(el, via) {
        const r = el.getBoundingClientRect();
        const label = (el.innerText || '').trim().slice(0, 80);
        // Try to find the most specific clickable child to click on.
        // Flow result items are often divs with click handlers on a child
        // button or the item itself. We want to click on the actual
        // interactive element, not a container that wraps it.
        const clickTarget = el.matches('button, [role="button"], [tabindex]')
          ? el
          : el.querySelector('button, [role="button"], [tabindex]');
        const target = clickTarget || el;
        const tr = target.getBoundingClientRect();
        return JSON.stringify({
          ok: true,
          label,
          x: tr.x + tr.width / 2,
          y: tr.y + tr.height / 2,
          w: tr.width,
          h: tr.height,
          via,
          // Also return the container's center as a fallback
          containerX: r.x + r.width / 2,
          containerY: r.y + r.height / 2,
        });
      }

      // First pass: structured list items containing the name AND "Character".
      const selectors = [
        '[role="option"]', '[role="listitem"]', '[role="gridcell"]',
        'li', '[data-testid*="result"]', '[data-testid*="item"]',
        '[data-testid*="character"]',
      ];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          if (isCharacterItem(el)) {
            return buildResult(el, sel);
          }
        }
      }

      // Second pass: any clickable element containing the name AND "Character",
      // that is NOT the search box itself.
      const clickables = Array.from(document.querySelectorAll('button, [role="button"], [tabindex], div[class*="item"], div[class*="card"], div[class*="result"]'));
      for (const el of clickables) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true') continue;
        if (isCharacterItem(el) && (el.innerText || '').trim().length < 200) {
          return buildResult(el, 'clickable-scan');
        }
      }

      // Third pass: any visible element containing the name (leaf text nodes),
      // then click its nearest clickable ancestor — but only if the ancestor's
      // text contains "Character".
      const allEls = Array.from(document.querySelectorAll('*'));
      for (const el of allEls) {
        if (el.children.length > 0) continue;
        const text = (el.innerText || el.textContent || '').trim();
        if (!text.toLowerCase().includes(nameLower) || text.length >= 100) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        // Find nearest clickable ancestor.
        let ancestor = el.parentElement;
        while (ancestor && !ancestor.matches('button, [role="button"], [role="option"], [tabindex]')) {
          ancestor = ancestor.parentElement;
        }
        if (ancestor && isCharacterItem(ancestor)) {
          return buildResult(ancestor, 'ancestor');
        }
      }

      return JSON.stringify({ ok: false });
    })()`,
    returnByValue: true,
  });
  const found = JSON.parse(result.result?.value ?? '{"ok":false}');

  if (!found.ok) {
    console.log(`[FlowAdapter]   could not find character "${name}" (with "Character" label) in search results`);
    // Dump all visible text in the modal for debugging
    const debugText = await evalJS(client, `(() => {
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
      return JSON.stringify(results.slice(0, 50));
    })()`);
    console.log(`[FlowAdapter]   debug — visible text in modal:`, JSON.stringify(debugText?.slice(0, 20)));
    return false;
  }

  console.log(`[FlowAdapter]   found character "${found.label}" via ${found.via} at (${Math.round(found.x)}, ${Math.round(found.y)}) — clicking ...`);

  // Try CDP mouse click first (reCAPTCHA-friendly)
  await realClick(client, found.x, found.y);
  await sleep(1000);

  // Verify the character was actually selected — check if the modal closed
  // or if the character appeared in the prompt area. If not, try a JS click
  // as a fallback (some Flow UI elements need a DOM click event, not CDP).
  const verified = await evalJS(client, `(() => {
    // Check if the modal is still open (search box still visible)
    const searchBox = document.querySelector('input[type="text"], input[type="search"], [contenteditable="true"]');
    const modalOpen = searchBox && searchBox.getBoundingClientRect().width > 0;
    return JSON.stringify({ modalOpen });
  })()`);

  if (verified?.modalOpen) {
    // Modal still open — the CDP click didn't register. Try JS click fallback.
    console.log(`[FlowAdapter]   CDP click didn't close modal — trying JS click fallback ...`);

    // Re-find the character item and dispatch a click event directly via JS.
    // This is less reCAPTCHA-friendly but more reliable for Flow's React components.
    const jsClickResult = await evalJS(client, `(() => {
      const name = ${JSON.stringify(name)};
      const nameLower = name.toLowerCase();

      function isCharacterItem(el) {
        const text = (el.innerText || '').trim();
        if (!text.toLowerCase().includes(nameLower)) return false;
        if (!/\\bcharacter\\b/i.test(text)) return false;
        return true;
      }

      // Find the character item again
      const selectors = [
        '[role="option"]', '[role="listitem"]', '[role="gridcell"]',
        'li', '[data-testid*="result"]', '[data-testid*="item"]',
        '[data-testid*="character"]',
        'button', '[role="button"]', '[tabindex]',
        'div[class*="item"]', 'div[class*="card"]', 'div[class*="result"]',
      ];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') continue;
          if (isCharacterItem(el)) {
            // Dispatch full click event sequence on the element
            const rect = el.getBoundingClientRect();
            const x = rect.x + rect.width / 2;
            const y = rect.y + rect.height / 2;
            const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
            el.dispatchEvent(new PointerEvent('pointerdown', opts));
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new PointerEvent('pointerup', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));
            return JSON.stringify({ ok: true, label: el.innerText.trim().slice(0, 80), x, y });
          }
        }
      }
      return JSON.stringify({ ok: false });
    })()`);

    if (jsClickResult?.ok) {
      console.log(`[FlowAdapter]   JS click dispatched on "${jsClickResult.label}" at (${Math.round(jsClickResult.x)}, ${Math.round(jsClickResult.y)})`);
    } else {
      // Last resort: try clicking the container center with CDP
      console.log(`[FlowAdapter]   JS click failed — trying container center (${Math.round(found.containerX)}, ${Math.round(found.containerY)}) ...`);
      await realClick(client, found.containerX, found.containerY);
    }
    await sleep(1500);
  }

  console.log(`[FlowAdapter]   character "${name}" selection done.`);
  return true;
}

/**
 * Stage D: Select a character via the Add button near the prompt box.
 * Ported from S15 spike stageD_selectCharacter().
 */
async function stageD_selectCharacter(client: any, characterName: string): Promise<void> {
  // Support multiple characters via comma-separated names
  const characters = characterName.split(",").map((c) => c.trim()).filter(Boolean);
  const selectedChars: string[] = [];

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i]!;
    console.log(`[FlowAdapter]   [${i + 1}/${characters.length}] selecting "${char}" ...`);

    // 1. Find and click the Add button next to the prompt box.
    const addBtn = await findAddButtonNearPrompt(client);
    if (!addBtn.ok) {
      console.log(`[FlowAdapter]   Add button not found near prompt — skipping "${char}"`);
      continue;
    }
    console.log(`[FlowAdapter]   Add button found: "${addBtn.label}" at (${Math.round(addBtn.x!)}, ${Math.round(addBtn.y!)}) — clicking ...`);
    await realClick(client, addBtn.x!, addBtn.y!);
    await sleep(2000); // wait for modal to open

    // 2. The modal is open with a focused search box. Type the character name.
    const selected = await selectCharacterFromModal(client, char);
    if (selected) {
      selectedChars.push(char);
      console.log(`[FlowAdapter]   PASS — "${char}" selected.`);
    } else {
      console.log(`[FlowAdapter]   FAIL — could not select "${char}".`);
    }

    // 3. Close the modal — press Escape.
    await pressKey(client, "Escape", "Escape", 27);
    await sleep(800);
  }

  if (selectedChars.length > 0) {
    console.log(`[FlowAdapter] Stage D: PASS — ${selectedChars.length} character(s) selected: ${selectedChars.join(", ")}`);
  } else {
    console.log(`[FlowAdapter] Stage D: WARNING — no characters selected. Generation will proceed without character.`);
  }
}

// ============================================================================
// Stage E — Configure generation settings (S15 spike port)
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
 *
 * Ported from S15 spike findSettingsButton().
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
    console.log(`[FlowAdapter]   settings button candidates: ${(result.allCandidates ?? []).map((c: any) => `"${c.label}"(${c.score})`).join(", ")}`);
  }
  return result;
}

/**
 * Click an option inside the settings dialog by text match.
 * Flow's dialog options are <div>/<button> elements with icon+label text
 * like "videocam\nVideo". We match against ANY individual line of the text,
 * not the full concatenated label. We SKIP container elements (those with
 * clickable children or very long text) and prefer leaf buttons.
 *
 * Ported from S15 spike clickDialogOption().
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
    console.log(`[FlowAdapter]   E: could not find "${label}" option`);
    return false;
  }
  console.log(`[FlowAdapter]   E: clicking "${found.matchingLine}" (exact=${found.exactMatch}, container=${found.isContainer}) at (${Math.round(found.x)}, ${Math.round(found.y)}) ...`);
  if (found.allMatches) {
    console.log(`[FlowAdapter]   E: all matches: ${found.allMatches.map((m: any) => `"${m.line}"(exact=${m.exact},container=${m.container})`).join(", ")}`);
  }
  await realClick(client, found.x, found.y);
  await sleep(600);
  return true;
}

/**
 * Select an option from a <select> dropdown (native HTML select) inside the
 * dialog. Used for the model selector which may be a native <select>.
 * Ported from S15 spike selectDropdownOption().
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
    console.log(`[FlowAdapter]   E: selecting "${selectInfo.optionText}" from dropdown ...`);
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
  console.log(`[FlowAdapter]   E: no native <select> with "${label}" — trying custom dropdown ...`);
  const triggerResult = await clickDialogOption(client, /model|veo|omni|nano|imagen|select|choose/i, "model-trigger");
  if (triggerResult) {
    await sleep(800);
    // Now the dropdown is open — click the option.
    return clickDialogOption(client, optionPattern, label);
  }

  // Last resort: just try clicking the model name directly.
  console.log(`[FlowAdapter]   E: trying direct click on "${label}" ...`);
  return clickDialogOption(client, optionPattern, label);
}

/**
 * Stage E: Configure generation settings via the settings dialog.
 *
 * Steps (ported from S15 spike stageE_configureSettings):
 *   E.0 — Find and click the settings button (between Agent and Submit)
 *   E.1 — Click mode (Video/Image) — MUST be first, reveals video-only rows
 *   E.2 — Click "Ingredients" (Frames/Ingredients toggle) — video mode only
 *   E.3 — Click aspect ratio (e.g. "9:16")
 *   E.4 — Select model (two-step: click dropdown trigger, then click model name)
 *   E.5 — Click duration (e.g. "4s") — video mode only
 *   E.6 — Click count (e.g. "x1") — note: x BEFORE number in Flow UI
 *   Close dialog with Escape
 */
async function stageE_configureSettings(
  client: any,
  mode: string,
  aspectRatio: string,
  modelName: string,
  durationSeconds: number,
  count: number,
): Promise<void> {
  const results: Record<string, boolean> = {};

  // E.0 — Find and click the settings button (between Agent and Submit).
  console.log(`[FlowAdapter]   E.0: finding settings button near prompt box ...`);
  const settingsBtn = await findSettingsButton(client);
  if (!settingsBtn.ok) {
    console.log(`[FlowAdapter]   E.0: FAIL — settings button not found.`);
    throw new Error("FlowAdapter: settings button not found near prompt box");
  }
  console.log(`[FlowAdapter]   E.0: settings button found: "${settingsBtn.label}" at (${Math.round(settingsBtn.x!)}, ${Math.round(settingsBtn.y!)}) — clicking ...`);
  await realClick(client, settingsBtn.x!, settingsBtn.y!);
  await sleep(2000); // wait for dialog to open

  // E.1 — Row 1: Click "Video" (Image / Video toggle).
  // IMPORTANT: This must be done FIRST because selecting Video mode reveals
  // additional rows (Ingredients/Frames, duration buttons) that don't exist
  // in Image mode.
  console.log(`[FlowAdapter]   E.1: clicking "${mode}" (Image/Video toggle) ...`);
  results.modeSet = await clickDialogOption(client, new RegExp(`^${mode}$`, "i"), mode);
  if (results.modeSet) console.log(`[FlowAdapter]   E.1: PASS — mode set to "${mode}".`);
  else console.log(`[FlowAdapter]   E.1: FAIL — could not set mode.`);
  // Wait for Video-mode-specific UI elements to appear.
  await sleep(1500);

  // E.2 — Row 2: Click "Ingredients" (Frames / Ingredients toggle).
  // This row only appears in Video mode.
  if (mode === "video") {
    console.log(`[FlowAdapter]   E.2: clicking "Ingredients" (Frames/Ingredients toggle) ...`);
    results.ingredientsSet = await clickDialogOption(client, /^ingredients$/i, "Ingredients");
    if (results.ingredientsSet) console.log(`[FlowAdapter]   E.2: PASS — Ingredients selected.`);
    else console.log(`[FlowAdapter]   E.2: FAIL — could not select Ingredients.`);
    await sleep(800);
  }

  // E.3 — Aspect ratio: Click "9:16".
  console.log(`[FlowAdapter]   E.3: clicking "${aspectRatio}" (aspect ratio toggle) ...`);
  const aspectPattern = new RegExp(aspectRatio.replace(":", "\\s*:\\s*"), "i");
  results.aspectSet = await clickDialogOption(client, aspectPattern, aspectRatio);
  if (results.aspectSet) console.log(`[FlowAdapter]   E.3: PASS — aspect set to "${aspectRatio}".`);
  else console.log(`[FlowAdapter]   E.3: FAIL — could not set aspect.`);
  await sleep(600);

  // E.4 — Model selection: click the model dropdown trigger, then select.
  // The model selector is a custom button showing the current model name
  // (e.g. "🍌 Nano Banana 2 Lite\narrow_drop_down"). Click it to open a
  // dropdown list, then click "Omni Flash" in that list.
  console.log(`[FlowAdapter]   E.4: selecting model "${modelName}" ...`);
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
  if (results.modelSet) console.log(`[FlowAdapter]   E.4: PASS — model set to "${modelName}".`);
  else console.log(`[FlowAdapter]   E.4: FAIL — could not set model.`);
  await sleep(600);

  // E.5 — Duration: click "4s" (first of 4 duration buttons).
  // Duration buttons only appear in Video mode.
  if (mode === "video") {
    console.log(`[FlowAdapter]   E.5: clicking "${durationSeconds}s" (duration button) ...`);
    results.durationSet = await clickDialogOption(client, new RegExp(`${durationSeconds}\\s*s`, "i"), `${durationSeconds}s`);
    if (results.durationSet) console.log(`[FlowAdapter]   E.5: PASS — duration set to ${durationSeconds}s.`);
    else console.log(`[FlowAdapter]   E.5: FAIL — could not set duration.`);
    await sleep(600);
  }

  // E.6 — Generation count: click "x1" (first count button).
  // Flow labels these as "x1", "x2", "x3", "x4" (x BEFORE the number).
  console.log(`[FlowAdapter]   E.6: clicking "x${count}" (generation count) ...`);
  results.countSet = await clickDialogOption(client, new RegExp(`x\\s*${count}`, "i"), `x${count}`);
  if (results.countSet) console.log(`[FlowAdapter]   E.6: PASS — count set to x${count}.`);
  else console.log(`[FlowAdapter]   E.6: FAIL — could not set count.`);
  await sleep(600);

  // Close the dialog — press Escape.
  await pressKey(client, "Escape", "Escape", 27);
  await sleep(500);

  // Report results
  const failed = Object.entries(results).filter(([, v]) => v !== true).map(([k]) => k);
  if (failed.length > 0) {
    console.log(`[FlowAdapter] Stage E: PARTIAL — failed: ${failed.join(", ")}.`);
  } else {
    console.log(`[FlowAdapter] Stage E: PASS — all settings configured.`);
  }
}

// ============================================================================
// Stage F — Type prompt (S15 spike port)
// ============================================================================

/**
 * Focus the prompt textbox and type text into it via real keyboard input.
 * Ported from S15 spike typeIntoPrompt().
 *
 * Steps:
 *   1. Focus the textbox (with mouse events for React compatibility)
 *   2. Clear existing content (Ctrl+A, Backspace)
 *   3. Type the prompt via Input.insertText (bulk, reliable for React inputs)
 *   4. Verify text was entered
 */
async function stageF_typePrompt(client: any, text: string): Promise<void> {
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
  if (!focus?.ok) {
    throw new Error("FlowAdapter: could not find/focus prompt textbox");
  }
  await sleep(400);

  // Clear existing content: Ctrl+A, Backspace.
  await pressKey(client, "a", "KeyA", 65, 2);
  await pressKey(client, "Backspace", "Backspace", 8);
  await sleep(150);

  // Type the prompt via Input.insertText (bulk — much more reliable than
  // per-character dispatchKeyEvent for React-controlled inputs).
  await Input.insertText({ text });
  console.log(`[FlowAdapter]   typed prompt via Input.insertText (${text.length} chars)`);
  await sleep(600);

  // Verify.
  const verify = await evalJS(client, `(() => {
    const el = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
    if (!el) return JSON.stringify({ ok: false, length: 0 });
    const val = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.innerText;
    return JSON.stringify({ ok: true, length: (val || '').length, preview: (val || '').slice(0, 100) });
  })()`);

  if (!verify?.ok || verify.length === 0) {
    throw new Error(`FlowAdapter: prompt text entry failed (length=${verify?.length ?? 0})`);
  }
  console.log(`[FlowAdapter] Stage F: PASS — prompt typed. length=${verify.length}, preview="${verify.preview.slice(0, 60)}..."`);
}

// ============================================================================
// Stage C — Submit + intercept + download (S15 spike port)
// ============================================================================

/**
 * Set up a network interceptor that watches for aisandbox-pa.googleapis.com
 * generation responses, click the Generate button, wait for the response,
 * extract the media URL from the response body, and return it.
 *
 * Ported from S15 spike makeInterceptor() + stageC_submit().
 */
async function stageC_submitAndIntercept(client: any): Promise<string> {
  const { Network } = client;

  // Track generation responses
  const generations: Array<{ requestId: string; url: string; status: number }> = [];
  const seen: Array<{ requestId: string; url: string; status: number }> = [];

  Network.responseReceived((params: any) => {
    const url: string = params.response?.url ?? "";
    if (url.includes(AISANDBOX_HOST)) {
      seen.push({
        requestId: params.requestId,
        url,
        status: params.response?.status ?? 0,
      });
      if (/:(generate|batchAsyncGenerate)/i.test(url)) {
        generations.push({ requestId: params.requestId, url, status: params.response?.status ?? 0 });
        console.log(`[FlowAdapter]   >> generation response: ${params.response?.status} ${url.slice(0, 90)}`);
      }
    }
  });

  // Find and click the Generate button — exclude add/upload/reference buttons.
  // Ported from S15 spike stageC_submit button detection logic.
  const buttons = await evalJS(client, `(() => {
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

  const candidates = (buttons ?? []).filter(
    (b: any) => !b.disabled && !b.hasAdd && (b.hasGen || (!b.iconOnly && b.w > 80)),
  );
  if (candidates.length === 0) {
    throw new Error("FlowAdapter: no Generate button found on the page");
  }
  // Prefer buttons with gen text
  candidates.sort((a: any, b: any) => (b.hasGen ? 1 : 0) - (a.hasGen ? 1 : 0));
  const pick = candidates[0];
  console.log(`[FlowAdapter]   clicking "${pick.label}" at (${Math.round(pick.x)}, ${Math.round(pick.y)}) ...`);
  await realClick(client, pick.x, pick.y);

  // Wait for generation response (poll every 3s, timeout 180s)
  console.log(`[FlowAdapter]   waiting for generation response (up to 180s) ...`);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await sleep(3000);
    if (generations.length > 0) break;
  }

  if (generations.length === 0) {
    throw new Error(`FlowAdapter: no generation response received (saw ${seen.length} aisandbox calls). Timeout after 180s.`);
  }

  const gen = generations[0]!;
  console.log(`[FlowAdapter]   generation response: HTTP ${gen.status}`);

  if (gen.status >= 400) {
    throw new Error(`FlowAdapter: generation returned HTTP ${gen.status}`);
  }

  // Get the response body and extract media URL
  let body: string | null = null;
  try {
    const r: any = await client.Network.getResponseBody({ requestId: gen.requestId });
    body = r.body ?? null;
  } catch {
    // Response body may not be available if the response was too large or already consumed
  }

  if (!body) {
    throw new Error("FlowAdapter: could not retrieve generation response body");
  }

  const mediaUrlMatch = body.match(MEDIA_URL_REGEX);
  const mediaUrl = mediaUrlMatch?.[1] ?? null;

  if (!mediaUrl) {
    // Log first 500 chars of body for debugging
    console.log(`[FlowAdapter]   response body (first 500 chars): ${body.slice(0, 500)}`);
    throw new Error("FlowAdapter: could not extract media URL from generation response body");
  }

  console.log(`[FlowAdapter]   media URL extracted: ${mediaUrl.slice(0, 80)} ...`);
  return mediaUrl;
}

// === Download media ===

async function downloadMedia(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FlowAdapter: failed to download media (${response.status} ${response.statusText})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
