/**
 * Post-build patch: serialize approval prompts (one active at a time).
 *
 * Why:
 * Multiple concurrent approval requests can arrive for a single turn. Rendering
 * all of them at once causes unstable UX and can leave threads stuck in an
 * "awaiting approval" state.
 *
 * What this patch does:
 * In the turn-item projection that maps `requests -> UI items`, only the first
 * approval request (command/file) is materialized. Remaining approval requests
 * stay queued in conversation state and become visible after the current one is
 * resolved.
 *
 * Usage:
 *   node scripts/patch-approval-serialization.js
 *   node scripts/patch-approval-serialization.js --check
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

const REPLACEMENTS = [
  {
    before:
      'for(const a of e)switch(a.method){case"item/commandExecution/requestApproval":{',
    after:
      'let z0=!1;for(const a of e){if(z0&&(a.method==="item/commandExecution/requestApproval"||a.method==="item/fileChange/requestApproval"))continue;switch(a.method){case"item/commandExecution/requestApproval":{',
  },
  {
    before:
      'n.push({type:"exec",callId:c.itemId,cwd:t.params?.cwd?t.params.cwd:null,cmd:h.length>0?h:[f],approvalReason:c.reason,proposedExecpolicyAmendment:c.proposedExecpolicyAmendment,parsedCmd:Ice(g,!1),output:null,approvalRequestId:l});break}case"item/fileChange/requestApproval":{',
    after:
      'n.push({type:"exec",callId:c.itemId,cwd:t.params?.cwd?t.params.cwd:null,cmd:h.length>0?h:[f],approvalReason:c.reason,proposedExecpolicyAmendment:c.proposedExecpolicyAmendment,parsedCmd:Ice(g,!1),output:null,approvalRequestId:l}),z0=!0;break}case"item/fileChange/requestApproval":{',
  },
  {
    before:
      'd?(d.approvalRequestId=u,d.grantRoot=c.grantRoot?c.grantRoot:null):Ot.warning(`Patch approval for unknown itemId ${c.itemId}; skipping attachment`);break}case"item/tool/requestUserInput":{',
    after:
      'd?(d.approvalRequestId=u,d.grantRoot=c.grantRoot?c.grantRoot:null):Ot.warning(`Patch approval for unknown itemId ${c.itemId}; skipping attachment`),z0=!0;break}case"item/tool/requestUserInput":{',
  },
  {
    before:
      'case"applyPatchApproval":case"execCommandApproval":{Ot.warning(`Ignoring legacy approval request method: ${a.method}`);break}}const s=Sot(t.status);',
    after:
      'case"applyPatchApproval":case"execCommandApproval":{Ot.warning(`Ignoring legacy approval request method: ${a.method}`);break}}}const s=Sot(t.status);',
  },
];

function main() {
  const isCheck = process.argv.includes("--check");
  const bundlePath = locateBundle();
  const relPath = path.relative(path.join(__dirname, ".."), bundlePath);
  let source = fs.readFileSync(bundlePath, "utf8");

  const allAfter = REPLACEMENTS.every((r) => source.includes(r.after));
  if (isCheck) {
    if (allAfter) {
      console.log(`OK: approval serialization patch present in ${relPath}`);
      return;
    }
    const missingTargets = REPLACEMENTS.filter(
      (r) => !source.includes(r.before) && !source.includes(r.after)
    ).length;
    if (missingTargets > 0) {
      console.log(`UNKNOWN: expected target snippet(s) not found in ${relPath}`);
      process.exit(1);
    }
    console.log(`MISSING: approval serialization patch not fully applied in ${relPath}`);
    process.exit(1);
  }

  if (allAfter) {
    console.log(`No changes: approval serialization patch already applied (${relPath})`);
    return;
  }

  for (const r of REPLACEMENTS) {
    if (source.includes(r.after)) {
      continue;
    }
    if (!source.includes(r.before)) {
      console.error(`Patch target not found in ${relPath}; bundle layout likely changed`);
      process.exit(1);
    }
    source = source.replace(r.before, r.after);
  }

  fs.writeFileSync(bundlePath, source);
  console.log(`Patched approval prompt serialization in ${relPath}`);
}

main();
