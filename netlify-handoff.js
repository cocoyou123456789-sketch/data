(function handoffGitHubMirrorToNetlify() {
  "use strict";

  const GITHUB_HOST = "cocoyou123456789-sketch.github.io";
  const GITHUB_BASE_PATH = "/data";
  const NETLIFY_ORIGIN = "https://arpes-materials-explorer-cocoyou.netlify.app";

  if (window.location.hostname !== GITHUB_HOST) return;

  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.get("stay_on_github") === "1") return;

  // Keep the public repository homepage on GitHub Pages. Navigating between
  // the material catalog and its standalone modules must remain same-origin;
  // otherwise a return trip can restore a stale Netlify copy of the catalog.
  if (currentUrl.pathname === GITHUB_BASE_PATH || currentUrl.pathname === `${GITHUB_BASE_PATH}/`) return;

  let targetPath = currentUrl.pathname;
  if (targetPath === GITHUB_BASE_PATH || targetPath === `${GITHUB_BASE_PATH}/`) {
    targetPath = "/";
  } else if (targetPath.startsWith(`${GITHUB_BASE_PATH}/`)) {
    targetPath = targetPath.slice(GITHUB_BASE_PATH.length) || "/";
  }

  const targetUrl = new URL(targetPath, NETLIFY_ORIGIN);
  targetUrl.search = currentUrl.search;
  targetUrl.hash = currentUrl.hash;
  window.location.replace(targetUrl.href);
})();
