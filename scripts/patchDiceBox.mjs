#!/usr/bin/env node
// Patches @3d-dice/dice-box's bundled physics worker so a roll can be
// thrown with a caller-supplied velocity/spin (from a drag/flick gesture)
// instead of always using the library's internal Math.random() throw.
//
// dice-box embeds its physics worker as a base64 data: URL string literal
// inside dist/dice-box.es.js (see the `new Worker("data:application/
// javascript;base64," + ...)` fallback path), so there's no plain-text
// worker file to patch directly - this script decodes that blob, patches
// the rollDie() function, and re-encodes it back into place.
//
// Runs as a postinstall step so the patch survives `npm install`. If
// dice-box changes its build/minification (a version bump), the exact
// string match below will stop matching and this script throws instead
// of silently leaving the dependency unpatched - see the error message
// for what to re-derive.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetPath = path.join(
  __dirname,
  "..",
  "node_modules/@3d-dice/dice-box/dist/dice-box.es.js"
);

const MARKER = "applyImpulse";
// Bumped whenever NEW_ROLL_DIE below changes, so an already-patched (but
// stale) copy in node_modules is reported instead of silently kept.
const PATCH_MARKER = "ysThrowPatch2";

// The exact minified rollDie() body from @3d-dice/dice-box@1.1.4's
// embedded physics worker. Variable names (p=config, d=Ammo, P=setVector3,
// dt=lerp) come from that specific build's minifier output.
const OLD_ROLL_DIE =
  'ge=_=>{_.setLinearVelocity(P(dt(-p.startPosition[0]*.5,-p.startPosition[0]*p.throwForce,Math.random()),dt(-p.startPosition[1],-p.startPosition[1]*2,Math.random()),dt(-p.startPosition[2]*.5,-p.startPosition[2]*p.throwForce,Math.random())));const t=Math.random()>.5?1:-1,f=dt(p.spinForce*.5,p.spinForce,Math.random()),g=new d.btVector3(f*t,f*-t,f*t),j=Math.abs(p.scale-1)+p.scale*p.scale*(_.mass/p.mass)*.75;_.applyImpulse(g,P(j,j,j))}';

// Replacement rollDie(). When the app supplies customThrowVelocity /
// customThrowSpin (a drag-driven throw), they are applied as the die's initial
// linear / angular velocity; otherwise dice-box's own randomized throw runs
// exactly as before.
//
// Each die gets its own small spread (`Zs` power scale, `Za` heading rotation)
// around the supplied aim. Every die in a group spawns at the same
// startPosition, so without that they would fly in lockstep and grind into
// each other - dice-box's built-in throw randomizes per die for the same
// reason.
//
// Note customThrowSpin is an angular *velocity*, not the off-center impulse
// the unpatched code uses for spin: that impulse's torque depends on the die's
// mass/scale-derived offset (and leaks into linear velocity), which makes a
// gesture-aimed tumble impossible to express. The unpatched branch below keeps
// using the impulse so default rolls are unchanged.
const NEW_ROLL_DIE =
  "ge=_=>{/*ysThrowPatch2*/" +
  "const Zs=.85+Math.random()*.3,Za=(Math.random()-.5)*.35,Zc=Math.cos(Za),Zn=Math.sin(Za);" +
  "if(p.customThrowVelocity){" +
  "const c=p.customThrowVelocity;" +
  "_.setLinearVelocity(P((c[0]*Zc-c[2]*Zn)*Zs,c[1]*Zs,(c[0]*Zn+c[2]*Zc)*Zs))" +
  "}else{" +
  "_.setLinearVelocity(P(dt(-p.startPosition[0]*.5,-p.startPosition[0]*p.throwForce,Math.random()),dt(-p.startPosition[1],-p.startPosition[1]*2,Math.random()),dt(-p.startPosition[2]*.5,-p.startPosition[2]*p.throwForce,Math.random())))" +
  "}" +
  "if(p.customThrowSpin){" +
  "const s=p.customThrowSpin;" +
  "_.setAngularVelocity(P((s[0]*Zc-s[2]*Zn)*Zs,s[1]*Zs,(s[0]*Zn+s[2]*Zc)*Zs));" +
  "return" +
  "}" +
  "const t=Math.random()>.5?1:-1,f=dt(p.spinForce*.5,p.spinForce,Math.random()),g=new d.btVector3(f*t,f*-t,f*t),j=Math.abs(p.scale-1)+p.scale*p.scale*(_.mass/p.mass)*.75;" +
  "_.applyImpulse(g,P(j,j,j))}";

function findWorkerBlobLiteral(source) {
  // Long double-quoted string literals - candidates for the base64-encoded
  // worker blob. Requires no escaped quotes inside (true for base64).
  const stringLiteralRe = /"([A-Za-z0-9+/=]{2000,})"/g;
  let match;
  while ((match = stringLiteralRe.exec(source))) {
    const [full, base64] = match;
    let decoded;
    try {
      decoded = Buffer.from(base64, "base64").toString("utf8");
    } catch {
      continue;
    }
    if (decoded.includes(MARKER)) {
      return { full, base64, decoded, index: match.index };
    }
  }
  return null;
}

function main() {
  if (!fs.existsSync(targetPath)) {
    throw new Error(
      `patchDiceBox: expected file not found at ${targetPath}. Is @3d-dice/dice-box installed?`
    );
  }

  const source = fs.readFileSync(targetPath, "utf8");

  const blob = findWorkerBlobLiteral(source);
  if (!blob) {
    throw new Error(
      "patchDiceBox: couldn't locate the base64-embedded physics worker blob " +
        `inside ${targetPath} (no string literal decodes to something containing "${MARKER}"). ` +
        "dice-box's build output has likely changed - re-derive the patch (see scripts/patchDiceBox.mjs)."
    );
  }

  if (blob.decoded.includes(PATCH_MARKER)) {
    console.log("patchDiceBox: already patched, skipping.");
    return;
  }

  if (blob.decoded.includes("customThrowVelocity")) {
    // An older revision of this script already rewrote rollDie(), so the
    // pristine source it matches on is gone. npm re-extracts the package on
    // install, so this only happens when the script is re-run against a
    // previously patched tree.
    throw new Error(
      "patchDiceBox: found an older version of this patch already applied. " +
        "Reinstall the dependency to restore the pristine source first: " +
        "rm -rf node_modules/@3d-dice/dice-box && npm install"
    );
  }

  if (!blob.decoded.includes(OLD_ROLL_DIE)) {
    throw new Error(
      "patchDiceBox: rollDie() in the decoded physics worker doesn't match the expected " +
        "@3d-dice/dice-box@1.1.4 source. The library version likely changed - re-derive " +
        "OLD_ROLL_DIE/NEW_ROLL_DIE in scripts/patchDiceBox.mjs against the new build."
    );
  }

  const patchedDecoded = blob.decoded.replace(OLD_ROLL_DIE, NEW_ROLL_DIE);
  const patchedBase64 = Buffer.from(patchedDecoded, "utf8").toString("base64");
  const patchedSource = source.replace(blob.full, `"${patchedBase64}"`);

  fs.writeFileSync(targetPath, patchedSource);
  console.log("patchDiceBox: patched physics worker for gesture-driven throws.");
}

main();
