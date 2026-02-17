/**
 * Post-build patch: auto-approve read command approvals.
 *
 * Behavior:
 * - For `item/commandExecution/requestApproval` with read-only commandActions
 *   (`read`, `listFiles`, `search`), immediately respond with
 *   `decision: "acceptForSession"` (option 2) and do not leave a pending UI
 *   approval.
 * - Write/file-change approvals continue to wait for user input.
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

const AFTER_BASE =
  'const o=s,A0=Array.isArray(i.commandActions)&&i.commandActions.length>0&&i.commandActions.every(l=>l&&(l.type==="read"||l.type==="listFiles"||l.type==="search"));if(r==="item/commandExecution/requestApproval"&&A0){Yt.dispatchMessage("mcp-response",{response:{id:n,result:{decision:"acceptForSession"}}});break}this.updateConversationState(o,a=>{a.requests.push(e),a.hasUnreadTurn=!0}),this.approvalRequestListeners.forEach';

const AFTER_DEDUPE =
  'const o=s,A0=Array.isArray(i.commandActions)&&i.commandActions.length>0&&i.commandActions.every(l=>l&&(l.type==="read"||l.type==="listFiles"||l.type==="search"));if(r==="item/commandExecution/requestApproval"&&A0){Yt.dispatchMessage("mcp-response",{response:{id:n,result:{decision:"acceptForSession"}}});break}this.updateConversationState(o,a=>{const l=typeof i.itemId=="string"?i.itemId:null;a.requests=a.requests.filter(c=>c.id!==n&&!(c.method===r&&l!=null&&c.params?.itemId===l)),a.requests.push(e),a.hasUnreadTurn=!0}),this.approvalRequestListeners.forEach';

const TARGETS = [
  // Baseline (no approval-queue patch)
  {
    before:
      'const o=s;this.updateConversationState(o,a=>{a.requests.push(e),a.hasUnreadTurn=!0}),this.approvalRequestListeners.forEach',
    after: AFTER_BASE,
  },
  // With approval-queue dedupe patch
  {
    before:
      'const o=s;this.updateConversationState(o,a=>{const l=typeof i.itemId=="string"?i.itemId:null;a.requests=a.requests.filter(c=>c.id!==n&&!(c.method===r&&l!=null&&c.params?.itemId===l)),a.requests.push(e),a.hasUnreadTurn=!0}),this.approvalRequestListeners.forEach',
    after: AFTER_DEDUPE,
  },
  // Previously patched auto-advance (baseline)
  {
    before:
      'const o=s;this.updateConversationState(o,a=>{const P0=a.requests.find(l=>l.method==="item/commandExecution/requestApproval"||l.method==="item/fileChange/requestApproval")??null;a.requests.push(e),a.hasUnreadTurn=!0,P0&&(Yt.dispatchMessage("mcp-response",{response:{id:P0.id,result:{decision:"acceptForSession"}}}),a.requests=a.requests.filter(l=>l.id!==P0.id))}),this.approvalRequestListeners.forEach',
    after: AFTER_BASE,
  },
  // Previously patched auto-advance (with dedupe)
  {
    before:
      'const o=s;this.updateConversationState(o,a=>{const l=typeof i.itemId=="string"?i.itemId:null,P0=a.requests.find(u=>u.method==="item/commandExecution/requestApproval"||u.method==="item/fileChange/requestApproval")??null;a.requests=a.requests.filter(c=>c.id!==n&&!(c.method===r&&l!=null&&c.params?.itemId===l)),a.requests.push(e),a.hasUnreadTurn=!0,P0&&(Yt.dispatchMessage("mcp-response",{response:{id:P0.id,result:{decision:"acceptForSession"}}}),a.requests=a.requests.filter(u=>u.id!==P0.id))}),this.approvalRequestListeners.forEach',
    after: AFTER_DEDUPE,
  },
];

function main() {
  const isCheck = process.argv.includes("--check");
  const bundlePath = locateBundle();
  const relPath = path.relative(path.join(__dirname, ".."), bundlePath);
  let source = fs.readFileSync(bundlePath, "utf8");

  const hasPatched = source.includes(A0_MARKER());
  const hasTarget = TARGETS.some((t) => source.includes(t.before));

  if (isCheck) {
    if (hasPatched) {
      console.log(`OK: read-command auto-approval patch present in ${relPath}`);
      return;
    }
    if (!hasTarget) {
      console.log(`UNKNOWN: expected approval target snippet not found in ${relPath}`);
      process.exit(1);
    }
    console.log(`MISSING: read-command auto-approval patch not applied in ${relPath}`);
    process.exit(1);
  }

  if (hasPatched) {
    console.log(`No changes: read-command auto-approval patch already applied (${relPath})`);
    return;
  }

  for (const t of TARGETS) {
    if (source.includes(t.before)) {
      source = source.replace(t.before, t.after);
      fs.writeFileSync(bundlePath, source);
      console.log(`Patched read-command auto-approval in ${relPath}`);
      return;
    }
  }

  console.error(`Patch target not found in ${relPath}; bundle layout likely changed`);
  process.exit(1);
}

function A0_MARKER() {
  return 'A0=Array.isArray(i.commandActions)&&i.commandActions.length>0&&i.commandActions.every(l=>l&&(l.type==="read"||l.type==="listFiles"||l.type==="search"))';
}

main();
