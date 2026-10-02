#!/usr/bin/env node
/**
 * Builds the static GitHub Pages demo in demo/ from the real EJS views.
 *
 * Every page is rendered with the same locals Express passes to res.render(), so the markup is
 * what the running app sends. Markup that depends on the session (login form, header icon,
 * username) or on a controller message (error / result toasts) is located by diffing the renders
 * of each state. Each such region is emitted as a tiny parse-time "slot" script that
 * document.write()s the variant for the visitor's current state, which leaves the DOM identical
 * to what the server would have rendered. A self-check against fresh EJS renders, with
 * placeholder and with real values, fails the build whenever a template change would break that.
 *
 *   npm run demo:build   regenerate demo/ (commit the result)
 *   npm run demo:serve   regenerate, then preview at http://localhost:4173/flower-store-/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ejs from 'ejs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VIEWS_DIR = path.join(ROOT, 'views');
const PUBLIC_DIR = path.join(ROOT, 'public');
const RUNTIME_FILE = path.join(ROOT, 'scripts/demo/runtime.js');
const VALIDATOR_FILE = path.join(ROOT, 'node_modules/validator/validator.min.js');
const CONTROLLER_FILE = path.join(ROOT, 'controllers/pageController.js');
const ROUTES_FILE = path.join(ROOT, 'routs/pageRoute.js');
export const OUT_DIR = path.join(ROOT, 'demo');

/** GitHub Pages serves this project site under https://<owner>.github.io/<repo>/. */
export const BASE_PATH = '/flower-store-/';
const REPO_URL = 'https://github.com/Hadilberavi/flower-store-';

/** One entry per GET route in routs/pageRoute.js, with the locals its controller passes. */
export const PAGES = [
  // POST /login and POST /register also render "index", with an `error` message.
  { route: '/', view: 'index', file: 'index.html', locals: { link: 'index' }, flash: 'error' },
  { route: '/shop', view: 'shop', file: 'shop.html', locals: { link: 'shop' } },
  { route: '/about', view: 'about', file: 'about.html', locals: { link: 'about' } },
  { route: '/review', view: 'review', file: 'review.html', locals: { link: 'review' } },
  { route: '/blog', view: 'blog', file: 'blog.html', locals: { link: 'blog' } },
  // POST /contact renders "contact" with a `result` message.
  { route: '/contact', view: 'contact', file: 'contact.html', locals: { link: 'contact', result: '' }, flash: 'result' },
  { route: '/Register', view: 'Register', file: 'Register.html', locals: { link: 'Register' } },
];

/** The POST routes of routs/pageRoute.js. scripts/demo/runtime.js handles these form submissions. */
const FORM_ACTIONS = ['/login', '/register', '/contact', '/logout'];

/** Placeholder values the runtime (scripts/demo/runtime.js) swaps for the real, escaped values. */
export const SENTINELS = { session: '__DEMO_USERNAME__', error: '__DEMO_ERROR__', result: '__DEMO_RESULT__' };
/** The local each state dimension sets. */
const LOCALS = { session: 'username', error: 'error', result: 'result' };
/** Real values the self-check also renders: usernames, and every message the controllers pass. */
const SAMPLES = {
  session: ['demo', 'alice123', `<b>"Tom" & 'Jerry'</b>`],
  error: ['Invalid username or password', 'Username already exists'],
  result: ['We Received your message', 'There was an error saving your message'],
};
/** The locals that switch each state dimension "on", with its placeholder value. */
export const DIMENSIONS = Object.fromEntries(Object.keys(SENTINELS).map((name) => [name, { [LOCALS[name]]: SENTINELS[name] }]));

const ASSET_PREFIXES = ['/images/', '/css/', '/js/'];
const ROUTE_FILES = new Map(PAGES.map((page) => [page.route.toLowerCase(), page.file]));
const EXTERNAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
const FOREIGN_ELEMENTS = new Set(['svg', 'math', 'template']);
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/** Attributes whose value is a URL; srcset holds a list of them. Any quoting style. */
const URL_ATTRIBUTE = /(\s)(href|src|poster|srcset)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
const ANY_ATTRIBUTE = /\s([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
const CSS_URL = /url\(\s*(['"]?)([^'")]*)\1\s*\)/g;
const SRCSET_URL = /(^|,)(\s*)([^\s,]+)/g;
/** U+2028 and U+2029 are valid in JSON but not in older JavaScript string literals. */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const LINE_SEPARATORS = new RegExp(`[${LINE_SEPARATOR}${String.fromCharCode(0x2029)}]`, 'g');

class BuildError extends Error {}
const fail = (message) => {
  throw new BuildError(message);
};

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

/** Renders a view exactly like res.render(): res.locals.username always exists (undefined when logged out). */
export function renderView(page, extraLocals = {}) {
  return ejs.renderFile(path.join(VIEWS_DIR, `${page.view}.ejs`), { username: undefined, ...page.locals, ...extraLocals });
}

// ---------------------------------------------------------------------------------------------
// URL rewriting: the Express app uses root-relative URLs, a Pages project site lives in a sub-path
// ---------------------------------------------------------------------------------------------

export function rewriteUrl(url) {
  if (!url.startsWith('/') || EXTERNAL_URL.test(url)) return url;
  const [, pathname, suffix] = /^([^?#]*)(.*)$/s.exec(url);
  // Express routing is case-insensitive and ignores a trailing slash.
  const route = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const file = ROUTE_FILES.get(route.toLowerCase());
  if (file) return file + suffix;
  if (ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return url.slice(1);
  return fail(`No static equivalent for the root-relative URL "${url}". Add the route to PAGES in scripts/demo/build.mjs.`);
}

const mapSrcset = (value, map) => value.replace(SRCSET_URL, (_, comma, space, url) => comma + space + map(url));

/** Rewrites URL attributes and CSS url()s. Form actions stay as they are: the runtime intercepts those forms. */
export function rewriteUrls(html) {
  return html
    .replace(URL_ATTRIBUTE, (_, space, name, equals, double, single, bare) => {
      const value = double ?? single ?? bare;
      const quote = double !== undefined ? '"' : single !== undefined ? "'" : '';
      const rewritten = name.toLowerCase() === 'srcset' ? mapSrcset(value, rewriteUrl) : rewriteUrl(value);
      return `${space}${name}${equals}${quote}${rewritten}${quote}`;
    })
    .replace(CSS_URL, (_, quote, url) => `url(${quote}${rewriteUrl(url.trim())}${quote})`);
}

/** Fails on any URL that still points at the root of the host, in any attribute, quoting style or url(). */
function assertNoRootRelativeUrls(html, where) {
  const isRootRelative = (url) => url.startsWith('/') && !url.startsWith('//');
  for (const match of html.matchAll(ANY_ATTRIBUTE)) {
    const name = match[1].toLowerCase();
    const value = (match[2] ?? match[3] ?? match[4]).trim();
    const urls = name === 'srcset' ? [...value.matchAll(SRCSET_URL)].map((candidate) => candidate[3]) : [value];
    for (const url of urls.filter(isRootRelative)) {
      if (name === 'action' && FORM_ACTIONS.includes(url.toLowerCase())) continue;
      fail(`${where}: ${name}="${url}" would point outside the GitHub Pages site. Handle it in rewriteUrls() in scripts/demo/build.mjs.`);
    }
  }
  for (const match of html.matchAll(CSS_URL)) {
    if (isRootRelative(match[2].trim())) fail(`${where}: url(${match[2]}) would point outside the GitHub Pages site.`);
  }
}

function collectReferences(html, into) {
  const urls = [];
  for (const match of html.matchAll(URL_ATTRIBUTE)) {
    const value = match[4] ?? match[5] ?? match[6];
    if (match[2].toLowerCase() === 'srcset') urls.push(...[...value.matchAll(SRCSET_URL)].map((candidate) => candidate[3]));
    else urls.push(value);
  }
  for (const match of html.matchAll(CSS_URL)) urls.push(match[2].trim());
  for (const url of urls) {
    if (!url || EXTERNAL_URL.test(url) || url.startsWith('data:')) continue;
    into.add(decodeURI(url.replace(/[?#].*$/s, '')));
  }
}

// ---------------------------------------------------------------------------------------------
// Finding the state-dependent regions of a page
// ---------------------------------------------------------------------------------------------

export const splitLines = (text) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Line diff (LCS). Returns hunks { start, end, lines }: replace a[start, end) with `lines` to turn a into b. */
function diffLines(a, b) {
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const hunks = [];
  let hunk = null;
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      if (hunk) hunks.push(hunk);
      hunk = null;
      i++;
      j++;
      continue;
    }
    hunk ??= { start: i, end: i, lines: [] };
    if (j < b.length && (i >= a.length || lcs[i * width + j + 1] >= lcs[(i + 1) * width + j])) {
      hunk.lines.push(b[j++]);
    } else {
      hunk.end = ++i;
    }
  }
  if (hunk) hunks.push(hunk);
  return hunks;
}

/**
 * Joins hunks separated only by a few blank lines. Diffs are ambiguous around blank lines, which
 * would otherwise split one inserted block (e.g. a toast and its trailing newline) into two slots.
 */
function mergeHunks(hunks, baseLines) {
  const merged = [];
  for (const hunk of hunks) {
    const previous = merged[merged.length - 1];
    const gap = previous ? baseLines.slice(previous.end, hunk.start) : [];
    if (previous && gap.length <= 3 && gap.every((line) => line.trim() === '')) {
      previous.lines.push(...gap, ...hunk.lines);
      previous.end = hunk.end;
    } else {
      merged.push({ ...hunk, lines: [...hunk.lines] });
    }
  }
  return merged;
}

/**
 * Marks the offsets of `html` where a <script> may be inserted without changing how the rest of the
 * document parses: inside <body>, between tags, outside comments, raw-text elements, <template> and
 * foreign (SVG / MathML) content.
 */
function safeInsertionPoints(html) {
  const safe = new Uint8Array(html.length + 1);
  let state = 'data';
  let quote = '';
  let tagStart = 0;
  let rawElement = '';
  let inBody = false;
  let foreignDepth = 0;
  for (let i = 0; i <= html.length; i++) {
    const ch = html[i];
    if (state === 'data') {
      safe[i] = inBody && foreignDepth === 0 ? 1 : 0;
      if (html.startsWith('<!--', i)) {
        state = 'comment';
        i += 3;
      } else if (ch === '<' && /[A-Za-z/!?]/.test(html[i + 1] ?? '')) {
        state = 'tag';
        tagStart = i;
        quote = '';
      }
    } else if (state === 'comment') {
      if (html.startsWith('-->', i)) {
        state = 'data';
        i += 2;
      }
    } else if (state === 'tag') {
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        const tag = html.slice(tagStart, i + 1);
        const [, slash = '', name = ''] = /^<\s*(\/?)\s*([A-Za-z][\w-]*)?/.exec(tag) ?? [];
        const tagName = name.toLowerCase();
        if (!slash && tagName === 'body') inBody = true;
        if (FOREIGN_ELEMENTS.has(tagName)) {
          if (slash) foreignDepth = Math.max(0, foreignDepth - 1);
          else if (!/\/\s*>$/.test(tag)) foreignDepth++;
        }
        state = !slash && RAW_TEXT_ELEMENTS.has(tagName) ? 'raw' : 'data';
        rawElement = tagName;
      }
    } else if (state === 'raw' && html.slice(i, i + rawElement.length + 2).toLowerCase() === `</${rawElement}`) {
      state = 'tag';
      tagStart = i;
      quote = '';
    }
  }
  return safe;
}

/**
 * Shrinks a region to the characters that actually differ between its two variants, then widens it
 * again to the nearest positions between tags. Keeps shared markup (e.g. a closing </header> on the
 * same line as the login form) outside the region.
 */
function tighten(base, safe, { dimension, start, end, on }, file) {
  const off = base.slice(start, end);
  let prefix = 0;
  while (prefix < off.length && prefix < on.length && off[prefix] === on[prefix]) prefix++;
  let suffix = 0;
  while (suffix < off.length - prefix && suffix < on.length - prefix && off[off.length - 1 - suffix] === on[on.length - 1 - suffix]) suffix++;
  while (prefix > 0 && !safe[start + prefix]) prefix--;
  while (suffix > 0 && !safe[end - suffix]) suffix--;
  if (!safe[start + prefix] || !safe[end - suffix]) {
    fail(`${file}: the ${dimension} region at offset ${start} does not start and end between tags inside <body>.`);
  }
  return { dimension, start: start + prefix, end: end - suffix, off: off.slice(prefix, off.length - suffix), on: on.slice(prefix, on.length - suffix) };
}

/** True when every element opened in `fragment` is also closed in it (so it can stand alone in <noscript>). */
function isSelfContained(fragment) {
  const stack = [];
  for (const [tag, slash, name] of fragment.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([A-Za-z][\w-]*)\b[^>]*>/g)) {
    const tagName = name.toLowerCase();
    if (VOID_ELEMENTS.has(tagName) || tag.endsWith('/>')) continue;
    if (!slash) stack.push(tagName);
    else if (stack.pop() !== tagName) return false;
  }
  return stack.length === 0;
}

/** Substitutes state values into a slot variant, escaped like EJS <%= %>. */
function fill(text, values) {
  for (const [dimension, value] of Object.entries(values)) text = text.split(SENTINELS[dimension]).join(ejs.escapeXML(value));
  return text;
}

/** What the runtime produces for a visitor whose state is `values` ({ session: 'demo', error: '...' }). */
function reconstruct(base, slots, values) {
  let html = '';
  let cursor = 0;
  for (const slot of slots) {
    html += base.slice(cursor, slot.start) + fill(slot.dimension in values ? slot.on : slot.off, values);
    cursor = slot.end;
  }
  return html + base.slice(cursor);
}

const subsets = (items) => items.reduce((all, item) => all.concat(all.map((set) => [...set, item])), [[]]);
const combinations = (choices) =>
  choices.reduce((all, [dimension, options]) => all.flatMap((combo) => options.map((value) => ({ ...combo, [dimension]: value }))), [{}]);
const describe = (values) =>
  Object.entries(values).map(([dimension, value]) => `${LOCALS[dimension]}=${JSON.stringify(value)}`).join(', ') || 'a logged-out visitor';

// ---------------------------------------------------------------------------------------------
// Page generation
// ---------------------------------------------------------------------------------------------

function slotMarkup(dimension, off, on) {
  if (off.includes('</noscript')) fail(`A ${dimension} region contains </noscript>, which the demo cannot embed.`);
  const variants = JSON.stringify({ off, on })
    .replace(/</g, '\\u003c')
    .replace(LINE_SEPARATORS, (character) => (character === LINE_SEPARATOR ? '\\u2028' : '\\u2029'));
  // <noscript> keeps the logged-out markup for visitors without JavaScript; the inline fallback
  // writes it if js/demo.js failed to load. With the runtime loaded, slot() removes the <noscript>.
  const noscript = off.trim() ? `<noscript data-demo-slot>${off}</noscript>` : '';
  return `${noscript}<script data-demo-slot>(window.FlowerDemo||{slot:function(d,v){document.write(v.off)}}).slot(${JSON.stringify(dimension)},${variants})</script>`;
}

const DEMO_BADGE =
  '<div class="ftdemo-badge" data-demo-badge role="note" aria-label="Demo notice">' +
  '<style>' +
  '.ftdemo-badge{position:fixed;left:12px;bottom:12px;z-index:1001;display:flex;align-items:center;gap:8px;' +
  'max-width:calc(100vw - 100px);padding:7px 8px 7px 12px;border-radius:14px;background:#fff;color:#222;' +
  'border:1px solid rgba(231,36,99,.35);box-shadow:0 6px 20px rgba(0,0,0,.15);' +
  'font:500 12px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-transform:none;letter-spacing:0}' +
  '.ftdemo-badge *{text-transform:none}' +
  '.ftdemo-badge strong{color:#e72463;font-weight:700}' +
  '.ftdemo-badge code{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#222;background:#fdf0f4;padding:2px 5px;border-radius:5px;white-space:nowrap}' +
  '.ftdemo-badge a{color:#e72463;font-weight:600;text-decoration:underline}' +
  '.ftdemo-badge__close{flex:none;border:0;background:transparent;color:#666;font-size:18px;line-height:1;padding:0 4px;cursor:pointer}' +
  '.ftdemo-badge__close:hover{color:#e72463}' +
  'html.ftdemo-badge-hidden .ftdemo-badge{display:none}' +
  '</style>' +
  '<span><strong>Static demo</strong> · data stays in your browser · log in with <code>demo@example.com</code> / <code>demo1234</code> · ' +
  `<a href="${REPO_URL}" target="_blank" rel="noopener">source</a></span>` +
  '<button type="button" class="ftdemo-badge__close" data-demo-badge-close aria-label="Hide demo notice" title="Hide">&times;</button>' +
  '</div>';

/** Inserts `addition` right before the only occurrence of `marker`. */
function insertBefore(html, marker, addition, file) {
  const at = html.indexOf(marker);
  if (at < 0 || html.indexOf(marker, at + 1) >= 0) fail(`${file}: expected exactly one "${marker}".`);
  return html.slice(0, at) + addition + html.slice(at);
}

async function buildPage(page) {
  const dimensions = ['session', ...(page.flash ? [page.flash] : [])];
  const base = await renderView(page);
  const baseLines = splitLines(base);
  const lineOffsets = [0];
  for (const line of baseLines) lineOffsets.push(lineOffsets[lineOffsets.length - 1] + line.length);
  const safe = safeInsertionPoints(base);

  // 1. Find the regions that change with each state dimension.
  const slots = [];
  for (const dimension of dimensions) {
    const variant = await renderView(page, DIMENSIONS[dimension]);
    for (const hunk of mergeHunks(diffLines(baseLines, splitLines(variant)), baseLines)) {
      const region = { dimension, start: lineOffsets[hunk.start], end: lineOffsets[hunk.end], on: hunk.lines.join('') };
      slots.push(tighten(base, safe, region, page.file));
    }
  }
  slots.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let k = 1; k < slots.length; k++) {
    if (slots[k - 1].end > slots[k].start) fail(`${page.file}: the ${slots[k - 1].dimension} and ${slots[k].dimension} regions overlap.`);
  }
  for (const slot of slots) {
    if (slot.off.trim() && !isSelfContained(slot.off)) fail(`${page.file}: the ${slot.dimension} region is not self-contained markup.`);
  }

  // 2. Self-check: base + slots must reproduce the real render of every combination of states,
  //    both with the placeholders and with real values (catches templates that transform a value).
  for (const active of subsets(dimensions)) {
    for (const values of combinations(active.map((dimension) => [dimension, [SENTINELS[dimension], ...SAMPLES[dimension]]]))) {
      const locals = Object.fromEntries(Object.entries(values).map(([dimension, value]) => [LOCALS[dimension], value]));
      if (reconstruct(base, slots, values) !== (await renderView(page, locals))) {
        fail(`${page.file}: the demo cannot reproduce the page rendered for ${describe(values)}.`);
      }
    }
  }

  // 3. Emit the page.
  const references = new Set();
  let html = '';
  let cursor = 0;
  const emitStatic = (text) => {
    const rewritten = rewriteUrls(text);
    assertNoRootRelativeUrls(rewritten, page.file);
    collectReferences(rewritten, references);
    html += rewritten;
  };
  for (const slot of slots) {
    emitStatic(base.slice(cursor, slot.start));
    const off = rewriteUrls(slot.off);
    const on = rewriteUrls(slot.on);
    for (const variant of [off, on]) {
      assertNoRootRelativeUrls(variant, `${page.file} (${slot.dimension} region)`);
      collectReferences(variant, references);
    }
    html += slotMarkup(slot.dimension, off, on);
    cursor = slot.end;
  }
  emitStatic(base.slice(cursor));

  // The validator must be loaded before the register form can be submitted, so it is not deferred.
  const headScripts = page.view === 'Register' ? ['js/vendor/validator.min.js', 'js/demo.js'] : ['js/demo.js'];
  headScripts.forEach((script) => references.add(script));
  html = insertBefore(html, '</head>', headScripts.map((script) => `<script src="${script}"></script>`).join(''), page.file);
  html = insertBefore(html, '<script type="module" src="js/main.js"></script>', DEMO_BADGE, page.file);
  if (!/^<!DOCTYPE html>\n/i.test(html)) fail(`${page.file}: expected the page to start with <!DOCTYPE html>.`);
  html = html.replace(
    /^<!DOCTYPE html>\n/i,
    (doctype) =>
      `${doctype}<!-- Generated by scripts/demo/build.mjs from views/${page.view}.ejs. Do not edit: change the view, then run "npm run demo:build". -->\n`,
  );
  return { html, references, slots };
}

// ---------------------------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------------------------

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

/** Throws unless `relativePath` exists under `root` with exactly this spelling (GitHub Pages is case-sensitive). */
function assertExactPath(root, relativePath, context) {
  let dir = root;
  for (const segment of relativePath.split('/')) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory() || !fs.readdirSync(dir).includes(segment)) {
      fail(`${context}: "${relativePath}" does not exist (names must match exactly, including case).`);
    }
    dir = path.join(dir, segment);
  }
}

function cssReferences(cssFile) {
  const css = fs.readFileSync(cssFile, 'utf8');
  const references = [];
  for (const [, , url] of css.matchAll(CSS_URL)) {
    const value = url.trim();
    if (!value || EXTERNAL_URL.test(value) || value.startsWith('data:')) continue;
    if (value.startsWith('/')) fail(`public/css/style.css: url(${value}) would point outside the GitHub Pages site.`);
    references.push(path.posix.normalize(path.posix.join('css', decodeURI(value.replace(/[?#].*$/s, '')))));
  }
  return references;
}

/** The demo must handle exactly the app's POST routes and show exactly the controllers' messages. */
function assertRuntimeMatchesApp(runtime) {
  for (const sentinel of Object.values(SENTINELS)) {
    if (!runtime.includes(sentinel)) fail(`scripts/demo/runtime.js does not handle the placeholder ${sentinel}.`);
  }
  const postRoutes = [...fs.readFileSync(ROUTES_FILE, 'utf8').matchAll(/route\(\s*['"]([^'"]+)['"]\s*\)\s*\.post\(/g)].map((m) => m[1].toLowerCase());
  const expected = [...FORM_ACTIONS].sort().join(', ');
  if ([...new Set(postRoutes)].sort().join(', ') !== expected) {
    fail(`routs/pageRoute.js has POST routes ${postRoutes.join(', ')}, but the demo handles ${expected}. Update FORM_ACTIONS and scripts/demo/runtime.js.`);
  }
  for (const action of FORM_ACTIONS) {
    if (!runtime.includes(`'${action}'`)) fail(`scripts/demo/runtime.js has no handler for POST ${action}.`);
  }
  const controllers = fs.readFileSync(CONTROLLER_FILE, 'utf8');
  for (const message of [...SAMPLES.error, ...SAMPLES.result]) {
    if (!controllers.includes(`"${message}"`)) fail(`controllers/pageController.js no longer uses the message "${message}". Update SAMPLES and scripts/demo/runtime.js.`);
    if (!runtime.includes(`'${message}'`)) fail(`scripts/demo/runtime.js does not use the controller message "${message}".`);
  }
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

export async function build({ log = console.log } = {}) {
  const runtime = fs.readFileSync(RUNTIME_FILE, 'utf8');
  assertRuntimeMatchesApp(runtime);
  if (!fs.existsSync(VALIDATOR_FILE)) fail('node_modules/validator is missing. Run "npm ci" first.');

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const references = new Set();
  for (const page of PAGES) {
    const result = await buildPage(page);
    fs.writeFileSync(path.join(OUT_DIR, page.file), result.html);
    result.references.forEach((reference) => references.add(reference));
    const regions = result.slots.map((slot) => slot.dimension).join(', ') || 'none';
    log(`  ${page.file.padEnd(14)} views/${page.view}.ejs  (state regions: ${regions})`);
  }

  // Static assets, exactly as express.static('public') serves them.
  for (const name of fs.readdirSync(path.join(PUBLIC_DIR, 'css'))) {
    if (!name.startsWith('.')) copyFile(path.join(PUBLIC_DIR, 'css', name), path.join(OUT_DIR, 'css', name));
  }
  copyFile(path.join(PUBLIC_DIR, 'js/main.js'), path.join(OUT_DIR, 'js/main.js'));
  copyFile(RUNTIME_FILE, path.join(OUT_DIR, 'js/demo.js'));
  copyFile(VALIDATOR_FILE, path.join(OUT_DIR, 'js/vendor/validator.min.js'));

  // Only the images the pages and the stylesheet actually use.
  cssReferences(path.join(OUT_DIR, 'css/style.css')).forEach((reference) => references.add(reference));
  let imageCount = 0;
  let imageBytes = 0;
  for (const reference of [...references].sort()) {
    if (!reference.startsWith('images/')) continue;
    assertExactPath(PUBLIC_DIR, reference, 'public/');
    copyFile(path.join(PUBLIC_DIR, reference), path.join(OUT_DIR, reference));
    imageCount++;
    imageBytes += fs.statSync(path.join(OUT_DIR, reference)).size;
  }
  for (const reference of references) assertExactPath(OUT_DIR, reference, 'demo/');

  log(`  + ${imageCount} images (${(imageBytes / 1024 / 1024).toFixed(1)} MB), css/, js/main.js, js/demo.js, js/vendor/validator.min.js`);
}

async function serve() {
  const { default: express } = await import('express');
  const port = Number(process.env.DEMO_PORT) || 4173;
  const app = express();
  app.use(BASE_PATH.replace(/\/$/, ''), express.static(OUT_DIR));
  app.get('/', (req, res) => res.redirect(BASE_PATH));
  app.listen(port, () => console.log(`\nStatic demo running at http://localhost:${port}${BASE_PATH} (Ctrl+C to stop)`));
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  try {
    console.log('Building the static demo from views/ into demo/ ...');
    await build();
    console.log('Done.');
    if (process.argv.includes('--serve')) await serve();
  } catch (error) {
    console.error(`\nDemo build failed: ${error instanceof BuildError ? error.message : error.stack}`);
    process.exitCode = 1;
  }
}
