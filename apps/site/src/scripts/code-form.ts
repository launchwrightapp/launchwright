// "Send code" forms: the home page pilot form (#waitlist) and /pilot (#pilot-start).
// Checks the email, runs the Turnstile bot check, asks the worker to email a 6-digit
// code (POST /api/pilot/code), then goes to /pilot/verify.
// Turnstile loads on first use (focus or submit), so the home page stays light.
import { startTurnstile } from "./turnstile";

export function codeForm(form: HTMLFormElement, statusEl: HTMLElement) {
  const email = form.elements.namedItem("email") as HTMLInputElement;
  const submit = form.querySelector<HTMLButtonElement>("[type=submit]")!;
  const show = (msg: string, kind: "err" | "" = "") => {
    statusEl.textContent = msg;
    statusEl.dataset.kind = kind;
  };

  let bot: ReturnType<typeof startTurnstile> | undefined;
  const check = () =>
    (bot ??= startTurnstile(form.querySelector<HTMLElement>("[data-turnstile]"), () =>
      show("Please tick “Verify you are human” below, then send.", "err"),
    ));
  form.addEventListener("focusin", check, { once: true });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!email.checkValidity()) {
      show("Please check your email address.", "err");
      email.focus();
      return;
    }
    const b = check();
    submit.disabled = true;
    show(b.ready() ? "Sending your code..." : "Checking you're not a bot...");
    const token = await b.token();
    if (b.on && !token) {
      show("Still checking you're not a bot. Please try again in a moment.", "err");
      submit.disabled = false;
      return;
    }
    show("Sending your code...");
    const address = email.value.trim().toLowerCase();
    try {
      const res = await fetch("/api/pilot/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: address,
          website: (form.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "",
          "cf-turnstile-response": token,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Something went wrong. Please try again.");
      try { sessionStorage.setItem("lw-pilot-sent", String(Date.now())); } catch { /* private mode */ }
      location.assign(`/pilot/verify?email=${encodeURIComponent(address)}`);
    } catch (err) {
      show((err as Error).message, "err");
      b.reset(); // tokens work once; get a fresh one for the retry
      submit.disabled = false;
    }
  });
}
