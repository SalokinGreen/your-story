// The script that paints the saved theme before first paint, so a player on
// Paper White never sees a dark frame. `app/layout.tsx` renders it as a plain
// synchronous <script> in <head> (not next/script: its `beforeInteractive`
// queues inline content, which does not run before paint).
//
// It is a hand-copied, ES5 version of the arithmetic in
// `app/story/themeTokens.ts` (`themeTokens`, `themeVarEntries`), with the
// preset list serialised in. Change one, change the other:
// tests/themeBootstrap.test.ts evaluates this against every preset and
// compares. On any error it paints Ink from literals, with no arithmetic.
//
// It does not touch the `theme-color` meta: that is added to <head> from
// outside React, which would risk a hydration mismatch; `applyThemeVars` sets
// it once the app has loaded.

import {
  MEANING_DARK,
  MEANING_LIGHT,
  INK,
  THEME_PRESETS,
  themeTokens,
  themeVarEntries,
} from "@/app/story/themeTokens";

const THEME_STORAGE_KEY = "storyTheme";

function buildScript(): string {
  const ink = {
    entries: themeVarEntries(INK),
    scheme: themeTokens(INK).scheme,
  };
  // `<` is escaped so no preset text could close the script element.
  const json = (v: unknown) =>
    JSON.stringify(v).replace(/</g, String.fromCharCode(92) + "u003c");
  return `(function(){
var INK=${json(ink)};
function paint(entries,scheme){
var s=document.documentElement.style;
for(var i=0;i<entries.length;i++)s.setProperty(entries[i][0],entries[i][1]);
s.setProperty("color-scheme",scheme);
}
try{
var PRESETS=${json(THEME_PRESETS)};
var id=null;
try{id=localStorage.getItem(${json(THEME_STORAGE_KEY)});}catch(e){}
var p=PRESETS[0];
for(var i=0;i<PRESETS.length;i++){if(PRESETS[i].id===id){p=PRESETS[i];break;}}
function rgb(c){
c=String(c).replace(/^\\s+|\\s+$/g,"");
var m=/^#([0-9a-f]{6})$/i.exec(c);
if(m){var n=parseInt(m[1],16);return[(n>>16)&255,(n>>8)&255,n&255];}
m=/^rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/i.exec(c);
if(m)return[Number(m[1]),Number(m[2]),Number(m[3])];
throw new Error("colour");
}
function mix(a,b,t){
var x=rgb(a),y=rgb(b);
function f(u,v){return Math.round(u+(v-u)*t);}
return"rgb("+f(x[0],y[0])+", "+f(x[1],y[1])+", "+f(x[2],y[2])+")";
}
function ch(v){var c=v/255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function lum(c){var r=rgb(c);return 0.2126*ch(r[0])+0.7152*ch(r[1])+0.0722*ch(r[2]);}
function con(a,b){var x=lum(a),y=lum(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
var light=lum(p.background)>0.5;
var onAccent=p.onAccent;
if(!onAccent){
var best=con(p.background,p.accent)>=con(p.text,p.accent)?p.background:p.text;
if(con(best,p.accent)>=4.5)onAccent=best;
else onAccent=con("#111111",p.accent)>=con("#fafafa",p.accent)?"#111111":"#fafafa";
}
var bg=p.background,tx=p.text,ac=p.accent;
var entries=[
["--ys-bg",bg],
["--ys-surface",p.surface||mix(bg,tx,0.06)],
["--ys-surface-2",p.surface2||mix(bg,tx,0.11)],
["--ys-text",tx],
["--ys-muted",p.muted||mix(tx,bg,0.38)],
["--ys-border",p.border||mix(bg,tx,0.14)],
["--ys-accent",ac],
["--ys-on-accent",onAccent],
["--ys-danger",light?${json(MEANING_LIGHT.danger)}:${json(MEANING_DARK.danger)}],
["--ys-success",light?${json(MEANING_LIGHT.success)}:${json(MEANING_DARK.success)}],
["--ys-warning",light?${json(MEANING_LIGHT.warning)}:${json(MEANING_DARK.warning)}],
["--ys-gradient","linear-gradient(160deg, "+bg+", "+mix(bg,ac,0.07)+")"],
["--story-bg-color",bg],
["--story-text-color",tx],
["--story-accent-color",ac]
];
paint(entries,light?"light":"dark");
}catch(e){
try{paint(INK.entries,INK.scheme);}catch(e2){}
}
})();`;
}

export const THEME_BOOTSTRAP_SCRIPT = buildScript();
