import type { OptionContent, SetupCard, TurnContent } from "./ratingContent.js";
import { contextLinesHtml, escapeHtml, paragraphs } from "./ratingHtml.js";
import { setupRows, startsOpen, turnRows, type Row } from "./ratingRows.js";
import { PAIRWISE_LABELS, type RatingItem, type RatingSet } from "./ratingSets.js";

/*
 * One self-contained HTML file per rating set: every string escaped and
 * rendered here, no network references, a small inline script for
 * navigation, autosave to localStorage and export. The page never
 * references the answer key.
 *
 * Within an item the options sit side by side as a comparison grid: one
 * column per option and one row per section (ratingRows.ts), so a section
 * starts at the same height in every column, and a section's header row
 * folds it in every column at once. Below the width where the columns fit
 * (WIDE_FROM) the rows stay and the options stack inside each row, every
 * cell tagged with its option letter.
 *
 * A pairwise page keeps the layout and each option's Acceptable? and note,
 * and asks one "Which is better?" per item (A, B or About the same) instead
 * of ranks; its export adds the preferences.
 */

const e = escapeHtml;

/**
 * The viewport width from which N options sit side by side: about 340 px a
 * column. At 1100 px three columns hold some 305 px of text (35 characters a
 * line at 18 px), 40 at a 1280 px window; raising 3 would stack the options
 * in a 1280 px window (a 1920 px laptop at 150 %) and lose the alignment.
 */
export const WIDE_FROM: Record<number, number> = { 1: 0, 2: 760, 3: 1100, 4: 1440 };

/** Marks an option that lacks a section the others have. */
const ABSENT = `<p class="muted">—</p>`;

const tag = (label: string) => `<span class="tag">${e(label)}</span>`;

function rowHtml(row: Row, labels: string[], depth: number): string {
  const head = labels
    .map((label, i) => {
      const gist = row.gists[i] ?? "";
      return `<span class="cell${gist ? " has-gist" : ""}" data-option="${e(label)}">${tag(label)}<span class="title">${e(row.title)}</span>${gist ? ` <span class="gist">${gist}</span>` : ""}</span>`;
    })
    .join("");
  const body = row.children
    ? `<div class="kids">${row.children.map((child) => rowHtml(child, labels, depth + 1)).join("")}</div>`
    : `<div class="body grid">${labels.map((label, i) => `<div class="cell" data-option="${e(label)}">${tag(label)}${row.cells?.[i] ?? ABSENT}</div>`).join("")}</div>`;
  return `<details class="sec" data-sec="${e(row.key)}" data-depth="${depth}"${row.open ? " open" : ""}><summary><span class="head"><span class="row-title">${e(row.title)}</span>${head}</span></summary>${body}</details>`;
}

function contextHtml(item: RatingItem, kind: RatingSet["kind"]): string {
  const sections = [
    ...(item.premise ? [{ key: "premise", heading: "Premise", lines: [item.premise], entries: undefined }] : []),
    ...item.context.map((s, i) => ({ ...s, key: s.key ?? `context-${i + 1}` })),
  ];
  return sections.length
    ? `<div class="context">${sections
        .map(
          (s) =>
            `<details class="ctx" data-sec="${e(s.key)}"${startsOpen(kind, s.key) ? " open" : ""}><summary><h3>${e(s.heading)}</h3></summary>${paragraphs(s.lines)}${contextLinesHtml(s.entries)}</details>`
        )
        .join("")}</div>`
    : "";
}

function controlsHtml(item: RatingItem, label: string, count: number, pairwise: boolean): string {
  const name = `${item.id}-${label}`;
  const ranks = Array.from({ length: count }, (_, i) => i + 1)
    .map((rank) => `<label class="choice"><input type="radio" name="${e(name)}-rank" value="${rank}" data-item="${e(item.id)}" data-label="${e(label)}" data-field="rank"> ${rank}</label>`)
    .join("");
  return `<div class="cell ctl" data-option="${e(label)}">
<p class="ctl-label">Option ${e(label)}</p>
<fieldset><legend>Acceptable?</legend>
<label class="choice"><input type="radio" name="${e(name)}-acceptable" value="yes" data-item="${e(item.id)}" data-label="${e(label)}" data-field="acceptable"> Yes</label>
<label class="choice"><input type="radio" name="${e(name)}-acceptable" value="no" data-item="${e(item.id)}" data-label="${e(label)}" data-field="acceptable"> No</label>
</fieldset>
${pairwise ? "" : `<fieldset><legend>Rank (1 = best; ties allowed)</legend>${ranks}</fieldset>\n`}<label class="note">Note (optional) <input type="text" data-item="${e(item.id)}" data-label="${e(label)}" data-field="note"></label>
</div>`;
}

/** A pairwise item's one question: which option is better, or neither. */
function preferenceHtml(item: RatingItem, labels: string[]): string {
  const choice = (value: string, text: string) =>
    `<label class="choice"><input type="radio" name="${e(item.id)}-preference" value="${e(value)}" data-item="${e(item.id)}" data-field="preference"> ${e(text)}</label>`;
  return `<fieldset class="prefer"><legend>${e(PAIRWISE_LABELS.question)}</legend>${[...labels.map((label) => choice(label, label)), choice("same", PAIRWISE_LABELS.same)].join("")}</fieldset>`;
}

const isSetup = (content: OptionContent): content is SetupCard => content.kind === "setup";

function compareHtml(item: RatingItem, pairwise: boolean): string {
  const labels = item.options.map((o) => o.label);
  const contents = item.options.map((o) => o.content);
  const setups = contents.filter(isSetup);
  const setup = setups.length === contents.length && setups.length > 0;
  const rows = setup ? setupRows(setups) : turnRows(contents.filter((c): c is TurnContent => c.kind === "turn"));
  const labelRow = labels.map((label) => `<div class="cell" data-option="${e(label)}"><h3 class="label">Option ${e(label)}</h3></div>`).join("");
  const titleRow = setup
    ? `<div class="titles grid">${setups.map((card, i) => `<div class="cell" data-option="${e(labels[i])}">${tag(labels[i])}<h3 class="card-title">${e(card.title)}</h3></div>`).join("")}</div>`
    : "";
  return `<div class="compare n${labels.length}">
<div class="labels grid">${labelRow}</div>
${titleRow}${rows.map((row) => rowHtml(row, labels, 0)).join("")}
<div class="controls grid">${labels.map((label) => controlsHtml(item, label, labels.length, pairwise)).join("")}</div>
${pairwise ? preferenceHtml(item, labels) : ""}</div>`;
}

function itemHtml(item: RatingItem, index: number, total: number, set: RatingSet): string {
  return `<section class="item" id="item-${e(item.id)}" data-index="${index}" hidden>
<h2>Item ${index + 1} of ${total}</h2>
${contextHtml(item, set.kind)}
${compareHtml(item, set.mode === "pairwise")}
</section>`;
}

/** Side by side from its width: the columns, the header row per column, the sticky option labels. */
function wideRules(n: number): string {
  const s = `.n${n}`;
  const columns = `grid-template-columns:repeat(${n},minmax(0,1fr))`;
  return `@media (min-width:${WIDE_FROM[n]}px){${s} .grid{${columns}}
${s} .labels{display:grid;position:sticky;top:var(--bar-h,3.5rem);z-index:1;background:var(--bg)}
${s} .tag,${s} .row-title{display:none}
${s} .head{display:grid;${columns};column-gap:1rem;padding:0;border:0;background:none;min-height:0}
${s} .head>.cell{display:block;background:var(--card);border:solid var(--line);border-width:1px 1px 0;padding:.55rem .9rem;min-height:44px}
${s} .head>.cell .title{display:inline}
${s} details.sec[data-depth="1"]>summary>.head{padding-left:0}
${s} details.sec[data-depth="1"]>summary>.head>.cell{padding-left:1.6rem}
${s} .body>.cell+.cell{border-top:0}
${s} .titles>.cell{border-top:0;border-radius:0}
${s} .controls>.cell{border-bottom-width:1px;border-radius:0 0 8px 8px}
${s} details.sec>summary:hover>.head{background:none}
${s} details.sec>summary:hover>.head>.cell{background:var(--hover)}}`;
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f7f6f2;--fg:#1f2328;--muted:#5d6570;--card:#ffffff;--line:#d8d4cc;--accent:#2f6f5e;--focus:#1a73e8;--hover:#f1efe9;--mark:#fdf0cc}
@media (prefers-color-scheme:dark){:root{--bg:#1b1d1f;--fg:#e8e6e3;--muted:#a3a9b0;--card:#25282b;--line:#3a3e42;--accent:#7cc4ad;--focus:#8ab4f8;--hover:#2e3236;--mark:#3d3522}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
header,main,footer{max-width:1600px;margin:0 auto;padding:1rem 1.25rem}
p,li{max-width:70ch}
h1{font-size:1.5rem;margin:.5rem 0} h2{font-size:1.25rem} h3{font-size:1.1rem;margin:1rem 0 .25rem} h4{font-size:1rem;margin:1rem 0 .25rem;color:var(--muted)}
.banner{background:#8a5a00;color:#fff;padding:.75rem 1.25rem;font-weight:600}
.notice{border:1px solid var(--line);background:var(--card);padding:.75rem;border-radius:8px}
.muted,.picture{color:var(--muted)} .picture{font-style:italic}
.context{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.25rem 1rem;margin-bottom:1rem;overflow-wrap:anywhere}
details.ctx>summary{cursor:pointer;min-height:44px;padding:.4rem 0}
details.ctx>summary>h3{display:inline;margin:0}
details.ctx+details.ctx{border-top:1px solid var(--line)}
.ctx-lines{list-style:none;margin:.2rem 0 .6rem;padding:0;font-size:.95rem;line-height:1.5}
.ctx-lines .ctx-lines{margin:.1rem 0 .2rem;padding-left:.9rem;border-left:2px solid var(--line);font-size:1em}
.ctx-lines li{margin:.15rem 0}
.ctx-lines li.current,.ctx-lines li.due,.ctx-lines li.advances{background:var(--mark);border-radius:4px;padding:.1rem .4rem}
.ctx-lines li.current{border-left:4px solid var(--accent)}
.badge{display:inline-block;padding:0 .4rem;border-radius:4px;background:var(--accent);color:var(--bg);font-size:.8rem;font-weight:700;line-height:1.5;white-space:nowrap}
.compare{margin:.5rem 0 1.5rem}
.grid{display:grid;grid-template-columns:minmax(0,1fr);column-gap:1rem}
.cell{min-width:0;background:var(--card);border:solid var(--line);border-width:0 1px;padding:.25rem .9rem;overflow-wrap:break-word}
.labels{display:none}
.labels>.cell{border-top-width:1px;border-radius:8px 8px 0 0;padding:.1rem .9rem}
.label{color:var(--accent);margin:.35rem 0}
.titles>.cell{border-top:1px solid var(--line)}
.titles>.cell:first-child{border-radius:8px 8px 0 0}
.card-title{margin:.35rem 0}
.tag{display:inline-block;min-width:1.7rem;margin:.1rem .5rem .1rem 0;padding:0 .35rem;border-radius:4px;background:var(--accent);color:var(--bg);font-size:.85rem;font-weight:700;line-height:1.5;text-align:center}
details.sec>summary{display:block;list-style:none;cursor:pointer}
details.sec>summary::-webkit-details-marker{display:none}
.head{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.2rem .75rem;background:var(--card);border:solid var(--line);border-width:1px 1px 0;padding:.55rem .9rem;min-height:44px}
.head>.cell{background:none;border:0;padding:0}
.head>.cell:not(.has-gist),.head>.cell .title{display:none}
details.sec>summary:hover>.head{background:var(--hover)}
.row-title,.head .title{font-weight:600}
.row-title::before,.head .title::before{content:"\\25B8";display:inline-block;width:1.2em;color:var(--muted)}
details.sec[open]>summary .row-title::before,details.sec[open]>summary .title::before{content:"\\25BE"}
details.sec[data-depth="1"]>summary .row-title,details.sec[data-depth="1"]>summary .title{font-weight:500}
details.sec[data-depth="1"]>summary>.head{padding-left:1.6rem}
details.sec[data-depth="1"]>.body>.cell{padding-left:1.6rem}
.gist{color:var(--muted);font-size:.85rem}
.gist .part{white-space:nowrap}
.gist .part+.part::before{content:"\\00B7";margin:0 .4rem}
.count{display:inline-block;min-width:1.6rem;padding:0 .4rem;border:1px solid var(--line);border-radius:999px;text-align:center;line-height:1.4}
.body>.cell{padding-bottom:.6rem}
.body>.cell+.cell{border-top:1px dashed var(--line)}
.body>.cell>p:first-of-type,.body>.cell>ul,.body>.cell>ol{margin-top:.25rem}
details.entry{border-left:3px solid var(--line);margin:.4rem 0;padding:0 0 0 .6rem}
details.entry>summary{cursor:pointer;min-height:44px;padding:.4rem 0}
details.entry>summary:hover{color:var(--accent)}
.fields{margin:.25rem 0 .5rem}
.fields dt{font-weight:600;font-size:.85rem;color:var(--muted);margin-top:.5rem}
.fields dd{margin:0}
.fields dd p{margin:.1rem 0}
.cell ul,.cell ol{margin:.1rem 0;padding-left:1.25rem}
.meta{color:var(--muted);font-size:.9rem;margin:.25rem 0}
.k{font-weight:600}
code.id{font-size:.8rem;color:var(--muted);overflow-wrap:anywhere}
.controls>.cell{border-top:1px solid var(--line);padding:.5rem .9rem}
.controls>.cell:last-child{border-bottom-width:1px;border-radius:0 0 8px 8px}
.ctl-label{font-weight:700;color:var(--accent);margin:.25rem 0 0}
fieldset{border:1px solid var(--line);border-radius:6px;margin:.75rem 0;padding:.25rem .75rem}
fieldset.prefer{background:var(--card);border-color:var(--accent);margin-top:1rem}
fieldset.prefer legend{font-weight:700;color:var(--accent)}
.choice{display:inline-flex;align-items:center;gap:.4rem;min-height:44px;min-width:44px;margin-right:1rem;cursor:pointer}
input[type=radio]{width:22px;height:22px}
.note{display:block;margin:.5rem 0} .note input{width:100%;min-height:44px;font:inherit;padding:.25rem .5rem;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
nav{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.bar{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line)}
.bar nav{max-width:1600px;margin:0 auto;padding:.5rem 1.25rem}
.item{scroll-margin-top:8rem}
button,select{font:inherit;min-height:44px;padding:0 1rem;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
button.primary{background:var(--accent);color:var(--bg);border-color:var(--accent)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
${Object.keys(WIDE_FROM)
  .map((n) => wideRules(Number(n)))
  .join("\n")}
`;

const SCRIPT = `
(function(){
var data=JSON.parse(document.getElementById("page-data").textContent);
var key="chosenpath-rating:"+data.pageId;
var pairwise=data.mode==="pairwise";
var state={ratings:{},preferences:{},current:0,lastExport:null};
var storage=null;
try{storage=window.localStorage;var saved=storage.getItem(key);if(saved){state=Object.assign(state,JSON.parse(saved));}}catch(err){storage=null;}
state.preferences=state.preferences||{};
if(!storage){document.getElementById("storage-notice").hidden=false;}
function save(){if(!storage)return;try{storage.setItem(key,JSON.stringify(state));}catch(err){document.getElementById("storage-notice").hidden=false;}}
var sections=Array.prototype.slice.call(document.querySelectorAll(".item"));
var bar=document.querySelector(".bar");
function barHeight(){document.documentElement.style.setProperty("--bar-h",bar.offsetHeight+"px");}
barHeight();window.addEventListener("resize",barHeight);
function rated(item){var r=state.ratings[item.id]||{};var each=item.labels.every(function(l){return r[l]&&r[l].acceptable&&(pairwise||r[l].rank);});return pairwise?each&&!!state.preferences[item.id]:each;}
function progress(){var done=data.items.filter(rated).length;document.getElementById("progress").textContent="Item "+(state.current+1)+" of "+data.items.length+" \\u00b7 "+done+" fully rated";
var jump=document.getElementById("jump");for(var i=0;i<jump.options.length;i++){jump.options[i].textContent=(i+1)+(rated(data.items[i])?" \\u2713":"");}jump.value=String(state.current);
document.getElementById("last-export").textContent=state.lastExport?"Last export: "+state.lastExport:"Not exported yet";}
function show(i,scroll){state.current=Math.max(0,Math.min(sections.length-1,i));sections.forEach(function(s,j){s.hidden=j!==state.current;});save();progress();if(scroll){sections[state.current].scrollIntoView({block:"start"});}}
function restore(){document.querySelectorAll("[data-field]").forEach(function(input){if(input.dataset.field==="preference"){input.checked=state.preferences[input.dataset.item]===input.value;return;}
var r=((state.ratings[input.dataset.item]||{})[input.dataset.label])||{};var v=r[input.dataset.field];
if(input.type==="radio"){input.checked=v!==undefined&&String(v)===input.value;}else{input.value=v||"";}});}
document.addEventListener("change",onInput);document.addEventListener("input",function(ev){if(ev.target.type==="text")onInput(ev);});
function onInput(ev){var t=ev.target;if(!t.dataset||!t.dataset.field)return;if(t.dataset.field==="preference"){state.preferences[t.dataset.item]=t.value;save();progress();return;}
var item=state.ratings[t.dataset.item]=state.ratings[t.dataset.item]||{};var opt=item[t.dataset.label]=item[t.dataset.label]||{};
opt[t.dataset.field]=t.dataset.field==="rank"?Number(t.value):t.value;save();progress();}
document.getElementById("prev").addEventListener("click",function(){show(state.current-1,true);});
document.getElementById("next").addEventListener("click",function(){show(state.current+1,true);});
document.getElementById("jump").addEventListener("change",function(ev){show(Number(ev.target.value),true);});
document.addEventListener("keydown",function(ev){var tag=(ev.target.tagName||"").toLowerCase();if(tag==="input"&&ev.target.type==="text"||tag==="textarea"||tag==="select")return;
if(ev.key==="n"){show(state.current+1,true);}else if(ev.key==="p"){show(state.current-1,true);}});
document.getElementById("export").addEventListener("click",function(){var exportedAt=new Date().toISOString();
var out={pageId:data.pageId,setId:data.setId,exportedAt:exportedAt,ratings:state.ratings};if(pairwise){out.mode="pairwise";out.preferences=state.preferences;}
var blob=new Blob([JSON.stringify(out,null,2)],{type:"application/json"});
var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="ratings-"+data.setId+"-"+data.pageId+".json";document.body.appendChild(a);a.click();
setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},0);state.lastExport=exportedAt;save();progress();});
restore();show(state.current||0);
})();
`;

/** The page's inline data: only what the script needs, with "<" escaped. */
function pageData(set: RatingSet): string {
  const data = {
    pageId: set.pageId,
    setId: set.setId,
    ...(set.mode === "pairwise" ? { mode: set.mode } : {}),
    items: set.items.map((item) => ({ id: item.id, labels: item.options.map((o) => o.label) })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function renderRatingPage(set: RatingSet): string {
  const total = set.items.length;
  const jump = set.items.map((_, i) => `<option value="${i}">${i + 1}</option>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${e(set.title)}</title>
<style>${STYLE}</style>
</head>
<body>
${set.preview ? `<div class="banner" role="status">Preview — not for rating</div>` : ""}
<header>
<h1>${e(set.title)}</h1>
${set.instructions.map((line) => `<p>${e(line)}</p>`).join("")}
<p class="notice" id="storage-notice" hidden>Autosave is off in this browser — export before closing.</p>
</header>
<div class="bar">
<nav aria-label="Items">
<button type="button" id="prev">Previous</button>
<label>Jump to <select id="jump">${jump}</select></label>
<button type="button" id="next">Next</button>
<span id="progress" aria-live="polite"></span>
</nav>
</div>
<main>
${set.items.map((item, index) => itemHtml(item, index, total, set)).join("\n")}
</main>
<footer>
<nav aria-label="Export">
<button type="button" class="primary" id="export">Export ratings</button>
<span id="last-export" class="muted"></span>
</nav>
<p class="muted">Keys: n = next item, p = previous item (outside the note fields).</p>
</footer>
<script type="application/json" id="page-data">${pageData(set)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
