/**
 * Post-build patch: make approval request queue idempotent.
 *
 * Why:
 * The renderer can receive duplicate/overlapping approval requests while a prior
 * approval is still pending. When duplicates are pushed blindly, stale requests
 * may remain in the queue and keep the thread in "Awaiting approval".
 *
 * What this patch does:
 * In the approval onRequest handler, before pushing the new request:
 * 1) drop any request with the same request id
 * 2) drop any request with the same method + itemId
 *
 * Usage:
 *   node scripts/patch-approval-queue.js
 *   node scripts/patch-approval-queue.js --check
 */
const fs = require("fs");
const path = require("path");

function locateBundle() {
  const assetsDir = path.join(__dirname, "..", "src", "webview", "assets");
  if (!fs.existsSync(assetsDir)) {
    console.error("Assets directory not found:", assetsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(assetsDir).filter((f) => /^index-.*\.js$/.test(f));
  if (files.length !== 1) {
    console.error("Expected exactly one index-*.js bundle, found:", files);
    process.exit(1);
  }

  return path.join(assetsDir, files[0]);
}

const BEFORE =
  'this.updateConversationState(o,a=>{a.requests.push(e),a.hasUnreadTurn=!0}),this.approvalRequestListeners.forEach';

const AFTER =
  'this.updateConversationState(o,a=>{const l=typeof i.itemId=="string"?i.itemId:null;a.requests=a.requests.filter(c=>c.id!==n&&!(c.method===r&&l!=null&&c.params?.itemId===l)),a.requests.push(e),a.hasUnreadTurn=!0}),this.approvalRequestListeners.forEach';

function main() {
  const isCheck = process.argv.includes("--check");
  const bundlePath = locateBundle();
  const relPath = path.relative(path.join(__dirname, ".."), bundlePath);
  const source = fs.readFileSync(bundlePath, "utf8");

  const hasBefore = source.includes(BEFORE);
  const hasAfter = source.includes(AFTER);

  if (isCheck) {
    if (hasAfter) {
      console.log(`OK: approval queue patch present in ${relPath}`);
      return;
    }
    if (hasBefore) {
      console.log(`MISSING: approval queue patch not applied in ${relPath}`);
      process.exit(1);
    }
    console.log(`UNKNOWN: expected target snippet not found in ${relPath}`);
    process.exit(1);
  }

  if (hasAfter) {
    console.log(`No changes: approval queue patch already applied (${relPath})`);
    return;
  }

  if (!hasBefore) {
    console.error(`Patch target not found in ${relPath}; bundle layout likely changed`);
    process.exit(1);
  }

  const patched = source.replace(BEFORE, AFTER);
  fs.writeFileSync(bundlePath, patched);
  console.log(`Patched approval request queue in ${relPath}`);
}

main();
