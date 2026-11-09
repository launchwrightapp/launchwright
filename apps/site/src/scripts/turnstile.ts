// Cloudflare Turnstile, rendered into a [data-turnstile] slot whose data-sitekey the worker fills.
// "interaction-only" stays invisible unless Cloudflare needs the visitor to click.
// With no sitekey (shouldn't happen, the worker always sets one) the check is off.
type Api = { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id: string): void };

export function startTurnstile(slot: HTMLElement | null, onNeedsClick: () => void) {
  const sitekey = slot?.dataset.sitekey ?? "";
  let widget: string | undefined;
  let current = "";
  let waiting: ((t: string) => void) | undefined;
  const api = () => (window as unknown as { turnstile: Api }).turnstile;

  if (slot && sitekey) {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.addEventListener("load", () => {
      widget = api().render(slot, {
        sitekey,
        action: "pilot",
        appearance: "interaction-only",
        callback: (t: string) => { current = t; waiting?.(t); },
        "before-interactive-callback": onNeedsClick,
        "expired-callback": () => { current = ""; },
        "error-callback": () => { current = ""; },
      });
    });
    document.head.appendChild(s);
  }

  return {
    on: !!sitekey,
    ready: () => !!current || !sitekey,
    // Wait for a token, up to 15 seconds.
    token: () =>
      current || !sitekey
        ? Promise.resolve(current)
        : new Promise<string>((done) => {
            waiting = done;
            setTimeout(() => done(current), 15_000);
          }),
    reset() {
      current = "";
      if (widget !== undefined) api().reset(widget);
    },
  };
}
