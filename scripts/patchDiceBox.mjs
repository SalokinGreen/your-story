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
// Runs as a postinstall step so the patch survives `npm install`, and has to
// be safe to run repeatedly against an *already patched* tree: CI hosts
// (Vercel among them) restore node_modules from a build cache, so npm has
// nothing to re-extract and postinstall sees the previous run's output. That
// means it can't work by matching pristine source - instead it locates
// rollDie() structurally and replaces whatever body is there, so a pristine
// worker, a worker carrying an older revision of this patch, and one already
// carrying the current patch all converge on the same result.
//
// If dice-box changes its build/minification (a version bump), rollDie() stops
// being recognizable and this script throws rather than silently leaving the
// dependency unpatched - see the error messages for what to re-derive.

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
// Identifies a body this script wrote. Any of our patches (current or older)
// contains PATCH_TAG; only the current one contains PATCH_VERSION.
const PATCH_TAG = "customThrowVelocity";
const PATCH_VERSION = "ysThrowPatch2";

// rollDie() in @3d-dice/dice-box@1.1.4's embedded physics worker, as
// `<separator>ge=_=>{<body>},Be=_=>{`. Anchoring on a leading `,`/`;` is what
// keeps this off `self.onmessage=_=>{`, whose name also ends in "ge". Variable
// names (p=config, d=Ammo, P=setVector3, dt=lerp) come from that specific
// build's minifier output.
const ROLL_DIE_RE = /([,;])ge=_=>\{([\s\S]*?)\},Be=_=>\{/;

// The pristine body, used only to tell "dice-box we recognize" apart from "a
// version bump we don't". The replacement below reproduces it verbatim in its
// fallback branches, which is what makes replacing an older patch lossless -
// this script never needs to recover the original text from the file.
const PRISTINE_BODY =
  "_.setLinearVelocity(P(dt(-p.startPosition[0]*.5,-p.startPosition[0]*p.throwForce,Math.random()),dt(-p.startPosition[1],-p.startPosition[1]*2,Math.random()),dt(-p.startPosition[2]*.5,-p.startPosition[2]*p.throwForce,Math.random())));const t=Math.random()>.5?1:-1,f=dt(p.spinForce*.5,p.spinForce,Math.random()),g=new d.btVector3(f*t,f*-t,f*t),j=Math.abs(p.scale-1)+p.scale*p.scale*(_.mass/p.mass)*.75;_.applyImpulse(g,P(j,j,j))";

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
const PATCHED_BODY =
  `/*${PATCH_VERSION}*/` +
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
  "_.applyImpulse(g,P(j,j,j))";

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

  const rollDie = blob.decoded.match(ROLL_DIE_RE);
  if (!rollDie) {
    throw new Error(
      "patchDiceBox: couldn't locate rollDie() in the decoded physics worker " +
        "(expected `,ge=_=>{...},Be=_=>{`). dice-box's build output has likely " +
        "changed - re-derive ROLL_DIE_RE in scripts/patchDiceBox.mjs against the new build."
    );
  }

  const [, separator, body] = rollDie;

  if (body === PATCHED_BODY) {
    // Already current - the usual case on a CI host that restored node_modules
    // from cache, and on any second run.
    console.log("patchDiceBox: already patched, skipping.");
    return;
  }

  const isPristine = body === PRISTINE_BODY;
  const isOlderPatch = body.includes(PATCH_TAG);
  if (!isPristine && !isOlderPatch) {
    throw new Error(
      "patchDiceBox: rollDie() in the decoded physics worker is neither the expected " +
        "@3d-dice/dice-box@1.1.4 source nor a body this script wrote. The library version " +
        "likely changed - re-derive PRISTINE_BODY/PATCHED_BODY in scripts/patchDiceBox.mjs " +
        "against the new build."
    );
  }

  const patchedDecoded = blob.decoded.replace(
    ROLL_DIE_RE,
    // $-sequences are meaningful in a replacement string and the body contains
    // none by luck rather than design, so pass a function instead.
    () => `${separator}ge=_=>{${PATCHED_BODY}},Be=_=>{`
  );
  const patchedBase64 = Buffer.from(patchedDecoded, "utf8").toString("base64");
  const patchedSource = source.replace(blob.full, `"${patchedBase64}"`);

  fs.writeFileSync(targetPath, patchedSource);
  console.log(
    isOlderPatch
      ? "patchDiceBox: replaced an older patch with the current gesture-driven throw."
      : "patchDiceBox: patched physics worker for gesture-driven throws."
  );
}

main();
