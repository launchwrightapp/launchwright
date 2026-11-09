// A tiny data binder for the dashboard. Pages are static HTML (strict CSP: no inline scripts, no
// innerHTML); this fills them in from the /api/me view model using attributes:
//
//   data-bind="path"              textContent = value
//   data-attr="href:path;title:p" set attributes (null/false removes them)
//   data-if="path" / data-unless  hidden unless (or if) truthy; empty arrays are falsy
//   data-class="bg-bad:path;..."  toggle classes (written out in full so Tailwind sees them)
//   data-each="path"              repeat the element's <template> once per item
//
// Inside data-each, paths resolve against the item first, then the root. "." is the item itself.
// Everything is set as text, never as HTML, so data from repos and logs can't inject markup.

export type View = Record<string, unknown>;

function get(scopes: unknown[], path: string): unknown {
  if (path === ".") return scopes[0];
  const parts = path.split(".");
  for (const scope of scopes) {
    let v: unknown = scope;
    let found = true;
    for (const part of parts) {
      if (v !== null && typeof v === "object" && part in (v as object)) v = (v as Record<string, unknown>)[part];
      else {
        found = false;
        break;
      }
    }
    if (found) return v;
  }
  return undefined;
}

const truthy = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v);
const pairs = (spec: string) =>
  spec.split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.lastIndexOf(":");
    return [s.slice(0, i).trim(), s.slice(i + 1).trim()] as const;
  });

function bindEl(el: Element, scopes: unknown[]) {
  const d = (el as HTMLElement).dataset;
  if (d.if !== undefined) (el as HTMLElement).hidden = !truthy(get(scopes, d.if));
  if (d.unless !== undefined) (el as HTMLElement).hidden = truthy(get(scopes, d.unless));
  if (d.bind !== undefined) {
    const v = get(scopes, d.bind);
    el.textContent = v === undefined || v === null ? "" : String(v);
  }
  if (d.attr) {
    for (const [attr, path] of pairs(d.attr)) {
      const v = get(scopes, path);
      if (v === undefined || v === null || v === false) el.removeAttribute(attr);
      else el.setAttribute(attr, v === true ? "" : String(v));
    }
  }
  if (d.class) for (const [cls, path] of pairs(d.class)) for (const c of cls.split(/\s+/)) el.classList.toggle(c, truthy(get(scopes, path)));
}

export function bind(root: Document | HTMLElement, view: unknown, parents: unknown[] = []) {
  const scopes = [view, ...parents];
  // Lists first, so their rendered rows are bound with their own item.
  const lists = [...root.querySelectorAll<HTMLElement>("[data-each]")].filter((el) => !isNested(el, root));
  for (const list of lists) {
    const tpl = list.querySelector(":scope > template") as HTMLTemplateElement | null;
    if (!tpl) continue;
    list.querySelectorAll(":scope > [data-row]").forEach((r) => r.remove());
    const items = get(scopes, list.dataset.each!);
    for (const item of Array.isArray(items) ? items : []) {
      const frag = tpl.content.cloneNode(true) as DocumentFragment;
      const rows = [...frag.children];
      for (const row of rows) {
        row.setAttribute("data-row", "");
        bindTree(row, [item, ...scopes]);
      }
      list.appendChild(frag);
    }
  }
  for (const el of root.querySelectorAll("[data-bind],[data-attr],[data-if],[data-unless],[data-class]")) {
    if (el.closest("[data-row]") || el.closest("template")) continue;
    bindEl(el, scopes);
  }
}

// A rendered row: bind itself, its nested lists, then its descendants.
function bindTree(row: Element, scopes: unknown[]) {
  bindEl(row, scopes);
  for (const list of row.querySelectorAll<HTMLElement>("[data-each]")) {
    if (list.parentElement?.closest("[data-each]") && list.parentElement.closest("[data-row]") !== row) continue;
    const tpl = list.querySelector(":scope > template") as HTMLTemplateElement | null;
    if (!tpl) continue;
    const items = get(scopes, list.dataset.each!);
    for (const item of Array.isArray(items) ? items : []) {
      const frag = tpl.content.cloneNode(true) as DocumentFragment;
      for (const child of [...frag.children]) {
        child.setAttribute("data-row", "");
        bindTree(child, [item, ...scopes]);
      }
      list.appendChild(frag);
    }
  }
  for (const el of row.querySelectorAll("[data-bind],[data-attr],[data-if],[data-unless],[data-class]")) {
    if (el.closest("[data-row]") !== row) continue;
    bindEl(el, scopes);
  }
}

function isNested(list: Element, root: Document | HTMLElement) {
  let p = list.parentElement;
  while (p && p !== root) {
    if (p.hasAttribute("data-each") || p.tagName === "TEMPLATE") return true;
    p = p.parentElement;
  }
  return false;
}
