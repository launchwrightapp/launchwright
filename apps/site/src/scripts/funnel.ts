// Pilot funnel (worker/funnel.ts): tells the server "this happened", at most once per tab.
// Anonymous: no cookie, no id, and nothing typed into the form is sent.
export function track(event: string) {
  try {
    const key = `lw-funnel-${event}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    return; // no storage (private mode, blocked): skip rather than count twice
  }
  fetch("/api/funnel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => {});
}
