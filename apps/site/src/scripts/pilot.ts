// Pilot questionnaire: turns the long form into a guided stepper.
// Without this file every step shows and the form posts to /api/waitlist.
import "../../../../packages/ui/dropdown";

const form = document.getElementById("pilot-form") as HTMLFormElement | null;

if (form) {
  const steps = [...form.querySelectorAll<HTMLElement>("[data-step]")];
  const last = steps.length;
  const back = form.querySelector<HTMLButtonElement>("[data-back]")!;
  const next = form.querySelector<HTMLButtonElement>("[data-next]")!;
  const submit = form.querySelector<HTMLButtonElement>("[data-submit]")!;
  const statusEl = document.getElementById("pilot-status")!;
  const progress = document.querySelector<HTMLElement>("[data-progress]")!;
  const progressText = document.querySelector<HTMLElement>("[data-progress-text]")!;
  const progressName = document.querySelector<HTMLElement>("[data-progress-name]")!;
  const review = form.querySelector<HTMLElement>("[data-review]")!;
  const field = (name: string) => form.elements.namedItem(name);
  let current = 1;

  // Turnstile bot check, loaded when the visitor reaches the last step.
  // "interaction-only" stays invisible unless Cloudflare needs the visitor to click.
  type Turnstile = {
    render(el: HTMLElement, o: Record<string, unknown>): string;
    reset(id: string): void;
  };
  const slot = form.querySelector<HTMLElement>("[data-turnstile]");
  const sitekey = slot?.dataset.sitekey ?? "";
  let widget: string | undefined;
  let token = "";
  let waiting: ((t: string) => void) | undefined;
  function startTurnstile() {
    if (!slot || !sitekey || widget !== undefined || document.querySelector("script[data-turnstile-api]")) return;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.dataset.turnstileApi = "";
    s.addEventListener("load", () => {
      const ts = (window as unknown as { turnstile: Turnstile }).turnstile;
      widget = ts.render(slot, {
        sitekey,
        action: "pilot",
        appearance: "interaction-only",
        callback: (t: string) => { token = t; waiting?.(t); },
        "expired-callback": () => { token = ""; },
        "error-callback": () => { token = ""; },
      });
    });
    document.head.appendChild(s);
  }
  // Wait for a token, up to 15 seconds.
  const getToken = () =>
    token || !sitekey
      ? Promise.resolve(token)
      : new Promise<string>((done) => {
          waiting = done;
          setTimeout(() => done(token), 15_000);
        });
  function resetTurnstile() {
    token = "";
    if (widget !== undefined) (window as unknown as { turnstile: Turnstile }).turnstile.reset(widget);
  }

  const show = (msg: string, kind: "err" | "" = "") => {
    statusEl.textContent = msg;
    statusEl.dataset.kind = kind;
  };

  // Prefill the email from the home page (?email=).
  const email = field("email") as HTMLInputElement;
  const given = new URLSearchParams(location.search).get("email");
  if (given && !email.value) email.value = given.slice(0, 254);

  const title = (n: number) => steps[n - 1].querySelector("h2")!.textContent ?? "";

  function go(n: number, focus = true) {
    current = n;
    steps.forEach((s, i) => (s.hidden = i + 1 !== n));
    steps.forEach((s) => s.classList.remove("border-t"));
    back.hidden = n === 1;
    next.hidden = n === last;
    submit.hidden = n !== last;
    progress.hidden = false;
    progressText.textContent = `Step ${n} of ${last}`;
    progressName.textContent = title(n);
    document.querySelectorAll<HTMLElement>("[data-progress-bar]").forEach((b) => {
      if (Number(b.dataset.progressBar) <= n) b.dataset.on = "";
      else delete b.dataset.on;
    });
    document.querySelectorAll<HTMLElement>("[data-step-item]").forEach((li) => {
      const i = Number(li.dataset.stepItem);
      li.dataset.state = i === n ? "current" : i < n ? "done" : "";
      if (i === n) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
    if (n === last) {
      fillReview();
      startTurnstile();
    }
    show("");
    if (focus) {
      const h = steps[n - 1].querySelector<HTMLElement>("h2")!;
      h.focus({ preventScroll: true });
      h.scrollIntoView({ block: "nearest" });
      if (h.getBoundingClientRect().top < 100) scrollTo({ top: scrollY + h.getBoundingClientRect().top - 140 });
    }
  }

  // The first problem on a step, with a message and the element to focus.
  function problem(n: number): { msg: string; el: HTMLElement } | null {
    const step = steps[n - 1];
    for (const input of step.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=radio]):not([type=checkbox]), textarea")) {
      if (input.name === "website") continue;
      if (!input.checkValidity()) {
        const label = input.closest("label")?.querySelector("span")?.textContent?.replace(/\(optional\)/, "").trim() ?? "this field";
        const msg = input.name === "email" ? "Please check your email address."
          : input.name === "github" ? "That doesn't look like a GitHub username."
          : `Please fill in: ${label}`;
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

  function check(n: number) {
    const p = problem(n);
    if (p) {
      show(p.msg, "err");
      p.el.focus();
      return false;
    }
    return true;
  }

  // Review: each step's answers, with a way back to change them.
  const labelOf = (input: HTMLInputElement) => input.closest("label")?.textContent?.trim() ?? input.value;
  function answersFor(n: number): [string, string][] {
    const step = steps[n - 1];
    const rows: [string, string][] = [];
    const tidy = (t: string | null | undefined) => (t ?? "").replace(/\((optional|pick any)\)/, "").trim();
    // In page order: question groups and single fields.
    for (const el of step.querySelectorAll<HTMLElement>(":scope > fieldset, :scope > label")) {
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
  function fillReview() {
    review.replaceChildren();
    for (let n = 1; n < last; n++) {
      const group = document.createElement("div");
      group.className = "flex flex-col gap-3 p-5";
      const head = document.createElement("div");
      head.className = "flex items-center justify-between gap-3";
      const dt = document.createElement("dt");
      dt.className = "font-semibold";
      dt.textContent = title(n);
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "cursor-pointer rounded-full px-3 py-1 text-[15px] font-medium text-ink underline underline-offset-4 hover:bg-surface-2";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit ${title(n)}`);
      edit.addEventListener("click", () => go(n));
      head.appendChild(dt);
      head.appendChild(edit);
      const dd = document.createElement("dd");
      dd.className = "grid gap-1.5 text-[16px]";
      for (const [k, v] of answersFor(n)) {
        const row = document.createElement("p");
        row.className = "grid gap-0.5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4";
        const key = document.createElement("span");
        key.className = "text-muted";
        key.textContent = k;
        const val = document.createElement("span");
        val.className = "break-words";
        val.textContent = v;
        row.appendChild(key);
        row.appendChild(val);
        dd.appendChild(row);
      }
      group.appendChild(head);
      group.appendChild(dd);
      review.appendChild(group);
    }
    review.hidden = false;
  }

  next.addEventListener("click", () => check(current) && go(current + 1));
  back.addEventListener("click", () => go(current - 1));

  // "None yet" and specific tools don't mix.
  form.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name !== "tools" || !t.checked) return;
    form.querySelectorAll<HTMLInputElement>('input[name="tools"]').forEach((o) => {
      if (t.value === "none" ? o.value !== "none" : o.value === "none") o.checked = false;
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // Enter on an earlier step means "Continue", not "send".
    if (current < last) {
      if (check(current)) go(current + 1);
      return;
    }
    for (let n = 1; n < last; n++) {
      if (problem(n)) {
        go(n);
        check(n);
        return;
      }
    }
    const consent = field("consent") as HTMLInputElement;
    if (!consent.checked) {
      show("Please give consent to apply.", "err");
      consent.focus();
      return;
    }

    submit.disabled = true;
    show("Sending...");
    const botToken = await getToken();
    if (sitekey && !botToken) {
      show("Still checking you're not a bot. Please try again in a moment.", "err");
      submit.disabled = false;
      return;
    }
    const fd = new FormData(form);
    const data: Record<string, unknown> = {};
    for (const key of new Set(fd.keys())) {
      const all = fd.getAll(key).map(String);
      data[key] = key === "tools" || key === "learn" ? all : all[0];
    }
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, consent: true, "cf-turnstile-response": botToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Something went wrong. Please try again.");
      location.assign("/pilot/thanks");
    } catch (err) {
      show((err as Error).message, "err");
      resetTurnstile(); // tokens work once; get a fresh one for the retry
      submit.disabled = false;
    }
  });

  go(1, false);
}
