/**
 * Suno Tweaks v30 — readable local script
 *
 * Loaded by the persistent local-file bookmarklet. The script keeps the accepted
 * v22 layout/playlist/title-edit behavior and adds the locally learned Create-page
 * lineage colors that were verified with the direct console test.
 *
 * Design principles:
 * - No external network requests are made by this script.
 * - Existing observers from older versions are disconnected before initialization.
 * - DOM changes are reapplied through one throttled MutationObserver.
 * - Lineage relations are learned locally and stored in sessionStorage.
 * - Related Create rows receive a stable background color and left inset marker.
 *
 * Debug objects:
 * - window.__sunoLocalScriptLoader  — loader status
 * - window.__sunoLineageV30        — lineage/coloring status
 */

(()=> {
  const W=200, H=262, CH=326, IW=360, G=16, PBS=1.5, ID="suno-combined-clean", OBS="__sunoCombinedCleanObserver", C='input[aria-label="Playback progress"]', $=(s, r=document)=>[...r.querySelectorAll(s)], S=(e, p, v)=>e&&e.style.setProperty(p, v, "important"), A=(e, v, n="sc")=>e&&e.setAttribute("data-"+n, v), E=s=>String(s||"").replace(/[&<>"']/g, c=>({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }
  [c])), D=s=> {
    try {
      return JSON.parse('"'+String(s||"").replace(/"/g, '\\"')+'"')
    } catch(e) {
      return String(s||"").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    }
  }, F=n=>Number(n||0).toLocaleString();
  [OBS, "__sunoMergedLayoutTweaksObserver", "__sunoCarouselProxyUnifiedObserver"].forEach(k=> {
    try {
      window[k]?.disconnect()
    } catch(e) {
    }
  });
  [ID, "suno-tweaks-compact", "suno-carousel-proxy-unified"].forEach(id=>document.getElementById(id)?.remove());
  let st=document.head.appendChild(document.createElement("style"));
  st.id=ID;
  st.textContent=`[data-suno-profile-main="1"]{max-width:none!important;width:100%!important}
[data-suno-profile-main="1"]>div[class*="overflow-y-auto"]>div[class*="mx-auto"][class*="max-w-"],[data-suno-profile-main="1"]>div>div[class*="mx-auto"][class*="max-w-"]{max-width:none!important;width:100%!important}
[data-sc=out],[data-sc=sec]{display:block!important;position:relative!important;height:auto!important;max-height:none!important;overflow:visible!important;contain:none!important;transform:none!important}
[data-sc=sec]{padding-bottom:32px!important;margin-bottom:34px!important}
[data-sc=grid]{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(${W}px,${W}px))!important;grid-auto-rows:${CH}px!important;gap:${G}px!important;justify-content:start!important;align-items:start!important;height:auto!important;max-height:none!important;overflow:visible!important;contain:none!important}
[data-sc=cell],[data-sc=cell]>div,[data-sc=cell]>div>div,[data-sc=grp],[data-sc=grp]>div,[data-sc=row],[data-sc=in]{width:${W}px!important;max-width:${W}px!important;height:${CH}px!important;min-height:${CH}px!important;max-height:none!important;overflow:visible!important;contain:none!important;box-sizing:border-box!important}
[data-sc=row]{position:relative!important;display:block!important;background:transparent!important;padding:0!important;border-radius:0!important}
[data-sc=in]{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:8px!important;flex:none!important;min-width:0!important}
[data-sc=row] .clip-image-container{width:${W}px!important;height:${H}px!important;min-width:${W}px!important;max-width:${W}px!important;flex:0 0 ${H}px!important;border-radius:16px!important;overflow:hidden!important;position:relative!important;background:rgba(255,255,255,.04)!important}
[data-sc=row] .clip-image-container img{display:block!important;width:100%!important;height:100%!important;max-width:none!important;object-fit:cover!important;object-position:center!important;opacity:1!important;visibility:visible!important}
[data-sc=row] .clip-image-container button[aria-label="Play"],[data-sc=row] .clip-image-container button[aria-label^="Play "],[data-sc=row] .clip-image-container button[aria-label="Pause"],[data-sc=row] .clip-image-container button[aria-label^="Pause "],.clip-image-container button[aria-label="Play"],.clip-image-container button[aria-label^="Play "],.clip-image-container button[aria-label="Pause"],.clip-image-container button[aria-label^="Pause "],.clip-image-container button[aria-label="Playing"],.clip-image-container button[aria-label^="Playing "],.absolute.inset-0.z-20>button[aria-label="Play"],.absolute.inset-0.z-20>button[aria-label="Pause"],.absolute.inset-0.z-20>button[aria-label="Playing"],button[aria-label="Play"][class*="bg-background"],button[aria-label="Pause"][class*="bg-background"],button[aria-label="Playing"][class*="bg-background"],button[aria-label="Play"][class*="backdrop-blur"],button[aria-label="Pause"][class*="backdrop-blur"],button[aria-label="Playing"][class*="backdrop-blur"],[data-pinproxy=1] [data-pplay]{background:transparent!important;background-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-color:transparent!important}
button[aria-label="Playing"][class*="rounded-full"][class*="bg-background"],button[aria-label="Playing"][class*="rounded-full"][class*="backdrop-blur"]{background:transparent!important;background-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-color:transparent!important}
 .clip-image-container [class*="bg-black/"][class*="backdrop-blur"],.clip-image-container [class*="bg-black"][class*="rounded-full"][class*="backdrop-blur"],.clip-image-container [class*="rounded-full"][class*="backdrop-blur"]{background:transparent!important;background-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
[data-sc=txt]{display:flex!important;flex-direction:column!important;gap:2px!important;width:${W}px!important;max-width:${W}px!important;min-width:0!important;overflow:visible!important;flex:none!important}
[data-sc=txt] a[href^="/song/"]{display:block!important;width:${W}px!important;max-width:${W}px!important;font-size:14px!important;font-weight:600!important;line-height:1.25!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;text-decoration:none!important}
[data-sc=txt] a[href^="/song/"]:hover{text-decoration:underline!important}
[data-sc=txt] [class*=clip-title-wrapper],[data-sc=txt] .flex.items-center.gap-2{width:${W}px!important;max-width:${W}px!important;min-width:0!important;overflow:hidden!important}
[data-sc=menu]{position:absolute!important;top:8px!important;right:8px!important;z-index:20!important;opacity:0!important;transition:opacity .12s ease!important}
[data-sc=row]:hover [data-sc=menu]{opacity:1!important}
[data-sc=row] [class*=css-8rxof8],[data-sc=row] [class*=e1rxirk01]{font-size:12px!important;opacity:.65!important;max-width:${W}px!important;overflow:hidden!important}
[data-pb=main]{display:grid!important;grid-template-columns:minmax(220px,1fr) minmax(480px,5fr) minmax(280px,1fr)!important;align-items:center!important;gap:12px!important;overflow:visible!important}
[data-pb=l],[data-pb=c],[data-pb=r]{min-width:0!important;max-width:none!important;width:auto!important;flex:none!important;flex-basis:auto!important}
[data-pb=c]{justify-self:stretch!important;width:100%!important;max-width:none!important}
[data-pb=ci]{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}
[data-pb=pr]{width:100%!important;max-width:none!important;min-width:0!important;--min-target-size:${PBS}rem!important;--button-width:${.75*PBS}rem!important;--button-height:${.75*PBS}rem!important;--button-border-width:${.125*PBS}rem!important;--track-width:${.25*PBS}rem!important}
[data-pb=pr] input[aria-label="Playback progress"]{height:${PBS}rem!important}
[data-pb=tr]{flex:1 1 auto!important;min-width:0!important;max-width:none!important;width:auto!important;min-height:${PBS}rem!important}
[data-pinproxy=1]{width:${W}px!important;max-width:${W}px!important;order:0}
[data-pinproxy=1] .clip-image-container{cursor:pointer!important}
[data-pinproxy=1] [data-pplay]{position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;width:52px!important;height:52px!important;border-radius:999px!important;border:0!important;background:transparent!important;background-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;color:white!important;font-size:22px!important;opacity:0!important;cursor:pointer!important;transition:opacity .12s ease!important}
[data-pinproxy=1]:hover [data-pplay]{opacity:1!important}
[data-pinproxy=1] [data-sc=txt] a[href^="/song/"]::after,[data-suno-pinned=1] [data-sc=txt] a[href^="/song/"]::after{content:"  📌";font-size:12px;opacity:.75}
[data-suno-newrow=1]{position:relative!important;display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:8px!important;background:transparent!important;padding:0!important;border:0!important;border-radius:0!important;width:${W}px!important;max-width:${W}px!important;height:${CH}px!important;min-height:${CH}px!important;overflow:visible!important;box-sizing:border-box!important}
[data-suno-newrow=1] [data-sc=art]{display:block!important;width:${W}px!important;height:${H}px!important;min-width:${W}px!important;max-width:${W}px!important;flex:0 0 ${H}px!important;border-radius:16px!important;overflow:hidden!important;position:relative!important;background:rgba(255,255,255,.04)!important}
[data-suno-newrow=1] [data-sc=art] img,[data-suno-newrow=1] img[data-suno-card-img=1]{display:block!important;width:100%!important;height:100%!important;max-width:none!important;object-fit:cover!important;object-position:center!important;opacity:1!important;visibility:visible!important;border-radius:16px!important}
[data-suno-newrow=1] [data-sc=txt]{display:flex!important;flex-direction:column!important;gap:2px!important;width:${W}px!important;max-width:${W}px!important;min-width:0!important;overflow:visible!important;flex:none!important}
[data-suno-newrow=1] [data-sc=txt] a[href^="/song/"]{display:block!important;width:${W}px!important;max-width:${W}px!important;font-size:14px!important;font-weight:600!important;line-height:1.25!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;text-decoration:none!important}
[data-suno-newrow=1] [data-sc=menu]{position:absolute!important;top:8px!important;right:8px!important;z-index:20!important;opacity:0!important;transition:opacity .12s ease!important}
[data-suno-newrow=1]:hover [data-sc=menu]{opacity:1!important}
@media(max-width:999px){[data-pb=main]{display:flex!important}
[data-pb=l]{flex:1 1 160px!important}
[data-pb=c]{flex:3 1 320px!important}
[data-pb=r]{flex:0 1 auto!important}
}
li>[role="button"][aria-roledescription="sortable"] .clip-row span.hover-only:has(button[aria-label="Remix"]),li>[role="button"][aria-roledescription="sortable"] .clip-row button[data-liked].hover-only{display:inline-flex!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important}
li>[role="button"][aria-roledescription="sortable"] .clip-row{height:auto!important;min-height:7.5rem!important}
li>[role="button"][aria-roledescription="sortable"] .clip-row .clip-image-container{width:6.458rem!important;height:6.458rem!important;min-width:6.458rem!important;min-height:6.458rem!important}
[data-suno-pl-like="1"]{display:inline-flex!important;align-items:center!important;white-space:nowrap!important}
[data-testid="clip-row"] button[aria-label="Edit title"]{display:inline-flex!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important;position:relative!important;inset:auto!important;width:1.5rem!important;min-width:1.5rem!important;max-width:none!important;height:1.5rem!important;flex:0 0 1.5rem!important;margin-left:.25rem!important;clip-path:none!important}
[data-testid="clip-row"] div:has(>button[aria-label="Edit title"]){display:flex!important;align-items:center!important;overflow:visible!important;visibility:visible!important;opacity:1!important}
div[data-testid="clip-row"][data-suno-lineage-color="0"]{background:hsla(0,30%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(0,44%,50%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="1"]{background:hsla(138,32%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(138,46%,51%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="2"]{background:hsla(275,34%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(275,48%,52%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="3"]{background:hsla(53,36%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(53,50%,53%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="4"]{background:hsla(190,30%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(190,44%,50%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="5"]{background:hsla(328,32%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(328,46%,51%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="6"]{background:hsla(105,34%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(105,48%,52%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="7"]{background:hsla(243,36%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(243,50%,53%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="8"]{background:hsla(20,30%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(20,44%,50%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="9"]{background:hsla(158,32%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(158,46%,51%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="10"]{background:hsla(295,34%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(295,48%,52%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="11"]{background:hsla(73,36%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(73,50%,53%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="12"]{background:hsla(210,30%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(210,44%,50%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="13"]{background:hsla(348,32%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(348,46%,51%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="14"]{background:hsla(125,34%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(125,48%,52%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="15"]{background:hsla(263,36%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(263,50%,53%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="16"]{background:hsla(40,30%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(40,44%,50%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="17"]{background:hsla(178,32%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(178,46%,51%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="18"]{background:hsla(315,34%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(315,48%,52%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="19"]{background:hsla(93,36%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(93,50%,53%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="20"]{background:hsla(230,30%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(230,44%,50%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="21"]{background:hsla(8,32%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(8,46%,51%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="22"]{background:hsla(145,34%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(145,48%,52%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="23"]{background:hsla(283,36%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(283,50%,53%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="24"]{background:hsla(60,30%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(60,44%,50%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="25"]{background:hsla(198,32%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(198,46%,51%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="26"]{background:hsla(335,34%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(335,48%,52%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="27"]{background:hsla(113,36%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(113,50%,53%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="28"]{background:hsla(250,30%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(250,44%,50%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="29"]{background:hsla(28,32%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(28,46%,51%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="30"]{background:hsla(165,34%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(165,48%,52%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="31"]{background:hsla(303,36%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(303,50%,53%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="32"]{background:hsla(80,30%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(80,44%,50%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="33"]{background:hsla(218,32%,24%,.76)!important;box-shadow:inset 4px 0 0 hsla(218,46%,51%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="34"]{background:hsla(355,34%,25%,.76)!important;box-shadow:inset 4px 0 0 hsla(355,48%,52%,.62)!important;border-radius:.5rem!important}
div[data-testid="clip-row"][data-suno-lineage-color="35"]{background:hsla(133,36%,26%,.76)!important;box-shadow:inset 4px 0 0 hsla(133,50%,53%,.62)!important;border-radius:.5rem!important}
`;
  function U(raw, onlySuno=false) {
    if(!raw)return"";
    try {
      let u=new URL(raw, location.href);
      if(onlySuno&&!u.hostname.endsWith("suno.ai"))return"";
      if(u.hostname.endsWith("suno.ai"))u.searchParams.set("width", IW);
      return u.href
    } catch(e) {
      return onlySuno?"":String(raw||"")
    }
  }
  function fixImg(im) {
    let u=U(im.dataset.src||im.currentSrc||im.src, true);
    if(u&&im.dataset.sunoCleanSrc!==u) {
      im.dataset.sunoCleanSrc=u;
      im.removeAttribute("srcset");
      im.src=u
    }
  }
  function profileMain() {
    let m=document.getElementById("main-container");
    return m&&(m.querySelector('p[aria-label^="@"]')||m.querySelector('[class*="ProfileV2Hero"]'))?m:null
  }
  function profileContent() {
    let m=profileMain(), sc=m?.firstElementChild;
    if(!sc)return null;
    return[...sc.children].find(e=> {
      let c=String(e.className||"");
      return c.includes("mx-auto")&&c.includes("max-w-")
    })||null
  }
  // Expand the profile and central content areas.
function wide() {
    $('[data-suno-profile-main="1"]').forEach(e=>e.removeAttribute("data-suno-profile-main"));
    let m=profileMain();
    if(m)m.setAttribute("data-suno-profile-main", "1")
  }
  function markCard(row, g) {
    A(row, "row");
    row.removeAttribute("height");
    let cell=row;
    while(cell.parentElement&&cell.parentElement!==g)cell=cell.parentElement;
    if(cell?.parentElement===g)A(cell, "cell");
    let gr=row.closest(".group");
    if(gr&&g.contains(gr))A(gr, "grp");
    A(row.firstElementChild, "in");
    let art=row.querySelector('.clip-image-container,[role=button][aria-label^="Play"]');
    art?.querySelectorAll("img").forEach(fixImg);
    A(art?.nextElementSibling||row.querySelector('a[href^="/song/"]')?.closest("div"), "txt");
    A(row.querySelector('[aria-label="More options"]')?.closest("div"), "menu")
  }
  function fit(sec, g) {
    A(sec, "sec");
    A(sec.parentElement, "out");
    let n=g.querySelectorAll("[data-sc=cell]").length||g.children.length||1, gw=g.clientWidth||g.getBoundingClientRect().width||W, cols=Math.max(1, Math.floor((gw+G)/(W+G))), rows=Math.ceil(n/cols), gh=rows*CH+(rows-1)*G, head=sec.querySelector('[aria-label="View all Songs"]')?.closest(".mb-3,div"), sh=Math.ceil((head?.getBoundingClientRect().height||40)+gh+78);
    S(g, "height", gh+"px");
    S(g, "min-height", gh+"px");
    S(sec, "min-height", sh+"px");
    S(sec.parentElement, "min-height", sh+"px")
  }
  function sections() {
    let root=profileMain();
    if(!root)return[];
    return $('[aria-label="View all Songs"]', root).flatMap(h=> {
      let sec=h.closest(".pb-4")||h.parentElement?.parentElement;
      if(!sec)return[];
      return $(".grid,[data-sc=grid]", sec).filter(g=>g.querySelector('.clip-row[role="group"],div[role="group"][data-clip-status],[data-pinproxy]')).map(g=>({
        sec, g
      }))
    })
  }
  function layoutCards() {
    sections().forEach(({
      sec, g
    })=> {
      A(g, "grid");
      $('.clip-row[role="group"],div[role="group"][data-clip-status]', g).forEach(r=>markCard(r, g));
      fit(sec, g)
    })
  }
  function progRow(i, root) {
    let e=i.parentElement;
    for(let n=0;
    n<10&&e&&e!==root;
    n++, e=e.parentElement)if(getComputedStyle(e).display.includes("flex")&&e.querySelector(C)&&e.children.length>=3)return e
  }
  function playbar() {
    $('[data-playbar=true]').forEach(root=> {
      let i=root.querySelector(C);
      if(!i)return;
      let main=root.querySelector("[data-pb=main]")||[...root.children].find(e=>e.querySelector?.(C));
      if(!main)return;
      A(main, "main", "pb");
      let cs=[...main.children], cen=main.querySelector("[data-pb=c]")||cs.find(e=>e.querySelector?.(C));
      if(!cen)return;
      A(cs[0], "l", "pb");
      A(cen, "c", "pb");
      A(cs[cs.length-1], "r", "pb");
      A(cen.querySelector("[data-pb=ci]")||[...cen.children].find(e=>e.querySelector?.(C)), "ci", "pb");
      let pr=progRow(i, root);
      if(pr) {
        A(pr, "pr", "pb");
        A([...pr.children].find(e=>e.querySelector?.(C)), "tr", "pb")
      }
    })
  }
  function handle() {
    return document.querySelector('p[aria-label^="@"]')?.getAttribute("aria-label")?.replace(/^@/, "")||(location.pathname.match(/^\/@([^/?#]+)/)||[])[1]||""
  }
  let exactHandle="", exactStats=null, exactFetch=null;
  function exactFmt(n) {
    return Number(n).toLocaleString()
  }
  function statBlock(h, raw, trust=false) {
    let x=String(raw||"").replace(/\\+"/g, '"'), esc=h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), hp=[...x.matchAll(new RegExp('"handle"\\s*:\\s*"'+esc+'"', 'gi'))].map(m=>m.index), fp=[...x.matchAll(/"followers_count"\s*:\s*\d+/g)].map(m=>m.index), keys=["clips_count", "followers_count", "following_count", "play_count", "upvote_count"], best=null, score=-1;
    for(const f of fp) {
      if(!trust&&(!hp.length||!hp.some(p=>Math.abs(p-f)<100000)))continue;
      let z=x.slice(Math.max(0, f-6000), Math.min(x.length, f+6000)), o={
      };
      for(const k of keys) {
        let m=z.match(new RegExp('"'+k+'"\\s*:\\s*(\\d+)'));
        if(m)o[k]=+m[1]
      }
      let n=Object.keys(o).length;
      if(o.followers_count!==undefined&&n>score) {
        best=o;
        score=n
      }
    }
    return best
  }
  function embeddedStats(h) {
    for(const sc of $("script")) {
      let s=statBlock(h, sc.textContent);
      if(s)return s
    }
    return null
  }
  async function pageStats(h) {
    try {
      let r=await fetch(`/@${encodeURIComponent(h)}?__suno_exact=${Date.now()}`, {
        credentials:"include", cache:"no-store"
      });
      if(r.ok) {
        let s=statBlock(h, await r.text(), true);
        if(s)return s
      }
    } catch(e) {
    }
    for(const u of [`/api/profiles/v2/${encodeURIComponent(h)}`, `https://studio-api-prod.suno.com/api/profiles/v2/${encodeURIComponent(h)}`])try {
      let r=await fetch(u, {
        credentials:u.startsWith("/")?"include":"omit", cache:"no-store"
      });
      if(!r.ok)continue;
      let d=await r.json();
      if(d?.stats)return d.stats
    } catch(e) {
    }
    return null
  }
  function profileHead() {
    return document.querySelector('p[aria-label^="@"]')?.parentElement||null
  }
  function labelRoot() {
    let h=document.querySelector('p[aria-label^="@"]'), re=/^\d[\d,.]*\s*[KkMm]?\s+(?:songs?|followers?|following)\s*$/i;
    if(!h)return null;
    for(let e=h.parentElement, n=0;
    e&&n<9;
    e=e.parentElement, n++) {
      let hits=$("span,p,a,div", e).filter(x=>x.children.length<3&&re.test(x.textContent.trim())).length;
      if(hits>=2)return e
    }
    return null
  }
  function exactSet(el, n, s="") {
    if(!el||n===undefined)return;
    let v=exactFmt(n)+s;
    if(el.textContent!==v)el.textContent=v;
    el.title=`Exact: ${exactFmt(n)}`;
    el.dataset.sunoExact="1"
  }
  function applyExactStats(st) {
    if(!st)return;
    let head=profileHead();
    if(head)$("span", head).forEach(el=> {
      let t=el.textContent.trim();
      if(!/^\d[\d,.]*\s*[KkMm]?$/.test(t))return;
      let svg=el.previousElementSibling?.tagName==="svg"?el.previousElementSibling:null, d=svg?.querySelector("path")?.getAttribute("d")||"", k=d.startsWith("M6 18")||d.includes("19.378")?"play_count":d.startsWith("M18.881")||d.includes("5.81")?"upvote_count":null;
      if(k&&st[k]!==undefined)exactSet(el, st[k])
    });
    let root=labelRoot();
    if(!root)return;
    let map=[[/^(\d[\d,.]*\s*[KkMm]?)(\s+songs?\s*)$/i, "clips_count"], [/^(\d[\d,.]*\s*[KkMm]?)(\s+followers?\s*)$/i, "followers_count"], [/^(\d[\d,.]*\s*[KkMm]?)(\s+following\s*)$/i, "following_count"]];
    $("span,p,a,div", root).forEach(el=> {
      if(el.children.length>=3)return;
      let t=el.textContent.trim();
      for(const [re, k] of map) {
        let m=t.match(re);
        if(m&&st[k]!==undefined) {
          exactSet(el, st[k], m[2]);
          break
        }
      }
    });
    $("span,p,a", root).forEach(l=> {
      let t=l.textContent.trim().toLowerCase(), k=/^followers?$/.test(t)?"followers_count":t==="following"?"following_count":/^songs?$/.test(t)?"clips_count":null;
      if(!k||st[k]===undefined)return;
      let p=l.parentElement, n=p&&[...p.querySelectorAll("span,p")].find(e=>e!==l&&/^\d[\d,.]*\s*[KkMm]?$/.test(e.textContent.trim()));
      if(n)exactSet(n, st[k])
    })
  }
  // Render exact profile statistics instead of shortened K/M notation.
function exactNumbers() {
    let h=handle();
    if(!h)return;
    if(h!==exactHandle) {
      exactHandle=h;
      exactStats=null;
      exactFetch=null
    }
    if(exactStats) {
      applyExactStats(exactStats);
      return
    }
    let s=embeddedStats(h);
    if(s) {
      exactStats=s;
      applyExactStats(s);
      return
    }
    if(!exactFetch)exactFetch=pageStats(h).then(s=> {
      if(s&&h===exactHandle) {
        exactStats=s;
        applyExactStats(s)
      }
      return s
    })
  }
  function getPins() {
    let h=handle(), out=[], seen=new Set;
    for(const sc of $("script")) {
      let src=sc.textContent||"";
      if(!src.includes("user_pinned_songs"))continue;
      if(h&&src.includes('\\"handle\\":\\"')&&!src.includes(`\\"handle\\":\\"${h}\\"`))continue;
      let parts=src.split(/\\"content_id\\":/), on=false;
      for(const p of parts) {
        if(p.startsWith('\\"pinned_songs_feed\\"')) {
          on=true;
          continue
        }
        if(on&&(p.startsWith('\\"songs_feed\\"')||p.startsWith('\\"playlists_feed\\"')))break;
        if(!on)continue;
        let id=(p.match(/\\"id\\":\\"([0-9a-f-]{36})\\"/)||[])[1];
        if(!id||seen.has(id))continue;
        seen.add(id);
        out.push({
          id, title:D((p.match(/\\"title\\":\\"(.*?)\\"/)||[])[1]), image_url:D((p.match(/\\"image_url\\":\\"(.*?)\\"/)||[])[1]), play_count:+((p.match(/\\"play_count\\":(\d+)/)||[])[1]||0), upvote_count:+((p.match(/\\"upvote_count\\":(\d+)/)||[])[1]||0)
        });
        if(out.length>=5)break
      }
      if(out.length)break
    }
    return out
  }
  function songId(cell) {
    return cell.querySelector('a[href^="/song/"]')?.getAttribute("href")?.match(/\/song\/([0-9a-f-]{36})/)?.[1]||""
  }
  function hideCarousel() {
    let root=profileMain(), wrap=root?.querySelector('div[class*="group/carousel"]'), box=wrap?.closest(".pb-4")||wrap;
    if(!box)return null;
    box.dataset.carouselProxy="1";
    S(box, "display", "block");
    S(box, "position", "fixed");
    S(box, "left", "-12000px");
    S(box, "top", "-12000px");
    S(box, "width", "1200px");
    S(box, "height", "600px");
    S(box, "max-width", "1200px");
    S(box, "max-height", "600px");
    S(box, "opacity", "0");
    S(box, "pointer-events", "none");
    S(box, "z-index", "-1");
    S(box, "overflow", "hidden");
    S(box, "visibility", "visible");
    S(box, "transform", "none");
    S(box, "clip-path", "inset(0)");
    if(wrap) {
      S(wrap, "display", "block");
      S(wrap, "visibility", "visible");
      S(wrap, "opacity", "1");
      S(wrap, "pointer-events", "auto")
    }
    return box
  }
  function press(el) {
    if(!el)return false;
    ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(t=> {
      try {
        el.dispatchEvent(t.startsWith("pointer")?new PointerEvent(t, {
          bubbles:true, cancelable:true, pointerType:"mouse", isPrimary:true
        }):new MouseEvent(t, {
          bubbles:true, cancelable:true, view:window
        }))
      } catch(e) {
        try {
          el.dispatchEvent(new MouseEvent(t, {
            bubbles:true, cancelable:true, view:window
          }))
        } catch(_) {
        }
      }
    });
    return true
  }
  function carouselCard(box, id) {
    let a=$(`a[href^="/song/${id}"]`, box)[0];
    return a?.closest('[role="button"]')||a?.closest(".group")||a?.parentElement||null
  }
  function clickPlay(card) {
    if(!card)return false;
    let b=$('button[aria-label="Play"],button[aria-label^="Play "],button[aria-label="Playing"],button[aria-label^="Playing "]', card)[0]||$('[role="button"][aria-label^="Play"]', card)[0];
    return press(b||card)
  }
  function tryPlay(box, id) {
    let card=carouselCard(box, id);
    return card?clickPlay(card):false
  }
  function playViaCarousel(song, index) {
    let box=hideCarousel();
    if(!box)return false;
    if(tryPlay(box, song.id))return true;
    let dot=box.querySelector(`[aria-label="Show featured song ${index+1}"]`);
    if(dot)press(dot);
    else {
      let next=box.querySelector('[aria-label="Next featured song"]');
      for(let i=0;
      i<index+1;
      i++)press(next)
    }
    let tries=0, t=setInterval(()=> {
      if(tryPlay(box, song.id)||++tries>35)clearInterval(t)
    }, 120);
    return true
  }
  function makeProxy(s, i) {
    let cell=document.createElement("div");
    cell.dataset.sc="cell";
    cell.dataset.pinproxy="1";
    cell.dataset.songId=s.id;
    cell.style.setProperty("order", String(i), "important");
    cell.innerHTML=`<div class="group" data-sc="grp"><div><div class="clip-row" role="group" aria-label="${E(s.title)}" data-sc="row"><div data-sc="in"><div class="clip-image-container cursor-pointer" role="button" tabindex="0" aria-label="Play ${E(s.title)}"><img alt="${E(s.title)} artwork" src="${E(U(s.image_url))}"><button data-pplay aria-label="Play ${E(s.title)}">▶</button></div><div data-sc="txt"><div class="flex items-center gap-2"><div><div class="clip-title-wrapper"><a class="hover:underline" href="/song/${s.id}" title="${E(s.title)}">${E(s.title)}</a></div></div></div><div style="font-size:12px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">▶ ${F(s.play_count)} · ♡ ${F(s.upvote_count)}</div></div></div></div></div></div>`;
    return cell
  }
  function applyPins() {
    let pins=getPins();
    if(!pins.length)return false;
    hideCarousel();
    let target=sections()[0];
    if(!target)return false;
    let g=target.g, map=new Map(pins.map((s, i)=>[s.id, {
      s, i
    }])), cells=$("[data-sc=cell]", g).length?$("[data-sc=cell]", g):[...g.children].filter(c=>c.querySelector?.(".clip-row")), existing=new Set, normal=0, changed=false;
    g.__sunoPinnedSongs=pins;
    cells.forEach(c=> {
      if(c.dataset.pinproxy)return;
      let id=songId(c);
      if(!id)return;
      existing.add(id);
      let p=map.get(id), ord=p?p.i:100+normal++;
      if(p)c.dataset.sunoPinned="1";
      else delete c.dataset.sunoPinned;
      if(c.style.getPropertyValue("order")!==String(ord)) {
        changed=true;
        c.style.setProperty("order", String(ord), "important")
      }
    });
    $("[data-pinproxy]", g).forEach(c=> {
      let id=c.dataset.songId;
      if(existing.has(id)||!map.has(id)) {
        changed=true;
        c.remove()
      }
    });
    pins.forEach((s, i)=> {
      if(existing.has(s.id))return;
      if(!g.querySelector(`[data-pinproxy][data-song-id="${s.id}"]`)) {
        changed=true;
        g.insertBefore(makeProxy(s, i), g.firstChild)
      }
    });
    if(!g.dataset.pinProxyHandler) {
      g.dataset.pinProxyHandler="1";
      g.addEventListener("click", e=> {
        let p=e.target.closest("[data-pinproxy]");
        if(!p||!g.contains(p))return;
        if(e.target.closest('a[href^="/song/"]')&&!e.target.closest("[data-pplay],.clip-image-container"))return;
        e.preventDefault();
        e.stopPropagation();
        let songs=g.__sunoPinnedSongs||getPins(), id=p.dataset.songId, idx=songs.findIndex(s=>s.id===id);
        if(idx>=0)playViaCarousel(songs[idx], idx)
      })
    }
    return changed
  }
  function clearPlayDiscs() {
    $('button[aria-label="Play"],button[aria-label^="Play "],button[aria-label="Pause"],button[aria-label^="Pause "],button[aria-label="Playing"],button[aria-label^="Playing "]').forEach(b=> {
      let cls=String(b.className||"");
      if(b.closest('.clip-image-container')||b.closest('[data-sc=row]')||b.parentElement?.className?.toString().includes('absolute inset-0 z-20')||(cls.includes('bg-background')&&cls.includes('rounded-full'))||cls.includes('backdrop-blur')) {
        S(b, "background", "transparent");
        S(b, "background-color", "transparent");
        S(b, "box-shadow", "none");
        S(b, "backdrop-filter", "none");
        S(b, "-webkit-backdrop-filter", "none");
        S(b, "border-color", "transparent")
      }
    })
  }
  function clearOverlayDiscs() {
    $('.clip-image-container [class*="bg-black/"][class*="backdrop-blur"],.clip-image-container [class*="bg-black"][class*="rounded-full"],.clip-image-container [class*="rounded-full"][class*="backdrop-blur"]').forEach(d=> {
      let hasIcon=d.querySelector?.('svg');
      if(!hasIcon)return;
      S(d, "background", "transparent");
      S(d, "background-color", "transparent");
      S(d, "box-shadow", "none");
      S(d, "backdrop-filter", "none");
      S(d, "-webkit-backdrop-filter", "none")
    })
  }
  function badSongArea(e) {
    return!!e?.closest?.('[data-playbar="true"],[data-carousel-proxy="1"],div[class*="group/carousel"]')
  }
  function visibleEnough(e) {
    let r=e.getBoundingClientRect();
    return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight*4
  }
  function rowFromSongLink(a) {
    let e=a;
    for(let i=0;
    i<10&&e&&e!==document.body;
    i++, e=e.parentElement) {
      let c=String(e.className||""), r=e.getBoundingClientRect();
      if(c.includes("border-b")&&c.includes("flex")&&c.includes("flex-row")&&r.width>180&&r.height>=40&&r.height<=160)return e
    }
    e=a;
    for(let i=0;
    i<10&&e&&e!==document.body;
    i++, e=e.parentElement) {
      let r=e.getBoundingClientRect(), img=e.querySelector?.("img"), ln=e.querySelectorAll?.('a[href^="/song/"]').length||0;
      if(img&&ln&&r.width>180&&r.height>=40&&r.height<=180)return e
    }
    return null
  }
  function markNewRow(row, g) {
    A(row, "row");
    row.dataset.sunoNewrow="1";
    row.removeAttribute("height");
    let cell=row;
    while(cell.parentElement&&cell.parentElement!==g)cell=cell.parentElement;
    if(cell?.parentElement===g) {
      A(cell, "cell");
      cell.dataset.sunoNewcell="1"
    }
    let img=$('a[href^="/song/"] img', row)[0]||row.querySelector("img");
    if(img) {
      img.dataset.sunoCardImg="1";
      fixImg(img)
    }
    let art=img?.closest('a[href^="/song/"]')||img?.parentElement;
    if(art)A(art, "art");
    let textLink=$('a[href^="/song/"]', row).find(x=>!x.querySelector("img"));
    let txt=textLink?.closest("div");
    if(!txt) {
      let kids=[...row.children];
      txt=kids.find(x=>x!==art&&x.textContent?.trim()&&x.querySelector?.('a[href^="/song/"]'))||kids.find(x=>x!==art&&x.textContent?.trim())
    }
    A(txt, "txt");
    let menu=row.querySelector('[data-context-menu-trigger="true"],[aria-label*="More"],[aria-label*="menu"],[aria-label*="Menu"]');
    A(menu?.closest("div")||menu, "menu")
  }
  function newSections() {
    let root=profileMain(), rows=[];
    if(!root)return[];
    $('a[href^="/song/"]', root).forEach(a=> {
      if(badSongArea(a)||!visibleEnough(a))return;
      let img=a.querySelector("img")||a.closest("div")?.querySelector("img");
      if(!img)return;
      let row=rowFromSongLink(a);
      if(row&&!rows.includes(row)&&!badSongArea(row))rows.push(row)
    });
    if(!rows.length)return[];
    let groups=new Map;
    rows.forEach(r=> {
      let g=r.parentElement;
      if(g)groups.set(g, (groups.get(g)||0)+1)
    });
    let g=[...groups].sort((a, b)=>b[1]-a[1])[0]?.[0];
    if(!g)return[];
    let sec=g.closest(".pb-4")||g.parentElement||g;
    return[{
      sec, g, rows:rows.filter(r=>r.parentElement===g)
    }]
  }
  function layoutNewRows() {
    let out=false;
    newSections().forEach(({
      sec, g, rows
    })=> {
      A(g, "grid");
      rows.forEach(r=>markNewRow(r, g));
      fit(sec, g);
      out=true
    });
    return out
  }
  // Move profile/about information into the banner area.
function aboutInBanner() {
    let handle=document.querySelector('p[aria-label^="@"]'), did="suno-profile-description-banner", gid="suno-profile-genres-banner", desc=document.getElementById(did), tags=document.getElementById(gid);
    if(!handle) {
      desc?.remove();
      tags?.remove();
      return
    }
    let info=handle.parentElement;
    if(!info||!info.querySelector('h1[aria-label]'))return;
    let card=null, source=null;
    for(let c of $('div[class*="rounded-3xl"]')) {
      if(c.querySelector('img[width="120"][height="120"]')&&(c.querySelector('div[class*="min-h-5"]>p')||c.querySelector('a[href^="/genre/"]'))) {
        card=c;
        break
      }
    }
    if(card)source=card.querySelector('div[class*="min-h-5"]>p');
    if(!source)for(let p of $('div[class*="min-h-5"]>p,p')) {
      if(p.id===did||p===handle||badSongArea(p))continue;
      let t=p.textContent.trim(), c=p.closest('div[class*="rounded-3xl"]');
      if(t&&(p.parentElement?.className?.includes("min-h-5")||(c&&c.querySelector('img[width="120"][height="120"]')))) {
        source=p;
        card=c;
        break
      }
    }
    if(source) {
      if(!desc) {
        desc=document.createElement("p");
        desc.id=did;
        desc.setAttribute("data-suno-about-banner", "1");
        info.appendChild(desc)
      }
      let text=source.textContent.trim();
      if(desc.textContent!==text)desc.textContent=text;
      S(desc, "display", "block");
      S(desc, "width", "100%");
      S(desc, "max-width", "48rem");
      S(desc, "margin", "0.375rem 0 0");
      S(desc, "font-size", "0.875rem");
      S(desc, "line-height", "1.25rem");
      S(desc, "font-weight", "400");
      S(desc, "color", "rgba(255,255,255,.78)");
      S(desc, "white-space", "normal");
      S(desc, "overflow-wrap", "anywhere")
    } else desc?.remove();
    let genres=card?$('a[href^="/genre/"]', card):[];
    if(genres.length) {
      if(!tags) {
        tags=document.createElement("div");
        tags.id=gid;
        tags.setAttribute("data-suno-about-genres-banner", "1");
        info.appendChild(tags)
      }
      let sig=genres.map(a=>(a.getAttribute("href")||"")+"|"+a.textContent.trim()).join("\n");
      if(tags.dataset.sig!==sig) {
        tags.replaceChildren(...genres.map(a=> {
          let n=a.cloneNode(true);
          n.removeAttribute("id");
          return n
        }));
        tags.dataset.sig=sig
      }
      S(tags, "display", "flex");
      S(tags, "flex-wrap", "wrap");
      S(tags, "align-items", "center");
      S(tags, "gap", "0.5rem");
      S(tags, "width", "100%");
      S(tags, "max-width", "48rem");
      S(tags, "margin", "0.5rem 0 0")
    } else tags?.remove()
  }
  // Improve playlist cover presentation.
function playlistCovers() {
    $('li>[role="button"][aria-roledescription="sortable"] .clip-row .clip-image-container img').forEach(fixImg)
  }
  let plLikeMap=new Map, plLikeUrls=new Set, plLikeLoading=false;
  function plRows() {
    return $('li>[role="button"][aria-roledescription="sortable"] .clip-row')
  }
  function plSongId(r) {
    return(r.querySelector('a[href^="/song/"]')?.getAttribute("href")||"").match(/\/song\/([0-9a-f-]{36})/i)?.[1]||""
  }
  function plPlaySpan(r) {
    return[...r.querySelectorAll("span")].find(e=> {
      let p=e.querySelector("svg path"), d=p?.getAttribute("d")||"";
      return(d.startsWith("M6 18")||d.includes("19.378"))&&/\d/.test(e.textContent||"")
    })
  }
  function plNum(v) {
    let n=Number(v);
    return Number.isFinite(n)&&n>=0?Math.trunc(n):null
  }
  function plIndex(v, seen=new WeakSet, depth=0, budget={
    n:0
  }) {
    if(v==null||depth>9||budget.n++>5000)return;
    if(typeof v==="string") {
      if(v.length<80||!v.includes("upvote_count"))return;
      let re=/["\\]?(?:id|clip_id)["\\]?\s*:\s*["\\]([0-9a-f-]{36})["\\][\s\S]{0,1800}?["\\]?upvote_count["\\]?\s*:\s*(\d+)/gi, m;
      while((m=re.exec(v)))plLikeMap.set(m[1].toLowerCase(), +m[2]);
      return
    }
    if(typeof v!=="object"||seen.has(v))return;
    seen.add(v);
    let id=String(v.id||v.clip_id||v.uuid||"").toLowerCase(), u=plNum(v.upvote_count);
    if(/^[0-9a-f-]{36}$/.test(id)&&u!==null)plLikeMap.set(id, u);
    let keys;
    try {
      keys=Object.keys(v)
    } catch(e) {
      return
    }
    for(const k of keys) {
      if(k==="stateNode"||k==="alternate"||k==="return"||k==="child"||k==="sibling"||k==="_owner")continue;
      let x;
      try {
        x=v[k]
      } catch(e) {
        continue
      }
      plIndex(x, seen, depth+1, budget)
    }
  }
  function plReactLike(r, id) {
    let nodes=[r, r.parentElement, r.parentElement?.parentElement, r.closest("li")].filter(Boolean);
    for(const n of nodes) {
      let keys;
      try {
        keys=Object.keys(n)
      } catch(e) {
        continue
      }
      for(const k of keys) {
        if(!k.startsWith("__reactProps$")&&!k.startsWith("__reactFiber$"))continue;
        let root;
        try {
          root=n[k]
        } catch(e) {
          continue
        }
        plIndex(root);
        let got=plLikeMap.get(id);
        if(got!==undefined)return got;
        if(k.startsWith("__reactFiber$")) {
          let f=root, steps=0;
          while(f&&steps++<10) {
            plIndex(f.memoizedProps);
            plIndex(f.pendingProps);
            plIndex(f.memoizedState);
            got=plLikeMap.get(id);
            if(got!==undefined)return got;
            f=f.return
          }
        }
      }
    }
    return null
  }
  function plNextData() {
    try {
      plIndex(window.__next_f)
    } catch(e) {
    }
    for(const sc of $("script")) {
      let t=sc.textContent||"";
      if(t.includes("upvote_count"))plIndex(t)
    }
  }
  function plRenderLikes() {
    plRows().forEach(r=> {
      let id=plSongId(r).toLowerCase(), ps=plPlaySpan(r), host=ps?.parentElement;
      if(!id||!ps||!host)return;
      let u=plLikeMap.get(id);
      if(u===undefined)u=plReactLike(r, id);
      let old=host.querySelector('[data-suno-pl-like="1"]');
      if(u===null||u===undefined) {
        old?.remove();
        return
      }
      if(!old) {
        old=document.createElement("span");
        old.dataset.sunoPlLike="1";
        old.className="inline-flex shrink-0 cursor-default items-center gap-1 text-xs leading-[0.875rem] select-none";
        old.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" class="h-3 w-3"><g><path d="M18.881 8.288q.648 0 1.133.494.486.495.486 1.154v1.648a1.7 1.7 0 0 1-.121.618l-2.429 5.81a1.66 1.66 0 0 1-.607.7q-.425.288-.89.288H9.975q-.668 0-1.143-.484a1.6 1.6 0 0 1-.476-1.164V8.968q0-.33.132-.629.13-.299.354-.525l4.392-4.45a1.3 1.3 0 0 1 1.517-.206q.385.207.557.577.172.371.07.762l-.91 3.79zM5.119 19q-.668 0-1.143-.484a1.6 1.6 0 0 1-.476-1.164V9.936q0-.68.476-1.164a1.55 1.55 0 0 1 1.143-.484q.667 0 1.144.484.475.484.475 1.164v7.416q0 .68-.476 1.164A1.55 1.55 0 0 1 5.12 19"></path></g></svg><span></span>';
        ps.after(old)
      }
      old.querySelector("span").textContent=F(u);
      old.title=F(u)+" likes"
    })
  }
  async function plLoadResourceData() {
    if(plLikeLoading)return;
    let rows=plRows(), missing=rows.map(plSongId).filter(id=>id&&!plLikeMap.has(id.toLowerCase()));
    if(!missing.length)return;
    plLikeLoading=true;
    try {
      plNextData();
      plRenderLikes();
      missing=missing.filter(id=>!plLikeMap.has(id.toLowerCase()));
      if(!missing.length)return;
      let urls=performance.getEntriesByType("resource").map(e=>e.name).filter(u=>/\/api\//i.test(u)&&/playlist/i.test(u)&&!plLikeUrls.has(u)).slice(-4);
      for(const u of urls) {
        plLikeUrls.add(u);
        try {
          let r=await fetch(u, {
            credentials:"include", cache:"default"
          });
          if(!r.ok)continue;
          let ct=r.headers.get("content-type")||"", v=ct.includes("json")?await r.json():await r.text();
          plIndex(v);
          plRenderLikes()
        } catch(e) {
        }
      }
    } finally {
      plLikeLoading=false
    }
  }
  // Replace abbreviated playlist-like counts where full values are available.
function playlistLikes() {
    if(!plRows().length)return;
    plNextData();
    plRenderLikes();
    plLoadResourceData()
  }
  let lnParents=new Map, lnKinds=new Map, lnRowSeen=new WeakMap, lnLastDetail=0, lnSaveTimer=0, LNSTORE="__suno_create_lineage_v26";
  function lnNorm(v) {
    let s="";
    if(typeof v==="string")s=v;
    else if(v&&typeof v==="object")s=v.id||v.clip_id||v.uuid||"";
    s=String(s||"").replace(/^m_/, "").toLowerCase();
    return/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)&&s!=="00000000-0000-0000-0000-000000000000"?s:""
  }
  function lnLoad() {
    try {
      let d=JSON.parse(sessionStorage.getItem(LNSTORE)||"{}"), p=d.parents|| {
      };
      for(const[id, v]of Object.entries(p)) {
        let a=lnNorm(id), b=lnNorm(v?.parent||v);
        if(a&&b&&a!==b) {
          lnParents.set(a, b);
          if(v?.kind)lnKinds.set(a, String(v.kind))
        }
      }
    } catch(e) {
    }
  }
  function lnSave() {
    clearTimeout(lnSaveTimer);
    lnSaveTimer=setTimeout(()=> {
      try {
        let p={
        };
        for(const[id, parent]of lnParents)p[id]={
          parent, kind:lnKinds.get(id)||"derived"
        };
        sessionStorage.setItem(LNSTORE, JSON.stringify({
          parents:p
        }))
      } catch(e) {
      }
    }, 120)
  }
  function lnSet(id, parent, kind="derived") {
    id=lnNorm(id);
    parent=lnNorm(parent);
    if(!id||!parent||id===parent)return false;
    let changed=lnParents.get(id)!==parent||lnKinds.get(id)!==kind;
    if(changed) {
      lnParents.set(id, parent);
      lnKinds.set(id, kind);
      lnSave()
    }
    return changed
  }
  function lnVal(o, m, k) {
    let v;
    try {
      v=m?.[k]
    } catch(e) {
    }
    if(v!==undefined&&v!==null&&v!=="")return v;
    try {
      return o?.[k]
    } catch(e) {
      return undefined
    }
  }
  function lnFirst(v) {
    if(Array.isArray(v)) {
      for(const x of v) {
        let id=lnNorm(x);
        if(id)return id;
        if(x&&typeof x==="object") {
          id=lnNorm(x.id||x.clip_id||x.uuid);
          if(id)return id
        }
      }
    }
    return lnNorm(v)
  }
  function lnParent(o) {
    let m=o?.metadata&&typeof o.metadata==="object"?o.metadata:{
    }, get=k=>lnNorm(lnVal(o, m, k)), task=String(lnVal(o, m, "task")||"").toLowerCase(), type=String(lnVal(o, m, "type")||lnVal(o, m, "clip_type")||"").toLowerCase(), p="", kind="";
    if(task==="infill"||task==="fixed_infill") {
      p=get("override_history_clip_id")||get("override_future_clip_id")||lnFirst(lnVal(o, m, "history"))||get("edited_clip_id");
      kind="section"
    } else if(task==="extend") {
      p=lnFirst(lnVal(o, m, "history"))||get("edited_clip_id")||get("continue_clip_id");
      kind="extend"
    } else if(type==="concat") {
      p=lnFirst(lnVal(o, m, "concat_history"))||get("edited_clip_id");
      kind="stitch"
    } else if(type==="edit_speed") {
      p=get("speed_clip_id")||get("edited_clip_id");
      kind="speed"
    } else if(task==="cover") {
      p=get("cover_clip_id")||get("edited_clip_id");
      kind="cover"
    } else if(type==="upsample"||task==="upsample") {
      p=get("upsample_clip_id")||get("remaster_clip_id")||get("edited_clip_id");
      kind="remaster"
    } else if(type==="edit_v3_export") {
      p=get("edited_clip_id");
      kind="edit"
    }
    if(!p) {
      for(const k of["cover_clip_id", "remix_clip_id", "sample_clip_id", "chop_sample_clip_id", "source_clip_id", "reference_clip_id", "continue_clip_id", "infill_clip_id", "underpainting_clip_id", "overpainting_clip_id", "stem_from_id", "speed_clip_id", "upsample_clip_id", "edited_clip_id"]) {
        p=get(k);
        if(p) {
          kind=k.replace(/_clip_id$/, "");
          break
        }
      }
    }
    if(!p) {
      let roots=lnVal(o, m, "clip_roots"), list=Array.isArray(roots)?roots:Array.isArray(roots?.clips)?roots.clips:[];
      p=lnFirst(list);
      if(p)kind=String(roots?.clip_attribution_type||"root")
    }
    return {
      parent:p, kind:kind||"derived"
    }
  }
  function lnRecord(o) {
    if(!o||typeof o!=="object")return false;
    let id=lnNorm(o.id||o.clip_id||o.uuid);
    if(!id)return false;
    let q=lnParent(o);
    return q.parent?lnSet(id, q.parent, q.kind):false
  }
  function lnWalk(v, seen=new WeakSet, depth=0, budget={
    n:0
  }) {
    if(v==null||depth>11||budget.n++>(budget.max||9000))return;
    if(typeof v==="string") {
      if(v.length<60||v.length>180000||!/(?:clip_id|clip_roots|history|stem_from_id)/.test(v))return;
      let t=v.trim();
      if(t[0]==="{"||t[0]==="[")try {
        lnWalk(JSON.parse(t), seen, depth+1, budget)
      } catch(e) {
      }
      return
    }
    if(typeof v!=="object"||seen.has(v))return;
    seen.add(v);
    lnRecord(v);
    if(v.nodeType)return;
    let keys;
    try {
      keys=Object.keys(v)
    } catch(e) {
      return
    }
    for(const k of keys) {
      if(k==="stateNode"||k==="alternate"||k==="return"||k==="child"||k==="sibling"||k==="_owner")continue;
      let x;
      try {
        x=v[k]
      } catch(e) {
        continue
      }
      lnWalk(x, seen, depth+1, budget)
    }
  }
  function lnReactNode(n, seen=new WeakSet, budget={
    n:0, max:5000
  }) {
    if(!n)return;
    let keys;
    try {
      keys=Object.getOwnPropertyNames(n)
    } catch(e) {
      return
    }
    for(const k of keys) {
      if(!k.startsWith("__reactProps$")&&!k.startsWith("__reactFiber$"))continue;
      let x;
      try {
        x=n[k]
      } catch(e) {
        continue
      }
      if(k.startsWith("__reactProps$")) {
        lnWalk(x, seen, 0, budget)
      } else {
        let f=x, steps=0;
        while(f&&steps++<22&&budget.n<budget.max) {
          lnWalk(f.memoizedProps, seen, 0, budget);
          lnWalk(f.pendingProps, seen, 0, budget);
          lnWalk(f.memoizedState, seen, 0, budget);
          f=f.return
        }
      }
    }
  }
  function lnRowId(r) {
    return lnNorm((r.querySelector('a[href^="/song/"]')?.getAttribute("href")||"").split("/song/")[1]?.split(/[?#]/)[0])
  }
  function lnScanRow(r) {
    let id=lnRowId(r);
    if(!id||lnRowSeen.get(r)===id)return;
    lnRowSeen.set(r, id);
    let nodes=[r, r.parentElement, r.closest('[draggable="true"]'), r.querySelector('a[href^="/song/"]'), r.querySelector('[aria-label^="Play "]'), r.querySelector('button[aria-label="Edit title"]'), r.querySelector('button[aria-label="More options"]')].filter(Boolean), count=0;
    for(const n of r.querySelectorAll("*")) {
      if(count>=18)break;
      let ks;
      try {
        ks=Object.getOwnPropertyNames(n)
      } catch(e) {
        continue
      }
      if(ks.some(k=>k.startsWith("__reactProps$")||k.startsWith("__reactFiber$"))) {
        nodes.push(n);
        count++
      }
    }
    let seen=new WeakSet, budget={
      n:0, max:3500
    };
    for(const n of new Set(nodes)) {
      if(budget.n>=budget.max)break;
      lnReactNode(n, seen, budget)
    }
  }
  function lnLinkId(a) {
    return lnNorm((a?.getAttribute("href")||"").split("/song/")[1]?.split(/[?#]/)[0])
  }
  function lnDetailPanel() {
    let candidates=[];
    for(const seed of $("button, a, [role=button]")) {
      let t=(seed.textContent||"").trim();
      if(!/^(?:Show More|Remix\/Edit)$/i.test(t)&&!/(?:Cover|Remix|Sample|Extended?|Stemmed?|Remastered?)\s+(?:of|from)/i.test(t))continue;
      let n=seed;
      for(let i=0;
      n&&i<13;
      i++, n=n.parentElement) {
        let links=n.querySelectorAll?.('a[href^="/song/"]')||[];
        let tx=(n.textContent||"").replace(/\s+/g, " ");
        if(links.length>=2&&/(?:Remix\/Edit|Cover\s+of|Remix\s+of|Sample(?:d)?\s+from|Extend(?:ed)?\s+from|Stemmed\s+from|Remastered\s+from)/i.test(tx))candidates.push(n)
      }
    }
    if(!candidates.length)return null;
    candidates.sort((a, b)=>(a.textContent||"").length-(b.textContent||"").length);
    return candidates[0]
  }
  function lnDomRelation(panel) {
    if(!panel)return;
    let links=[...panel.querySelectorAll('a[href^="/song/"]')], counts=new Map;
    for(const a of links) {
      let id=lnLinkId(a);
      if(id)counts.set(id, (counts.get(id)||0)+1)
    }
    let child=[...counts].sort((a, b)=>b[1]-a[1])[0]?.[0]||"";
    if(!child)return;
    for(const a of links) {
      let parent=lnLinkId(a);
      if(!parent||parent===child)continue;
      let n=a, txt="";
      for(let i=0;
      n&&i<5;
      i++, n=n.parentElement) {
        txt=(n.textContent||"").replace(/\s+/g, " ").trim();
        if(/(?:Cover|Remix|Sample|Extended?|Stemmed?|Remastered?)\s+(?:of|from)/i.test(txt))break
      }
      let m=txt.match(/(Cover|Remix|Sample|Extended?|Stemmed?|Remastered?)/i);
      if(m)lnSet(child, parent, m[1].toLowerCase())
    }
  }
  function lnScanDetail() {
    let panel=lnDetailPanel();
    if(!panel)return;
    lnDomRelation(panel);
    let nodes=[panel], seedCount=0;
    for(const n of panel.querySelectorAll("*")) {
      if(seedCount>=35)break;
      let ks;
      try {
        ks=Object.getOwnPropertyNames(n)
      } catch(e) {
        continue
      }
      if(ks.some(k=>k.startsWith("__reactProps$")||k.startsWith("__reactFiber$"))) {
        nodes.push(n);
        seedCount++
      }
    }
    let seen=new WeakSet, budget={
      n:0, max:14000
    };
    for(const n of new Set(nodes)) {
      if(budget.n>=budget.max)break;
      lnReactNode(n, seen, budget)
    }
  }
  function lnRoot(id) {
    let cur=lnNorm(id), seen=new Set, last=cur;
    for(let i=0;
    i<64&&cur&&!seen.has(cur);
    i++) {
      seen.add(cur);
      last=cur;
      let p=lnParents.get(cur);
      if(!p||p===cur)return cur;
      cur=p
    }
    return last
  }
  function lnHash(s) {
    let h=2166136261;
    for(let i=0;
    i<s.length;
    i++)h=Math.imul(h^s.charCodeAt(i), 16777619);
    return h>>>0
  }
  function lnColor(root) {
    let t=String(root||""), h=2166136261;
    for(let i=0;
    i<t.length;
    i++) {
      h^=t.charCodeAt(i);
      h=Math.imul(h, 16777619)
    }
    h>>>=0;
    let hue=h%360, sat=28+((h>>>8)%9), light=23+((h>>>16)%5);
    return {
      index:String(h%36), background:`hsla(${hue},${sat}%,${light}%,.82)`, edge:`hsla(${hue},${Math.min(52,sat+14)}%,${Math.min(62,light+29)}%,.72)`
    }
  }
  // Group locally known parent/child songs and apply stable family colors.
function createLineageColorsSafe() {
    try {
      let rows=$('[data-testid="clip-row"] a[href^="/song/"]').map(a=>a.closest('[data-testid="clip-row"]')).filter(Boolean);
      rows.forEach(lnScanRow);
      let now=Date.now();
      if(now-lnLastDetail>350) {
        lnLastDetail=now;
        lnScanDetail()
      }
      let items=rows.map(row=>({
        row, id:lnRowId(row)
      })).filter(x=>x.id), children=new Set(lnParents.values()), groups=new Map;
      for(const x of items) {
        x.root=lnRoot(x.id);
        x.parent=lnParents.get(x.id)||"";
        x.row.setAttribute("data-suno-lineage-known", x.parent||children.has(x.id)?"1":"0");
        if(x.parent)x.row.setAttribute("data-suno-lineage-parent", x.parent);
        else x.row.removeAttribute("data-suno-lineage-parent");
        x.row.setAttribute("data-suno-lineage-root", x.root);
        if(!groups.has(x.root))groups.set(x.root, []);
        groups.get(x.root).push(x)
      }
      let active=new Set, activeGroups=[];
      for(const[root, g]of groups) {
        let ids=new Set(g.map(x=>x.id)), related=g.some(x=>x.parent||children.has(x.id));
        if(ids.size<2||!related)continue;
        let c=lnColor(root);
        activeGroups.push({
          root, color:c.index, count:ids.size
        });
        for(const x of g) {
          active.add(x.row);
          x.row.setAttribute("data-suno-lineage-color", c.index);
          x.row.style.setProperty("background-color", c.background, "important");
          x.row.style.setProperty("box-shadow", `inset 5px 0 0 ${c.edge}`, "important");
          x.row.style.setProperty("border-radius", ".5rem", "important")
        }
      }
      for(const r of $('[data-suno-lineage-known]'))if(!active.has(r)) {
        r.removeAttribute("data-suno-lineage-color");
        r.style.removeProperty("background-color");
        r.style.removeProperty("box-shadow");
        r.style.removeProperty("border-radius")
      }
      window.__sunoLineageV30={
        ok:true, parents:lnParents.size, rows:items.length, activeGroups, lastRun:Date.now()
      }
    } catch(e) {
      window.__sunoLineageV30={
        ok:false, error:String(e), stack:e&&e.stack||"", lastRun:Date.now()
      }
    }
  }
  lnLoad();
  try {
    delete window.__sunoLineageV27;
    delete window.__sunoLineageV28
  } catch(e) {
  }
  // Force the Create-page title edit button to remain visible.
function createTitleEdit() {
    $('[data-testid="clip-row"] button[aria-label="Edit title"]').forEach(b=> {
      b.removeAttribute("hidden");
      S(b, "display", "inline-flex");
      S(b, "opacity", "1");
      S(b, "visibility", "visible");
      S(b, "pointer-events", "auto");
      S(b, "transform", "none");
      S(b, "position", "relative");
      S(b, "inset", "auto");
      S(b, "width", "1.5rem");
      S(b, "min-width", "1.5rem");
      S(b, "max-width", "none");
      S(b, "height", "1.5rem");
      S(b, "flex", "0 0 1.5rem");
      S(b, "margin-left", ".25rem");
      S(b, "clip-path", "none");
      A(b, "1", "suno-title-edit");
      let p=b.parentElement;
      if(p) {
        S(p, "display", "flex");
        S(p, "align-items", "center");
        S(p, "overflow", "visible");
        S(p, "visibility", "visible");
        S(p, "opacity", "1")
      }
    })
  }
  // Main idempotent refresh pass. Safe to call after every relevant DOM mutation.
function run() {
    wide();
    playlistCovers();
    playlistLikes();
    createTitleEdit();
    createLineageColorsSafe();
    layoutCards();
    let nr=layoutNewRows(), ch=applyPins();
    if(ch||nr) {
      layoutCards();
      layoutNewRows()
    }
    clearPlayDiscs();
    clearOverlayDiscs();
    playbar();
    exactNumbers();
    aboutInBanner();
    clearPlayDiscs();
    clearOverlayDiscs()
  }
  // ---------------------------------------------------------------------------
// Mutation scheduling and initialization
// ---------------------------------------------------------------------------
let raf=0, sched=()=>raf||(raf=requestAnimationFrame(()=> {
    raf=0;
    run()
  }));
  run();
  window[OBS]=new MutationObserver(sched);
  window[OBS].observe(document.body, {
    childList:true, subtree:true
  });
  window.addEventListener("resize", sched, {
    passive:true
  })
})();

//# sourceURL=suno-tweaks-v30-readable.js