// Launch headless Chromium. Uses the already-installed browser build if Playwright's own one is missing.
import { chromium } from "playwright";
import { existsSync } from "fs";
import { homedir } from "os";
export async function launch() {
  try { return await chromium.launch(); } catch (e) {
    const fallback = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
    if (!existsSync(fallback)) throw e;
    return chromium.launch({ executablePath: fallback });
  }
}
