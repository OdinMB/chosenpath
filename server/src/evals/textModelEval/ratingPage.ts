import {
  SETUP_FIELD_LABELS,
  type ContextSection,
  type OptionContent,
  type SetupBackground,
  type SetupCard,
  type SetupElement,
  type SetupOutcome,
  type SetupPlayer,
  type SetupStat,
  type TurnContent,
} from "./ratingContent.js";
import type { RatingItem, RatingSet } from "./ratingSets.js";

/*
 * One self-contained HTML file per rating set: every string escaped and
 * rendered here, no network references, a small inline script for
 * navigation, autosave to localStorage and export. The page never
 * references the answer key.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;

function paragraphs(lines: string[]): string {
  return lines
    .map((line) => {
      const parts = line.split(/(\[picture[^\]]*\])/g).map((part) =>
        /^\[picture/.test(part) ? `<span class="picture">${e(part)}</span>` : e(part)
      );
      return `<p>${parts.join("")}</p>`;
    })
    .join("");
}

function listOf(items: string[]): string {
  return items.length ? `<ul>${items.map((i) => `<li>${e(i)}</li>`).join("")}</ul>` : "";
}

/*
 * A setup card: the whole design, in collapsible sections that start open.
 * Every fixed string comes from SETUP_FIELD_LABELS (checked by the blinding
 * word pattern); an absent field renders nothing, an empty list "(empty)".
 */
const L = SETUP_FIELD_LABELS;

/** One labelled row; nothing without a body. */
function row(label: string, body: string): string {
  return body ? `<dt>${e(label)}</dt><dd>${body}</dd>` : "";
}

const textRow = (label: string, value: string) => row(label, value ? e(value) : "");

// Lists, not a joined line: the items often end in their own full stop
const listRow = (label: string, items: string[] | undefined) =>
  row(label, items === undefined ? "" : items.length ? listOf(items) : e(L.empty));

const valueText = (value: string[] | undefined) => (value === undefined ? "" : value.length ? value.join(", ") : L.empty);

const flagText = (value: boolean | undefined) => (value === undefined ? "" : value ? L.yes : L.no);

function fields(...rows: string[]): string {
  const inner = rows.join("");
  return inner ? `<dl class="fields">${inner}</dl>` : "";
}

/** Short labelled values on one line: "Type: string · Group: City". */
function meta(pairs: [string, string][]): string {
  const shown = pairs.filter(([, value]) => value);
  return shown.length
    ? `<p class="meta">${shown.map(([label, value]) => `<span class="k">${e(label)}:</span> ${e(value)}`).join(" · ")}</p>`
    : "";
}

function blockTitle(name: string, id = ""): string {
  return name || id ? `<p class="block-title"><strong>${e(name)}</strong>${id ? ` <code class="id">${e(id)}</code>` : ""}</p>` : "";
}

/** A collapsible section, open by default; nothing without a body. */
function part(title: string, body: string, level: 4 | 5 = 4): string {
  return body ? `<details class="part" open><summary><h${level}>${e(title)}</h${level}></summary>${body}</details>` : "";
}

function subheading(title: string, body: string): string {
  return body ? `<h5>${e(title)}</h5>${body}` : "";
}

/** One block per object: nothing when the array is absent, "(empty)" when it is empty. */
function blocks<T>(entries: T[] | undefined, render: (entry: T) => string): string {
  if (entries === undefined) return "";
  return entries.length ? entries.map((entry) => `<div class="block">${render(entry)}</div>`).join("") : `<p class="muted">${e(L.empty)}</p>`;
}

const RESOLUTION_LABELS: Record<string, string> = {
  favorable: L.favorable,
  unfavorable: L.unfavorable,
  mixed: L.mixed,
  sideAWins: L.sideAWins,
  sideBWins: L.sideBWins,
  resolution1: L.resolution1,
  resolution2: L.resolution2,
  resolution3: L.resolution3,
};

const resolutionLabel = (key: string) => RESOLUTION_LABELS[key] ?? key;

function outcomeHtml(o: SetupOutcome): string {
  const resolutions = o.resolutions.length
    ? `<ul>${o.resolutions.map((r) => `<li><span class="k">${e(resolutionLabel(r.key))}:</span> ${e(r.text)}</li>`).join("")}</ul>`
    : "";
  return (
    blockTitle(o.question, o.id) +
    fields(
      textRow(L.resonance, o.resonance),
      row(L.resolutions, resolutions),
      textRow(L.intendedMilestones, o.intendedNumberOfMilestones),
      listRow(L.milestones, o.milestones)
    )
  );
}

function statHtml(s: SetupStat): string {
  return (
    blockTitle(s.name, s.id) +
    meta([
      [L.type, s.type],
      [L.group, s.group],
      [L.isVisible, flagText(s.isVisible)],
      [L.partOfPlayerBackgrounds, flagText(s.partOfPlayerBackgrounds)],
      [L.canBeChangedInBeatResolutions, flagText(s.canBeChangedInBeatResolutions)],
    ]) +
    fields(
      textRow(L.tooltip, s.tooltip),
      textRow(L.initialValue, valueText(s.initialValue)),
      textRow(L.possibleValues, s.possibleValues),
      listRow(L.effectOnPoints, s.effectOnPoints),
      listRow(L.narrativeImplications, s.narrativeImplications),
      listRow(L.adjustmentsAfterThreads, s.adjustmentsAfterThreads),
      textRow(L.optionsToSacrifice, s.optionsToSacrifice),
      textRow(L.optionsToGainAsReward, s.optionsToGainAsReward)
    )
  );
}

function elementHtml(el: SetupElement): string {
  return (
    blockTitle(el.name, el.id) +
    fields(textRow(L.role, el.role), textRow(L.instructions, el.instructions), textRow(L.appearance, el.appearance), listRow(L.facts, el.facts))
  );
}

function startingStats(stats: SetupBackground["initialStats"]): string {
  if (stats === undefined) return "";
  if (stats.length === 0) return e(L.empty);
  return `<ul>${stats
    .map(
      (s) =>
        `<li><span class="k">${e(s.stat)}${s.known ? "" : ` (${e(L.notAPlayerStat)})`}:</span> ${e(valueText(s.value))}</li>`
    )
    .join("")}</ul>`;
}

function backgroundHtml(b: SetupBackground): string {
  return blockTitle(b.title) + (b.fluffTemplate ? paragraphs([b.fluffTemplate]) : "") + fields(row(L.startingStats, startingStats(b.initialStats)));
}

function playerHtml(p: SetupPlayer): string {
  const identities =
    p.identities === undefined
      ? ""
      : p.identities.length
        ? `<ul>${p.identities
            .map(
              (i) =>
                `<li><strong>${e(i.name)}</strong>${i.pronouns ? ` <span class="muted">(${e(i.pronouns)})</span>` : ""}${i.appearance ? `: ${e(i.appearance)}` : ""}</li>`
            )
            .join("")}</ul>`
        : `<p class="muted">${e(L.empty)}</p>`;
  return (
    subheading(L.outcomes, blocks(p.outcomes, outcomeHtml)) +
    subheading(L.identities, identities) +
    subheading(L.backgrounds, blocks(p.backgrounds, backgroundHtml))
  );
}

function setupHtml(card: SetupCard): string {
  const g = card.guidelines;
  const difficulty = card.difficulty
    .map((d) => [d.title, d.modifier ? `(${L.modifier} ${d.modifier})` : ""].filter(Boolean).join(" "))
    .join(" · ");
  const intro =
    (card.introduction.title ? `<p><strong>${e(card.introduction.title)}</strong></p>` : "") +
    (card.introduction.text ? paragraphs(card.introduction.text.split(/\n\s*\n/)) : "");
  return [
    `<h3 class="card-title">${e(card.title)}</h3>`,
    meta([[L.difficulty, difficulty]]),
    fields(textRow(L.teaser, card.teaser)),
    part(L.characterSelection, intro),
    part(
      L.guidelines,
      fields(
        row(L.world, g.world ? paragraphs([g.world]) : ""),
        listRow(L.rules, g.rules),
        listRow(L.tone, g.tone),
        listRow(L.conflicts, g.conflicts),
        listRow(L.decisions, g.decisions),
        listRow(L.typesOfThreads, g.typesOfThreads),
        listRow(L.switchAndThreadInstructions, g.switchAndThreadInstructions)
      )
    ),
    part(L.sharedOutcomes, blocks(card.sharedOutcomes, outcomeHtml)),
    part(
      L.stats,
      meta([[L.statGroups, valueText(card.statGroups)]]) +
        part(L.sharedStats, blocks(card.sharedStats, statHtml), 5) +
        part(L.playerStats, blocks(card.playerStats, statHtml), 5)
    ),
    part(L.storyElements, blocks(card.storyElements, elementHtml)),
    ...card.players.map((p) => part(`${L.player} ${p.slot.replace(/^player/, "")}`, playerHtml(p))),
    part(L.imageInstructions, fields(...card.imageInstructions.map((i) => textRow(L[i.key], i.text)))),
  ].join("");
}

function turnHtml(turn: TurnContent): string {
  return turn.beats
    .map(
      (beat) =>
        (turn.beats.length > 1 ? `<h4 class="player">For ${e(beat.playerName)}</h4>` : "") +
        `<h3 class="card-title">${e(beat.title)}</h3>` +
        paragraphs(beat.paragraphs) +
        `<h4>Options</h4><ol>${beat.options.map((o) => `<li>${e(o)}</li>`).join("")}</ol>` +
        `<h4>Interludes</h4>${listOf(beat.interludes)}`
    )
    .join("");
}

function contentHtml(content: OptionContent): string {
  return content.kind === "setup" ? setupHtml(content) : turnHtml(content);
}

function contextHtml(item: RatingItem): string {
  const sections: ContextSection[] = item.premise ? [{ heading: "Premise", lines: [item.premise] }, ...item.context] : item.context;
  return sections.length
    ? `<div class="context">${sections.map((s) => `<h3>${e(s.heading)}</h3>${paragraphs(s.lines)}`).join("")}</div>`
    : "";
}

function optionHtml(item: RatingItem, label: string, content: OptionContent, count: number): string {
  const name = `${item.id}-${label}`;
  const ranks = Array.from({ length: count }, (_, i) => i + 1)
    .map((rank) => `<label class="choice"><input type="radio" name="${e(name)}-rank" value="${rank}" data-item="${e(item.id)}" data-label="${e(label)}" data-field="rank"> ${rank}</label>`)
    .join("");
  return `<article class="option">
<h3 class="label">Option ${e(label)}</h3>
<div class="content">${contentHtml(content)}</div>
<fieldset><legend>Acceptable?</legend>
<label class="choice"><input type="radio" name="${e(name)}-acceptable" value="yes" data-item="${e(item.id)}" data-label="${e(label)}" data-field="acceptable"> Yes</label>
<label class="choice"><input type="radio" name="${e(name)}-acceptable" value="no" data-item="${e(item.id)}" data-label="${e(label)}" data-field="acceptable"> No</label>
</fieldset>
<fieldset><legend>Rank (1 = best; ties allowed)</legend>${ranks}</fieldset>
<label class="note">Note (optional) <input type="text" data-item="${e(item.id)}" data-label="${e(label)}" data-field="note"></label>
</article>`;
}

function itemHtml(item: RatingItem, index: number, total: number): string {
  return `<section class="item" id="item-${e(item.id)}" data-index="${index}" hidden>
<h2>Item ${index + 1} of ${total}</h2>
${contextHtml(item)}
<div class="options">${item.options.map((o) => optionHtml(item, o.label, o.content, item.options.length)).join("")}</div>
</section>`;
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f7f6f2;--fg:#1f2328;--muted:#5d6570;--card:#ffffff;--line:#d8d4cc;--accent:#2f6f5e;--focus:#1a73e8}
@media (prefers-color-scheme:dark){:root{--bg:#1b1d1f;--fg:#e8e6e3;--muted:#a3a9b0;--card:#25282b;--line:#3a3e42;--accent:#7cc4ad;--focus:#8ab4f8}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
header,main,footer{max-width:1600px;margin:0 auto;padding:1rem 1.25rem}
p,li{max-width:70ch}
h1{font-size:1.5rem;margin:.5rem 0} h2{font-size:1.25rem} h3{font-size:1.1rem;margin:1rem 0 .25rem} h4{font-size:1rem;margin:1rem 0 .25rem;color:var(--muted)}
.banner{background:#8a5a00;color:#fff;padding:.75rem 1.25rem;font-weight:600}
.notice{border:1px solid var(--line);background:var(--card);padding:.75rem;border-radius:8px}
.muted,.picture{color:var(--muted)} .picture{font-style:italic}
.context{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.5rem 1rem;margin-bottom:1rem}
.options{display:grid;grid-template-columns:1fr;gap:1rem}
@media (min-width:1400px){.options{grid-template-columns:repeat(auto-fit,minmax(420px,1fr))}}
.option{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.75rem 1rem;min-width:0}
.label{color:var(--accent)}
.content{overflow-wrap:break-word}
details.part{border-top:1px solid var(--line);margin:.25rem 0}
details.part>summary{cursor:pointer;padding:.55rem 0;min-height:44px}
details.part>summary>h4,details.part>summary>h5{display:inline;margin:0}
details.part details.part{margin-left:.25rem}
h5{font-size:.95rem;margin:.75rem 0 .25rem;color:var(--muted)}
.fields{margin:.25rem 0 .5rem}
.fields dt{font-weight:600;font-size:.85rem;color:var(--muted);margin-top:.5rem}
.fields dd{margin:0}
.fields dd p{margin:.1rem 0}
.fields ul,.block ul{margin:.1rem 0;padding-left:1.25rem}
.block{border-left:3px solid var(--line);padding:0 0 0 .75rem;margin:.75rem 0}
.block-title{margin:.25rem 0}
.meta{color:var(--muted);font-size:.9rem;margin:.25rem 0}
.k{font-weight:600}
code.id{font-size:.8rem;color:var(--muted);overflow-wrap:anywhere}
fieldset{border:1px solid var(--line);border-radius:6px;margin:.75rem 0;padding:.25rem .75rem}
.choice{display:inline-flex;align-items:center;gap:.4rem;min-height:44px;min-width:44px;margin-right:1rem;cursor:pointer}
input[type=radio]{width:22px;height:22px}
.note{display:block;margin:.5rem 0} .note input{width:100%;min-height:44px;font:inherit;padding:.25rem .5rem;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
nav{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.bar{position:sticky;top:0;z-index:1;background:var(--bg);border-bottom:1px solid var(--line)}
.bar nav{max-width:1600px;margin:0 auto;padding:.5rem 1.25rem}
.item{scroll-margin-top:8rem}
button,select{font:inherit;min-height:44px;padding:0 1rem;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
button.primary{background:var(--accent);color:var(--bg);border-color:var(--accent)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
`;

const SCRIPT = `
(function(){
var data=JSON.parse(document.getElementById("page-data").textContent);
var key="chosenpath-rating:"+data.pageId;
var state={ratings:{},current:0,lastExport:null};
var storage=null;
try{storage=window.localStorage;var saved=storage.getItem(key);if(saved){state=Object.assign(state,JSON.parse(saved));}}catch(err){storage=null;}
if(!storage){document.getElementById("storage-notice").hidden=false;}
function save(){if(!storage)return;try{storage.setItem(key,JSON.stringify(state));}catch(err){document.getElementById("storage-notice").hidden=false;}}
var sections=Array.prototype.slice.call(document.querySelectorAll(".item"));
function rated(item){var r=state.ratings[item.id]||{};return item.labels.every(function(l){return r[l]&&r[l].acceptable&&r[l].rank;});}
function progress(){var done=data.items.filter(rated).length;document.getElementById("progress").textContent="Item "+(state.current+1)+" of "+data.items.length+" \\u00b7 "+done+" fully rated";
var jump=document.getElementById("jump");for(var i=0;i<jump.options.length;i++){jump.options[i].textContent=(i+1)+(rated(data.items[i])?" \\u2713":"");}jump.value=String(state.current);
document.getElementById("last-export").textContent=state.lastExport?"Last export: "+state.lastExport:"Not exported yet";}
function show(i,scroll){state.current=Math.max(0,Math.min(sections.length-1,i));sections.forEach(function(s,j){s.hidden=j!==state.current;});save();progress();if(scroll){sections[state.current].scrollIntoView({block:"start"});}}
function restore(){document.querySelectorAll("[data-field]").forEach(function(input){var r=((state.ratings[input.dataset.item]||{})[input.dataset.label])||{};var v=r[input.dataset.field];
if(input.type==="radio"){input.checked=v!==undefined&&String(v)===input.value;}else{input.value=v||"";}});}
document.addEventListener("change",onInput);document.addEventListener("input",function(ev){if(ev.target.type==="text")onInput(ev);});
function onInput(ev){var t=ev.target;if(!t.dataset||!t.dataset.field)return;var item=state.ratings[t.dataset.item]=state.ratings[t.dataset.item]||{};var opt=item[t.dataset.label]=item[t.dataset.label]||{};
opt[t.dataset.field]=t.dataset.field==="rank"?Number(t.value):t.value;save();progress();}
document.getElementById("prev").addEventListener("click",function(){show(state.current-1,true);});
document.getElementById("next").addEventListener("click",function(){show(state.current+1,true);});
document.getElementById("jump").addEventListener("change",function(ev){show(Number(ev.target.value),true);});
document.addEventListener("keydown",function(ev){var tag=(ev.target.tagName||"").toLowerCase();if(tag==="input"&&ev.target.type==="text"||tag==="textarea"||tag==="select")return;
if(ev.key==="n"){show(state.current+1,true);}else if(ev.key==="p"){show(state.current-1,true);}});
document.getElementById("export").addEventListener("click",function(){var exportedAt=new Date().toISOString();
var blob=new Blob([JSON.stringify({pageId:data.pageId,setId:data.setId,exportedAt:exportedAt,ratings:state.ratings},null,2)],{type:"application/json"});
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
${set.items.map((item, index) => itemHtml(item, index, total)).join("\n")}
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
