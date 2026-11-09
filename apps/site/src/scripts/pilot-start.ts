// Pilot, part 1 on its own page (/pilot), for links from outside the home page.
import "../../../../packages/ui/dropdown";
import { codeForm } from "./code-form";

const form = document.getElementById("pilot-start") as HTMLFormElement | null;

if (form) {
  const email = form.elements.namedItem("email") as HTMLInputElement;
  const params = new URLSearchParams(location.search);
  const given = params.get("email");
  if (given && !email.value) email.value = given.slice(0, 254);
  if (params.has("expired")) form.querySelector<HTMLElement>("[data-expired]")!.hidden = false;
  codeForm(form, document.getElementById("pilot-status")!);
}
