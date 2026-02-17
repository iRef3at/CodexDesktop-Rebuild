/**
 * Post-build patch: auto-advance approval queue.
 *
 * Behavior:
 * - If an approval request arrives while another approval is already pending,
 *   automatically answer the previous one with decision "acceptForSession"
 *   (the "2" option), then keep/show the newest one.
 *
 * This implements a strict "one visible approval at a time" flow while
 * auto-permitting the approval that was previously on screen.
 *
 * Usage:
 *   node scripts/patch-approval-auto-advance.js
 *   node scripts/patch-approval-auto-advance.js --check
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

const TARGETS = [
  {
    // Baseline (without patch-approval-queue)
    before:
      'this.updateConversationState(o,a=>{a.requests.push(e),a.hasUnreadTurn=!0}),this.approvalRequestListeners.forEach',
    after:
      'this.updateConversationState(o,a=>{const P0=a.requests.find(l=>l.method==="item/commandExecution/requestApproval"||l.method==="item/fileChange/requestApproval")??null;a.requests.push(e),a.hasUnreadTurn=!0,P0&&(Yt.dispatchMessage("mcp-response",{response:{id:P0.id,result:{decision:"acceptForSession"}}}),a.requests=a.requests.filter(l=>l.id!==P0.id))}),this.approvalRequestListeners.forEach',
  },
  {
    // After patch-approval-queue dedupe rewrite
    before:
      'this.updateConversationState(o,a=>{const l=typeof i.itemId=="string"?i.itemId:null;a.requests=a.requests.filter(c=>c.id!==n&&!(c.method===r&&l!=null&&c.params?.itemId===l)),a.requests.push(e),a.hasUnreadTurn=!0}),this.approvalRequestListeners.forEach',
    after:
      'this.updateConversationState(o,a=>{const l=typeof i.itemId=="string"?i.itemId:null,P0=a.requests.find(u=>u.method==="item/commandExecution/requestApproval"||u.method==="item/fileChange/requestApproval")??null;a.requests=a.requests.filter(c=>c.id!==n&&!(c.method===r&&l!=null&&c.params?.itemId===l)),a.requests.push(e),a.hasUnreadTurn=!0,P0&&(Yt.dispatchMessage("mcp-response",{response:{id:P0.id,result:{decision:"acceptForSession"}}}),a.requests=a.requests.filter(u=>u.id!==P0.id))}),this.approvalRequestListeners.forEach',
  },
];

function main() {
  const isCheck = process.argv.includes("--check");
  const bundlePath = locateBundle();
  const relPath = path.relative(path.join(__dirname, ".."), bundlePath);
  let source = fs.readFileSync(bundlePath, "utf8");

  const hasPatched = TARGETS.some((t) => source.includes(t.after));
  const hasTarget = TARGETS.some((t) => source.includes(t.before));

  if (isCheck) {
    if (hasPatched) {
      console.log(`OK: approval auto-advance patch present in ${relPath}`);
      return;
    }
    if (!hasTarget) {
      console.log(`UNKNOWN: expected approval target snippet not found in ${relPath}`);
      process.exit(1);
    }
    console.log(`MISSING: approval auto-advance patch not applied in ${relPath}`);
    process.exit(1);
  }

  if (hasPatched) {
    console.log(`No changes: approval auto-advance patch already applied (${relPath})`);
    return;
  }

  for (const t of TARGETS) {
    if (source.includes(t.before)) {
      source = source.replace(t.before, t.after);
      fs.writeFileSync(bundlePath, source);
      console.log(`Patched approval auto-advance in ${relPath}`);
      return;
    }
  }

  console.error(`Patch target not found in ${relPath}; bundle layout likely changed`);
  process.exit(1);
}

main();
