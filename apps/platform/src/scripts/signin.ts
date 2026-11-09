// Sign-in page: show why you landed here, and keep ?next= so you return to the page you wanted.
const params = new URLSearchParams(location.search);
const messages: Record<string, string> = {
  cancelled: "Sign-in was cancelled on GitHub. You can try again.",
  expired: "That sign-in link expired. Please try again.",
  github: "GitHub didn't answer as expected. Please try again in a minute.",
  not_in_pilot: "launchwright is in a private pilot, and this GitHub account isn't in it. If you were accepted, sign in with the GitHub account from your application. Not in yet? Apply at launchwright.app/pilot.",
  unavailable: "We couldn't check your access just now. Please try again in a minute.",
};
const box = document.getElementById("signin-message");
const error = params.get("error");
if (box && (error || params.has("signed_out"))) {
  box.textContent = error ? messages[error] ?? messages.github : "You're signed out.";
  if (!error) box.className = "rounded-lg bg-ok-bg px-4 py-3 text-[15px] text-ok";
  box.hidden = false;
}
const next = params.get("next");
const link = document.querySelector<HTMLAnchorElement>("[data-signin]");
if (link && next?.startsWith("/") && !next.startsWith("//")) link.href = `/auth/github?next=${encodeURIComponent(next)}`;
