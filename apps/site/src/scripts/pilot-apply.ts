// Pilot, part 3: turns the questionnaire into a guided 5-step wizard.
// Without this file every step shows and the form posts to /api/waitlist.
//
// Once you've reached the review, going back to a step (Edit, or the step list) is an
// edit: "Save and review" returns to the review, "Cancel" undoes the changes and returns.
// Answers are kept in this tab (sessionStorage) so a refresh or a re-verify loses nothing.
import "../../../../packages/ui/dropdown";
import { track } from "./funnel";

const form = document.getElementById("pilot-form") as HTMLFormElement | null;
const DRAFT = "lw-pilot-draft";

if (form) {
  const steps = [...form.querySelectorAll<HTMLElement>("[data-step]")];
  const last = steps.length;
  const btn = (name: string) => form.querySelector<HTMLButtonElement>(`[data-${name}]`)!;
  const back = btn("back"), next = btn("next"), submit = btn("submit"), save = btn("save"), cancel = btn("cancel");
  const statusEl = document.getElementById("pilot-status")!;
  const progress = document.querySelector<HTMLElement>("[data-progress]")!;
  const progressText = document.querySelector<HTMLElement>("[data-progress-text]")!;
  const progressName = document.querySelector<HTMLElement>("[data-progress-name]")!;
  const rail = [...document.querySelectorAll<HTMLButtonElement>("[data-step-item]")];
  const review = form.querySelector<HTMLElement>("[data-review]")!;
  const verifiedEmail = document.querySelector("[data-verified-email]")?.textContent?.trim() ?? "";
  let current = 1;
  let furthest = 1;
  let snapshot: [string, string][] | null = null; // the answers when you left the review

  const show = (msg: string, kind: "err" | "" = "") => {
    statusEl.textContent = msg;
    statusEl.dataset.kind = kind;
  };
  const title = (n: number) => steps[n - 1].querySelector("h2")!.textContent ?? "";

  // --- Answers: read, restore, keep a draft ---
  const entries = (): [string, string][] =>
    [...new FormData(form)].filter(([k]) => k !== "website").map(([k, v]) => [k, String(v)]);
  function restore(saved: [string, string][]) {
    for (const el of form!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name], textarea[name]")) {
      if (el.name === "website") continue;
      const values = saved.filter(([k]) => k === el.name).map(([, v]) => v);
      if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) el.checked = values.includes(el.value);
      else el.value = values[0] ?? "";
    }
  }
  function keepDraft() {
    try { sessionStorage.setItem(DRAFT, JSON.stringify({ answers: entries(), furthest })); } catch { /* private mode */ }
  }

  // --- Moving between steps ---
  const editing = () => furthest === last && current < last;

  function go(n: number, focus = true) {
    if (current === last && n < last) snapshot = entries(); // leaving the review starts an edit
    if (n === last) snapshot = null;
    current = n;
    furthest = Math.max(furthest, n);
    track(`apply_${n}`); // drop-off: how many reach each step (once per tab)

    steps.forEach((s, i) => {
      s.hidden = i + 1 !== n;
      s.classList.remove("step-in");
    });
    void steps[n - 1].offsetWidth; // restart the animation
    steps[n - 1].classList.add("step-in");

    back.hidden = n === 1 || editing();
    next.hidden = n === last || editing();
    save.hidden = cancel.hidden = !editing();
    submit.hidden = n !== last;

    progress.hidden = false;
    progressText.textContent = editing() ? `Editing step ${n} of ${last}` : `Step ${n} of ${last}`;
    progressName.textContent = title(n);
    document.querySelectorAll<HTMLElement>("[data-progress-bar]").forEach((b) => {
      if (Number(b.dataset.progressBar) <= Math.max(n, furthest)) b.dataset.on = "";
      else delete b.dataset.on;
    });
    for (const item of rail) {
      const i = Number(item.dataset.stepItem);
      item.dataset.state = i === n ? "current" : i <= furthest && !problem(i) ? "done" : "";
      item.disabled = i > furthest || i === n;
      if (i === n) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }
    if (n === last) fillReview();
    show("");
    keepDraft();
    if (focus) {
      const h = steps[n - 1].querySelector<HTMLElement>("h2")!;
      h.focus({ preventScroll: true });
      const top = form!.parentElement!.getBoundingClientRect().top;
      // Keep the card's top (and its progress) in view, below the sticky header.
      if (top < 96 || top > innerHeight * 0.6) scrollTo({ top: scrollY + top - 112, behavior: "smooth" });
    }
  }

  // The first problem on a step, with a message and the element to focus.
  function problem(n: number): { msg: string; el: HTMLElement } | null {
    const step = steps[n - 1];
    for (const input of step.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=radio]):not([type=checkbox]), textarea")) {
      if (input.name === "website") continue;
      if (!input.checkValidity()) {
        const label = input.closest("label")?.querySelector("span")?.textContent?.replace(/\(optional\)/, "").trim() ?? "this field";
        const msg = input.name === "github" ? "That doesn't look like a GitHub username." : `Please fill in: ${label}`;
        return { msg, el: input };
      }
    }
    for (const group of step.querySelectorAll<HTMLFieldSetElement>("fieldset[data-required]")) {
      if (!group.querySelector("input:checked")) {
        const legend = group.querySelector("legend")?.textContent?.trim() ?? "this question";
        return { msg: `Please answer: ${legend}`, el: group.querySelector("input")! };
      }
    }
    return null;
  }

  // Checks steps from..to; on a problem, shows that step and the message.
  function check(from: number, to = from) {
    for (let n = from; n <= to; n++) {
      const p = problem(n);
      if (!p) continue;
      if (n !== current) go(n, false);
      show(p.msg, "err");
      p.el.focus();
      return false;
    }
    return true;
  }

  // --- Review: each step's answers, with a way back to change them ---
  const labelOf = (input: HTMLInputElement) => input.closest("label")?.textContent?.trim() ?? input.value;
  const tidy = (t: string | null | undefined) => (t ?? "").replace(/\((optional|pick any)\)/, "").trim();
  function answersFor(n: number): [string, string][] {
    const rows: [string, string][] = n === 1 && verifiedEmail ? [["Email", verifiedEmail]] : [];
    for (const el of steps[n - 1].querySelectorAll<HTMLElement>(":scope > fieldset, :scope > label")) {
      if (el.tagName === "FIELDSET") {
        const picked = [...el.querySelectorAll<HTMLInputElement>("input:checked")].map(labelOf);
        rows.push([tidy(el.querySelector("legend")?.textContent), picked.join(", ") || "—"]);
      } else {
        const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
        if (input) rows.push([tidy(el.querySelector("span")?.textContent), input.value.trim() || "—"]);
      }
    }
    return rows;
  }
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = "") => {
    const el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  function fillReview() {
    review.replaceChildren();
    for (let n = 1; n < last; n++) {
      const group = make("div", "flex flex-col gap-3 p-5");
      const head = make("div", "flex items-center justify-between gap-3");
      const edit = make("button", "cursor-pointer rounded-full px-3 py-1 text-[15px] font-medium text-ink underline underline-offset-4 hover:bg-surface-2", "Edit");
      edit.type = "button";
      edit.setAttribute("aria-label", `Edit ${title(n)}`);
      edit.addEventListener("click", () => go(n));
      head.appendChild(make("dt", "font-semibold", title(n)));
      head.appendChild(edit);
      const dd = make("dd", "grid gap-1.5 text-[16px]");
      for (const [k, v] of answersFor(n)) {
        const row = make("p", "grid gap-0.5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4");
        row.appendChild(make("span", "text-muted", k));
        row.appendChild(make("span", "break-words", v));
        dd.appendChild(row);
      }
      group.appendChild(head);
      group.appendChild(dd);
      review.appendChild(group);
    }
    review.hidden = false;
  }

  // --- Controls ---
  next.addEventListener("click", () => check(current) && go(current + 1));
  back.addEventListener("click", () => go(current - 1));
  save.addEventListener("click", () => check(1, last - 1) && go(last));
  cancel.addEventListener("click", () => {
    if (snapshot) restore(snapshot);
    go(last);
  });
  // The step list: jump back to any step, or forward to one you've already reached.
  for (const item of rail) {
    item.addEventListener("click", () => {
      const n = Number(item.dataset.stepItem);
      if (n > current && !editing() && !check(current, n - 1)) return;
      go(n);
    });
  }

  form.addEventListener("input", keepDraft);
  form.addEventListener("change", (e) => {
    // "None yet" and specific tools don't mix.
    const t = e.target as HTMLInputElement;
    if (t.name === "tools" && t.checked) {
      form.querySelectorAll<HTMLInputElement>('input[name="tools"]').forEach((o) => {
        if (t.value === "none" ? o.value !== "none" : o.value === "none") o.checked = false;
      });
    }
    keepDraft();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // Enter on an earlier step means "Continue" (or "Save and review"), not "send".
    if (current < last) {
      if (editing()) { if (check(1, last - 1)) go(last); }
      else if (check(current)) go(current + 1);
      return;
    }
    if (!check(1, last - 1)) return;
    const consent = form.elements.namedItem("consent") as HTMLInputElement;
    if (!consent.checked) {
      show("Please give consent to apply.", "err");
      consent.focus();
      return;
    }

    submit.disabled = true;
    show("Sending...");
    const data: Record<string, unknown> = {};
    const fd = new FormData(form);
    for (const key of new Set(fd.keys())) {
      const all = fd.getAll(key).map(String);
      data[key] = key === "tools" || key === "learn" ? all : all[0];
    }
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, consent: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; verify?: boolean };
      if (body.verify) {
        location.assign("/pilot?expired=1"); // the draft stays, so nothing is lost
        return;
      }
      if (!res.ok) throw new Error(body.error || "Something went wrong. Please try again.");
      try { sessionStorage.removeItem(DRAFT); } catch { /* private mode */ }
      location.assign("/pilot/thanks");
    } catch (err) {
      show((err as Error).message, "err");
      submit.disabled = false;
    }
  });

  // Pick up where you left off in this tab.
  let start = 1;
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null") as { answers?: [string, string][]; furthest?: number } | null;
    if (saved?.answers) {
      restore(saved.answers);
      furthest = Math.min(Math.max(1, saved.furthest ?? 1), last);
      start = furthest === last ? last : 1;
    }
  } catch { /* no draft */ }
  steps.forEach((s) => s.classList.remove("border-t"));
  go(start, false);
}
