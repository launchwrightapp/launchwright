// Turn a long CI log into the part worth reading: around the first error.
const STAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/;
const ERROR_LINE = /(##\[error\]|\berror\b|\bfailed\b|\bfailure\b|✘|×|Error:|ERR!|exit code [1-9])/i;
const NOISE = /^##\[(group|endgroup)\]|^\s*$/;

export function focusLog(raw: string, before = 15, after = 60): string {
  const lines = raw.split("\n").map((l) => l.replace(STAMP, "")).filter((l) => !NOISE.test(l));
  const first = lines.findIndex((l) => ERROR_LINE.test(l) && !/^\s*(echo|\$|run:)/.test(l));
  if (first === -1) return lines.slice(-80).join("\n");
  return lines.slice(Math.max(0, first - before), first + after).join("\n");
}
