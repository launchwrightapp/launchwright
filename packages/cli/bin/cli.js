#!/usr/bin/env node
import { readFileSync } from "node:fs";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const arg = process.argv[2];

if (arg === "--version" || arg === "-v") {
  console.log(version);
  process.exit(0);
}

console.log(`
  Launchwright v${version}
  Build it right. Launch it right.

  Coming soon! Hindi pa ready ang CLI, pero malapit na.
  Matututo ka kung paano gumagana ang totoong production apps
  habang shini-ship mo ang sarili mong app.

  Updates: https://launchwright.app
`);
