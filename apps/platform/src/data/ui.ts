// Shared class strings for table and list toolbars (Applicants, Team inbox).
// Tailwind only generates classes it can see written out in full, so they live here as literals.

// One button in a segmented switch (Waiting / Accepted / All). Selected = aria-pressed="true".
export const seg = "inline-flex min-h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-[13px] font-medium text-muted hover:text-ink aria-pressed:bg-surface-3 aria-pressed:text-ink";
// The box around a segmented switch.
export const segGroup = "flex rounded-md border border-line bg-surface p-0.5 dark:bg-surface-2";
// Small text input in a toolbar (search).
export const control = "min-h-8 rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink dark:bg-surface-2";
// The toolbar strip at the top of a card.
export const toolbar = "flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-3 py-2";
// Search icon, placed inside a `relative` wrapper before a `pl-8` input.
export const searchIcon = '<svg class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3" stroke-linecap="round"/></svg>';
