// Pilot, part 2: the 6-digit code. One real input (so paste and phone autofill work),
// drawn as six boxes. Six digits send it on their own.
import "../../../../packages/ui/dropdown";
import { startTurnstile } from "./turnstile";

const form = document.getElementById("pilot-verify") as HTMLFormElement | null;
const RESEND_SECONDS = 30; // worker/verify.ts RESEND_SECONDS

if (form) {
  const email = (new URLSearchParams(location.search).get("email") ?? "").trim().toLowerCase().slice(0, 254);
  if (!email) location.replace("/pilot");

  const input = form.elements.namedItem("code") as HTMLInputElement;
  const otp = form.querySelector<HTMLElement>("[data-otp]")!;
  const cells = [...form.querySelectorAll<HTMLElement>("[data-cell]")];
  const submit = form.querySelector<HTMLButtonElement>("[data-submit]")!;
  const resend = form.querySelector<HTMLButtonElement>("[data-resend]")!;
  const statusEl = document.getElementById("pilot-status")!;
  const show = (msg: string, kind: "err" | "ok" | "" = "") => {
    statusEl.textContent = msg;
    statusEl.dataset.kind = kind;
  };

  (form.elements.namedItem("email") as HTMLInputElement).value = email;
  form.querySelector("[data-email]")!.textContent = email;
  form.querySelector<HTMLAnchorElement>("[data-change]")!.href = `/pilot?email=${encodeURIComponent(email)}`;
  otp.dataset.ready = "";

  // Draw the typed digits into the boxes; the next empty box shows the focus ring.
  function paint() {
    const v = input.value;
    cells.forEach((c, i) => {
      c.textContent = v[i] ?? "";
      if (v[i]) c.dataset.filled = ""; else delete c.dataset.filled;
      if (i === Math.min(v.length, 5)) c.dataset.active = ""; else delete c.dataset.active;
    });
  }
  // The caret always sits at the end: the boxes fill left to right.
  const toEnd = () => input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener("focus", () => requestAnimationFrame(toEnd));
  input.addEventListener("click", toEnd);
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    delete otp.dataset.bad;
    paint();
    if (input.value.length === 6) form.requestSubmit();
  });
  paint();
  input.focus();

  // Resend: needs the bot check again, and waits 30 seconds between codes.
  const bot = startTurnstile(form.querySelector<HTMLElement>("[data-turnstile]"), () =>
    show("Please tick “Verify you are human” below, then ask again.", "err"),
  );
  let timer: number | undefined;
  function cooldown(seconds: number) {
    clearInterval(timer);
    let left = seconds;
    const tick = () => {
      resend.disabled = left > 0;
      resend.textContent = left > 0 ? `Send a new code in ${left}s` : "Send a new code";
      if (left-- <= 0) clearInterval(timer);
    };
    tick();
    timer = window.setInterval(tick, 1000);
  }
  let sentAt = 0;
  try { sentAt = Number(sessionStorage.getItem("lw-pilot-sent")) || 0; } catch { /* private mode */ }
  const since = Math.floor((Date.now() - sentAt) / 1000);
  if (since < RESEND_SECONDS) cooldown(RESEND_SECONDS - since);

  resend.addEventListener("click", async () => {
    resend.disabled = true;
    show("Sending a new code...");
    const token = await bot.token();
    if (bot.on && !token) {
      show("Still checking you're not a bot. Please try again in a moment.", "err");
      resend.disabled = false;
      return;
    }
    try {
      const res = await fetch("/api/pilot/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, "cf-turnstile-response": token }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Something went wrong. Please try again.");
      try { sessionStorage.setItem("lw-pilot-sent", String(Date.now())); } catch { /* private mode */ }
      input.value = "";
      paint();
      input.focus();
      show("New code sent. Check your inbox.", "ok");
      cooldown(RESEND_SECONDS);
    } catch (err) {
      show((err as Error).message, "err");
      resend.disabled = false;
    } finally {
      bot.reset();
    }
  });

  let busy = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(input.value)) {
      show("Enter the 6-digit code from the email.", "err");
      input.focus();
      return;
    }
    busy = true;
    submit.disabled = true;
    show("Checking...");
    try {
      const res = await fetch("/api/pilot/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code: input.value }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; expired?: boolean; applied?: boolean; next?: string };
      if (!res.ok) {
        otp.dataset.bad = "";
        if (body.expired) {
          input.value = "";
          paint();
          resend.disabled = false;
          resend.textContent = "Send a new code";
          clearInterval(timer);
        }
        throw new Error(body.error || "Something went wrong. Please try again.");
      }
      otp.dataset.ok = "";
      if (body.applied) {
        form.hidden = true;
        document.querySelector<HTMLElement>("[data-applied]")!.hidden = false;
        return;
      }
      show("Email confirmed.", "ok");
      location.assign(body.next ?? "/pilot/apply");
    } catch (err) {
      show((err as Error).message, "err");
      input.focus();
      input.select();
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });
}
