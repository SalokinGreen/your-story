#!/usr/bin/env node
// Patches @3d-dice/dice-box's bundled physics worker so the app can put the
// dice in the player's hand: the dice can be *held* under the pointer and
// dragged around the tray, then thrown with the hand's own velocity when it
// lets go, instead of always using the library's internal Math.random() throw.
//
// dice-box embeds its physics worker as a base64 data: URL string literal
// inside dist/dice-box.es.js (see the `new Worker("data:application/
// javascript;base64," + ...)` fallback path), so there's no plain-text
// worker file to patch directly - this script decodes that blob, applies the
// edits below, and re-encodes it back into place.
//
// Three edits, all inside that worker:
//
//   1. rollDie()  - a die spawned while the hand is closed is marked held and
//                   born at rest instead of being thrown; a die spawned with a
//                   custom throw set (the app's release, or a die that spawned
//                   a frame too late to be caught) gets that throw applied.
//   2. stepSim()  - each physics step, a held die is servo-driven toward the
//                   hand and is exempt from the settle check, so a drag that
//                   pauses can't be mistaken for dice coming to rest and
//                   resolve the roll early.
//   3. a control channel - a BroadcastChannel the app posts grab/move/release
//                   messages on. dice-box exposes no way to reach the physics
//                   worker per frame (its own updateConfig path rebuilds the
//                   tray walls on every call, which is far too heavy at
//                   pointer-move rate), so the worker opens its own channel.
//
// Runs as a postinstall step so the patch survives `npm install`, and has to
// be safe to run repeatedly against an *already patched* tree: CI hosts
// (Vercel among them) restore node_modules from a build cache, so npm has
// nothing to re-extract and postinstall sees the previous run's output. That
// means it can't work by matching pristine source - instead it locates each
// function structurally and replaces whatever body is there, so a pristine
// worker, a worker carrying an older revision of this patch, and one already
// carrying the current patch all converge on the same result.
//
// If dice-box changes its build/minification (a version bump), the functions
// stop being recognizable and this script throws rather than silently leaving
// the dependency unpatched - see the error messages for what to re-derive.

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
// contains one of these tags.
const PATCH_TAGS = ["customThrowVelocity", "ysGrab"];

// The name the worker and the app agree to talk over. Must match
// DICE_CONTROL_CHANNEL in app/misc/diceControlChannel.ts.
const CONTROL_CHANNEL = "ys-dice-control";

// Minified variable names below (p=config, d=Ammo, P=setVector3, dt=lerp,
// Z=physics world, wt=awake bodies, zt=sleeping bodies, k=the transform buffer
// shared with the renderer, $t=scratch btTransform, he=zero btVector3) all
// come from @3d-dice/dice-box@1.1.4's specific minifier output.

// rollDie(), as `<separator>ge=_=>{<body>},Be=_=>{`. Anchoring on a leading
// `,`/`;` is what keeps this off `self.onmessage=_=>{`, whose name also ends
// in "ge".
const ROLL_DIE_RE = /([,;])ge=_=>\{([\s\S]*?)\},Be=_=>\{/;
// The per-step body update, as `<separator>Tl=_=>{<body>};let Pe=new Date()`.
const STEP_RE = /([,;])Tl=_=>\{([\s\S]*?)\};let Pe=new Date\(\)\.getTime\(\)/;
// The tail of the worker's top-level IIFE, which is where the control channel
// is injected - it needs the IIFE's scope to reach `p`, `wt` and `P`.
const IIFE_TAIL_RE = /(\[k\.buffer\]\)\)\})(\}\)\(\);?\s*)$/;
// Delimits the injected control channel, so a re-run can lift out whatever
// revision is already there before writing the current one.
const CONTROL_BLOCK_RE = /\/\*ysControl\d+\*\/[\s\S]*?\/\*endYsControl\*\//;

// The pristine bodies, used only to tell "dice-box we recognize" apart from "a
// version bump we don't". The replacements below reproduce them verbatim in
// their fallback branches, which is what makes replacing an older patch
// lossless - this script never needs to recover the original text from the
// file.
const PRISTINE_ROLL_DIE =
  "_.setLinearVelocity(P(dt(-p.startPosition[0]*.5,-p.startPosition[0]*p.throwForce,Math.random()),dt(-p.startPosition[1],-p.startPosition[1]*2,Math.random()),dt(-p.startPosition[2]*.5,-p.startPosition[2]*p.throwForce,Math.random())));const t=Math.random()>.5?1:-1,f=dt(p.spinForce*.5,p.spinForce,Math.random()),g=new d.btVector3(f*t,f*-t,f*t),j=Math.abs(p.scale-1)+p.scale*p.scale*(_.mass/p.mass)*.75;_.applyImpulse(g,P(j,j,j))";

const PRISTINE_STEP =
  "const t=_/1e3;Z.stepSimulation(t,2,1/90),k[0]=wt.length;for(let f=wt.length-1;f>=0;f--){const g=wt[f],j=g.getLinearVelocity().length(),V=g.getAngularVelocity().length();if(j<.01&&V<.005||g.timeout<0){k[f*8+1]=g.id,k[f*8+2]=-1,g.asleep=!0,g.setMassProps(0),g.forceActivationState(3),g.setLinearVelocity(he),g.setAngularVelocity(he),zt.push(wt.splice(f,1)[0]);continue}g.timeout-=_;const X=g.getMotionState();if(X){X.getWorldTransform($t);let U=$t.getOrigin(),G=$t.getRotation(),v=f*8+1;k[v]=g.id,k[v+1]=U.x(),k[v+2]=U.y(),k[v+3]=U.z(),k[v+4]=G.x(),k[v+5]=G.y(),k[v+6]=G.z(),k[v+7]=G.w()}}";

// Applies a caller-supplied throw to one body. Every die in a roll is let go
// from the same hand, so without a per-die spread (`a` power scale, `r`
// heading rotation) they would fly in lockstep and grind into each other -
// dice-box's built-in throw randomizes per die for the same reason.
//
// Note the spin is an angular *velocity*, not the off-center impulse the
// unpatched code uses: that impulse's torque depends on the die's mass/scale
// derived offset (and leaks into linear velocity), which makes an aimed tumble
// impossible to express. A release with no spin leaves the die turning however
// the hand left it, which is what letting go of dice actually looks like.
const APPLY_THROW =
  "const ysThrow=(b,v,s)=>{" +
  "const a=.85+Math.random()*.3,r=(Math.random()-.5)*.35,c=Math.cos(r),n=Math.sin(r);" +
  "b.setLinearVelocity(P((v[0]*c-v[2]*n)*a,v[1]*a,(v[0]*n+v[2]*c)*a));" +
  "s?b.setAngularVelocity(P((s[0]*c-s[2]*n)*a,s[1]*a,(s[0]*n+s[2]*c)*a))" +
  ":b.setAngularVelocity(P((Math.random()-.5)*6,(Math.random()-.5)*6,(Math.random()-.5)*6))" +
  "};";

// Replacement rollDie().
const PATCHED_ROLL_DIE =
  "/*ysThrowPatch3*/" +
  // Held: born at rest with its own offset within the handful, and a light
  // random tumble so the dice turn over in the hand rather than hanging there
  // like a frozen render.
  "if(p.ysGrab){" +
  "const r=p.ysGrab.spread;" +
  "_.ysGrab=[(Math.random()-.5)*r,(Math.random()-.5)*r*.4,(Math.random()-.5)*r];" +
  "_.setLinearVelocity(P(0,0,0));" +
  "_.setAngularVelocity(P((Math.random()-.5)*6,(Math.random()-.5)*6,(Math.random()-.5)*6));" +
  "return" +
  "}" +
  // Thrown by the app (a release that landed before this die spawned).
  "if(p.customThrowVelocity){" +
  APPLY_THROW +
  "ysThrow(_,p.customThrowVelocity,p.customThrowSpin);" +
  "return" +
  "}" +
  // Otherwise dice-box's own randomized throw, unchanged.
  PRISTINE_ROLL_DIE;

// Replacement per-step body update.
const PATCHED_STEP =
  "/*ysStepPatch1*/" +
  "const t=_/1e3;Z.stepSimulation(t,2,1/90),k[0]=wt.length;" +
  "for(let f=wt.length-1;f>=0;f--){" +
  "const g=wt[f];" +
  "let Zh=!1;" +
  // A held die is steered toward its place in the hand each step. Driving it
  // by velocity rather than teleporting the body is what lets the dice knock
  // against each other and the tray walls while they're being carried.
  "if(g.ysGrab)" +
  "if(p.ysGrab){" +
  "Zh=!0;" +
  "const Zm=g.getMotionState();" +
  "if(Zm){" +
  "Zm.getWorldTransform($t);" +
  "const Zo=$t.getOrigin(),Zt=p.ysGrab.target;" +
  "let Zx=(Zt[0]+g.ysGrab[0]-Zo.x())*p.ysGrab.stiffness," +
  "Zy=(Zt[1]+g.ysGrab[1]-Zo.y())*p.ysGrab.stiffness," +
  "Zz=(Zt[2]+g.ysGrab[2]-Zo.z())*p.ysGrab.stiffness;" +
  "const Zl=Math.sqrt(Zx*Zx+Zy*Zy+Zz*Zz);" +
  "if(Zl>p.ysGrab.maxSpeed){const Zk=p.ysGrab.maxSpeed/Zl;Zx*=Zk,Zy*=Zk,Zz*=Zk}" +
  "g.setLinearVelocity(P(Zx,Zy,Zz))" +
  "}" +
  // Held dice must not run out their settle timeout either: a long drag is
  // not a roll that has hung.
  "g.timeout=p.settleTimeout" +
  "}else g.ysGrab=null;" +
  "const j=g.getLinearVelocity().length(),V=g.getAngularVelocity().length();" +
  // The settle check, skipped while held - a hand holding still is not a die
  // that has come to rest, and letting it sleep here would resolve the roll
  // mid-drag.
  "if(!Zh&&(j<.01&&V<.005||g.timeout<0)){" +
  "k[f*8+1]=g.id,k[f*8+2]=-1,g.asleep=!0,g.setMassProps(0),g.forceActivationState(3)," +
  "g.setLinearVelocity(he),g.setAngularVelocity(he),zt.push(wt.splice(f,1)[0]);" +
  "continue" +
  "}" +
  "Zh||(g.timeout-=_);" +
  "const X=g.getMotionState();" +
  "if(X){X.getWorldTransform($t);let U=$t.getOrigin(),G=$t.getRotation(),v=f*8+1;" +
  "k[v]=g.id,k[v+1]=U.x(),k[v+2]=U.y(),k[v+3]=U.z(),k[v+4]=G.x(),k[v+5]=G.y(),k[v+6]=G.z(),k[v+7]=G.w()}" +
  "}";

// The control channel, injected at the end of the worker's IIFE so it can see
// the worker's own `p` (config), `wt` (awake bodies) and `P` (vector helper).
//
// Everything here is wrapped so that a browser without BroadcastChannel simply
// never answers the app's handshake, and the app falls back to throwing the
// dice on release without the held phase.
const CONTROL_BLOCK =
  "/*ysControl1*/;(()=>{" +
  'if(typeof BroadcastChannel!="function")return;' +
  "let ch;" +
  `try{ch=new BroadcastChannel(${JSON.stringify(CONTROL_CHANNEL)})}catch(e){return}` +
  APPLY_THROW +
  "ch.onmessage=e=>{" +
  "const m=e.data||{};" +
  "switch(m.action){" +
  // Handshake: the app only enters the held phase if the worker answers.
  'case"ys-ping":ch.postMessage({action:"ys-ready",id:m.id});break;' +
  // Close the hand. Dice spawned from here on are born held (see rollDie).
  'case"ys-grab":' +
  "p.ysGrab={target:m.target,stiffness:m.stiffness,maxSpeed:m.maxSpeed,spread:m.spread}," +
  "p.customThrowVelocity=null,p.customThrowSpin=null," +
  'ch.postMessage({action:"ys-grabbed",id:m.id});' +
  "break;" +
  'case"ys-move":p.ysGrab&&(p.ysGrab.target=m.target);break;' +
  // Open the hand: every die currently held leaves with the hand's velocity,
  // and any die still spawning gets the same throw via rollDie.
  'case"ys-release":' +
  "p.ysGrab=null,p.customThrowVelocity=m.velocity,p.customThrowSpin=m.spin," +
  "m.position&&(p.startPosition=m.position)," +
  "wt.forEach(b=>{b.ysGrab&&(b.ysGrab=null,ysThrow(b,m.velocity,m.spin))});" +
  "break" +
  "}" +
  "}" +
  "})();/*endYsControl*/";

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

/**
 * Swaps the body of one recognized function for ours, whatever revision of it
 * is in there now.
 */
function replaceBody(decoded, { name, re, pristine, patched, rebuild }) {
  const match = decoded.match(re);
  if (!match) {
    throw new Error(
      `patchDiceBox: couldn't locate ${name} in the decoded physics worker ` +
        `(expected ${re}). dice-box's build output has likely changed - re-derive ` +
        "the regexes in scripts/patchDiceBox.mjs against the new build."
    );
  }

  const [, separator, body] = match;
  const isOurs = PATCH_TAGS.some((tag) => body.includes(tag));
  if (body !== pristine && !isOurs) {
    throw new Error(
      `patchDiceBox: ${name} in the decoded physics worker is neither the expected ` +
        "@3d-dice/dice-box@1.1.4 source nor a body this script wrote. The library version " +
        "likely changed - re-derive the pristine/patched bodies in scripts/patchDiceBox.mjs " +
        "against the new build."
    );
  }

  // $-sequences are meaningful in a replacement string and the bodies contain
  // none by luck rather than design, so pass a function instead.
  return decoded.replace(re, () => rebuild(separator, patched));
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

  // Lift out any control channel a previous run injected, so the function
  // matching below sees a shape it recognizes either way.
  let patched = blob.decoded.replace(CONTROL_BLOCK_RE, "");

  patched = replaceBody(patched, {
    name: "rollDie()",
    re: ROLL_DIE_RE,
    pristine: PRISTINE_ROLL_DIE,
    patched: PATCHED_ROLL_DIE,
    rebuild: (separator, body) => `${separator}ge=_=>{${body}},Be=_=>{`,
  });

  patched = replaceBody(patched, {
    name: "the per-step body update",
    re: STEP_RE,
    pristine: PRISTINE_STEP,
    patched: PATCHED_STEP,
    rebuild: (separator, body) =>
      `${separator}Tl=_=>{${body}};let Pe=new Date().getTime()`,
  });

  if (!IIFE_TAIL_RE.test(patched)) {
    throw new Error(
      "patchDiceBox: couldn't locate the end of the physics worker's IIFE " +
        "(expected the buffer post-back followed by `})();`). dice-box's build output has " +
        "likely changed - re-derive IIFE_TAIL_RE in scripts/patchDiceBox.mjs."
    );
  }
  patched = patched.replace(
    IIFE_TAIL_RE,
    (_match, xeTail, iifeTail) => `${xeTail}${CONTROL_BLOCK}${iifeTail}`
  );

  if (patched === blob.decoded) {
    // Already current - the usual case on a CI host that restored node_modules
    // from cache, and on any second run.
    console.log("patchDiceBox: already patched, skipping.");
    return;
  }

  const patchedBase64 = Buffer.from(patched, "utf8").toString("base64");
  fs.writeFileSync(targetPath, source.replace(blob.full, `"${patchedBase64}"`));
  console.log(
    "patchDiceBox: patched physics worker for grab-and-throw dice handling."
  );
}

main();
