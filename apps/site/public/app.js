// Waitlist form: submit with fetch, fall back to a normal POST without JS.
const form = document.getElementById("waitlist");
const status = document.getElementById("waitlist-status");

function show(msg, kind) {
  status.textContent = msg;
  status.className = `status ${kind || ""}`;
}

if (new URLSearchParams(location.search).get("joined") === "1") {
  show("Thanks! You're on the waitlist.", "ok");
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));

  if (!form.email.checkValidity()) {
    show("Please check your email address.", "err");
    form.email.focus();
    return;
  }
  if (!form.consent.checked) {
    show("Please give consent to join.", "err");
    return;
  }

  const button = form.querySelector("button");
  button.disabled = true;
  show("Submitting...");

  try {
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...data, consent: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Something went wrong. Please try again.");
    form.reset();
    show("Thanks! You're on the waitlist.", "ok");
  } catch (err) {
    show(err.message, "err");
  } finally {
    button.disabled = false;
  }
});
