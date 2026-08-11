/**
 * Suno Tweaks v90 — Simple timestamp seek
 *
 * Loaded by the persistent local-file bookmarklet. The script keeps the accepted
 * layout, playlist, title-edit and title-expansion behaviour while adding a compact
 * multi-source ancestry browser for the Create workspace.
 *
 * Design principles:
 * - Background family colouring has been removed completely.
 * - Workspace and clip requests are deduplicated and processed outside the DOM observer.
 * - At most two background requests run simultaneously.
 * - Existing observers from older versions are disconnected before initialization.
 * - DOM changes are reapplied through one throttled MutationObserver.
 * - Known source relations and song metadata are cached in sessionStorage.
 * - Workspace navigation uses measured rows, validated clip sequences and created-at chronology.
 * - Browser scroll anchoring is disabled only during a controlled ancestry jump.
 * - The ancestry popup expands to the viewport, then scales to 66%, then scrolls.
 * - Repeated ancestors remain fully visible; arrows to the same target merge into a shared yellow trunk with hollow junction circles.
 * - The player time follows the progress thumb and can be edited to seek precisely.
 * - Every song-title hover opens the full black title bar, even when the visible title fits.
 * - Profile, View All and carousel song tiles show their creation date and duration from cached or fetched clip metadata.
 * - Safe tracker and telemetry domains verified in console testing are blocked automatically.
 *
 * Runtime controllers use stable, non-versioned window keys so future updates do
 * not need growing compatibility lists. Heavy diagnostics live in separate helpers.
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

  function clearControllers(stableKey, legacyPattern, cleanup=()=>{}) {
    const keys=Object.getOwnPropertyNames(window).filter(key=>
      key===stableKey||legacyPattern.test(key)
    );
    for(const key of new Set(keys)) {
      const controller=window[key];
      try { cleanup(controller,key); } catch(error) {}
      try { delete window[key]; } catch(error) {}
    }
  }

  const TRACKER_BLOCKER_KEY = "__sunoTrackerBlockerController";

  // ---------------------------------------------------------------------------
  // Safe tracker blocking
  // ---------------------------------------------------------------------------
  // These domains were validated in console testing as non-essential telemetry,
  // analytics, advertising or attribution endpoints. Blocking begins after the
  // tweak script is installed. A small runtime API remains available for manual
  // inspection: window.__sunoTrackerBlockerController.summary(), report(), stop().
  function installTrackerBlocker() {
    try { window[TRACKER_BLOCKER_KEY]?.stop?.(); } catch(error) {}

    const BLOCKED_DOMAINS = [
      "browser-intake-datadoghq.com",
      "static.cloudflareinsights.com",
      "cloudflareinsights.com",
      "analytics.tiktok.com",
      "bat.bing.com",
      "bat.bing.net",
      "h.clarity.ms",
      "scripts.clarity.ms",
      "www.clarity.ms",
      "analytics.twitter.com",
      "static.ads-twitter.com",
      "google-analytics.com",
      "analytics.google.com",
      "googletagmanager.com",
      "doubleclick.net",
      "connect.facebook.net",
      "www.facebook.com",
      "sdk-api-v1.singular.net",
      "web-sdk-cdn.singular.net",
      "d2hrivdxn8ekm8.cloudfront.net",
      "segment.prod.bidr.io",
      "tte-prod.telemetry.vaultdcr.com",
      "bzrcdn.openai.com",
      "bzr.openai.com"
    ];

    const state = {
      installedAt: new Date().toISOString(),
      enabled: true,
      restored: false,
      maxEvents: 600,
      removedExisting: 0,
      counts: new Map(),
      events: []
    };

    const originals = {
      fetch: window.fetch,
      xhrOpen: XMLHttpRequest.prototype.open,
      xhrSend: XMLHttpRequest.prototype.send,
      sendBeacon: typeof navigator.sendBeacon === "function" ? navigator.sendBeacon : null,
      appendChild: Node.prototype.appendChild,
      insertBefore: Node.prototype.insertBefore,
      replaceChild: Node.prototype.replaceChild,
      setAttribute: Element.prototype.setAttribute,
      propertyDescriptors: []
    };

    const XHR_BLOCKED = Symbol("sunoTrackerBlockedXhr");
    const XHR_URL = Symbol("sunoTrackerBlockedXhrUrl");
    let observer = null;
    let beaconPatched = false;

    function normaliseHostname(hostname) {
      return String(hostname||"").trim().replace(/^\.+|\.+$/g, "").toLowerCase();
    }
    function domainMatches(hostname, rule) {
      hostname = normaliseHostname(hostname);
      rule = normaliseHostname(rule);
      return hostname === rule || hostname.endsWith("." + rule);
    }
    function parseUrl(value) {
      try {
        if(value instanceof Request) return new URL(value.url, location.href);
        if(value instanceof URL) return value;
        return new URL(String(value||""), location.href);
      } catch(error) {
        return null;
      }
    }
    function matchUrl(value) {
      if(!state.enabled) return null;
      const url = parseUrl(value);
      if(!url || !/^https?:$/.test(url.protocol)) return null;
      const rule = BLOCKED_DOMAINS.find(domain=>domainMatches(url.hostname, domain));
      return rule ? { url, rule } : null;
    }
    function redactUrl(value) {
      const url = parseUrl(value);
      if(!url) return String(value||"");
      for(const key of [...url.searchParams.keys()]) {
        url.searchParams.set(key, "<redacted>");
      }
      url.hash = "";
      return url.toString();
    }
    function record(kind, value, extra={}) {
      const match = matchUrl(value);
      const url = match?.url || parseUrl(value);
      const domain = normaliseHostname(url?.hostname || "unknown");
      const countKey = `${kind}:${domain}`;
      state.counts.set(countKey, (state.counts.get(countKey)||0) + 1);
      state.events.push({
        at: new Date().toISOString(),
        kind,
        domain,
        url: redactUrl(value),
        ...extra
      });
      if(state.events.length > state.maxEvents) {
        state.events.splice(0, state.events.length - state.maxEvents);
      }
    }
    function blockedFetchResponse() {
      return new Response(null, {
        status: 204,
        statusText: "Blocked by Suno Tweaks tracker blocker",
        headers: { "X-Suno-Tracker-Block": "1" }
      });
    }
    function resourceUrl(element) {
      if(!(element instanceof Element)) return "";
      const tag = element.tagName;
      if(tag === "SCRIPT" || tag === "IMG" || tag === "IFRAME" || tag === "SOURCE" || tag === "AUDIO" || tag === "VIDEO") {
        return element.getAttribute("src") || element.src || "";
      }
      if(tag === "LINK") return element.getAttribute("href") || element.href || "";
      return "";
    }
    function blockResourceElement(element, source) {
      const value = resourceUrl(element);
      const match = matchUrl(value);
      if(!match) return false;
      record("dom-resource", match.url, {
        tag: element.tagName.toLowerCase(),
        source
      });
      try {
        if("src" in element) element.removeAttribute("src");
        if("href" in element && element.tagName === "LINK") element.removeAttribute("href");
        if(element.isConnected) element.remove();
      } catch(error) {}
      return true;
    }
    function sanitiseTree(node, source) {
      if(!(node instanceof Node)) return true;
      if(node instanceof Element && blockResourceElement(node, source)) return false;
      if(node.querySelectorAll) {
        for(const element of node.querySelectorAll("script[src],img[src],iframe[src],link[href],source[src],audio[src],video[src]")) {
          blockResourceElement(element, source);
        }
      }
      return true;
    }
    function patchUrlProperty(prototype, property) {
      if(!prototype) return;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
      if(!descriptor?.configurable || typeof descriptor.set !== "function") return;
      originals.propertyDescriptors.push({ prototype, property, descriptor });
      Object.defineProperty(prototype, property, {
        ...descriptor,
        set(value) {
          if(matchUrl(value)) {
            record("property", value, {
              tag: this.tagName?.toLowerCase() || "",
              property
            });
            return;
          }
          return descriptor.set.call(this, value);
        }
      });
    }
    function countsObject() {
      return Object.fromEntries([...state.counts.entries()].sort((a,b)=>b[1]-a[1]));
    }
    function report() {
      return {
        installedAt: state.installedAt,
        enabled: state.enabled,
        blockedDomains: [...BLOCKED_DOMAINS],
        removedExisting: state.removedExisting,
        counts: countsObject(),
        events: [...state.events]
      };
    }
    function summary() {
      const result = {
        enabled: state.enabled,
        removedExisting: state.removedExisting,
        blockedEvents: state.events.length,
        counts: countsObject()
      };
      try {
        console.table(Object.entries(result.counts).map(([typeAndDomain, count])=>({ typeAndDomain, count })));
      } catch(error) {}
      console.log("[Suno Tweaks tracker blocker]", result);
      return result;
    }
    function stop() {
      if(state.restored) return;
      state.restored = true;
      state.enabled = false;
      observer?.disconnect();
      observer = null;
      window.fetch = originals.fetch;
      XMLHttpRequest.prototype.open = originals.xhrOpen;
      XMLHttpRequest.prototype.send = originals.xhrSend;
      if(beaconPatched && originals.sendBeacon) {
        try { navigator.sendBeacon = originals.sendBeacon; } catch(error) {}
      }
      Node.prototype.appendChild = originals.appendChild;
      Node.prototype.insertBefore = originals.insertBefore;
      Node.prototype.replaceChild = originals.replaceChild;
      Element.prototype.setAttribute = originals.setAttribute;
      for(const item of originals.propertyDescriptors) {
        try { Object.defineProperty(item.prototype, item.property, item.descriptor); } catch(error) {}
      }
    }

    window.fetch = function sunoTrackerBlockedFetch(input, init) {
      const match = matchUrl(input);
      if(!match) return originals.fetch.call(this, input, init);
      record("fetch", match.url, {
        method: String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase()
      });
      return Promise.resolve(blockedFetchResponse());
    };
    XMLHttpRequest.prototype.open = function sunoTrackerBlockedXhrOpen(method, url, ...rest) {
      const match = matchUrl(url);
      this[XHR_BLOCKED] = Boolean(match);
      this[XHR_URL] = match?.url?.toString() || String(url||"");
      return originals.xhrOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function sunoTrackerBlockedXhrSend(body) {
      if(!this[XHR_BLOCKED]) return originals.xhrSend.call(this, body);
      record("xhr", this[XHR_URL]);
      queueMicrotask(()=> {
        try { this.abort(); } catch(error) {}
      });
      return undefined;
    };
    if(originals.sendBeacon) {
      try {
        navigator.sendBeacon = function sunoTrackerBlockedBeacon(url, data) {
          const match = matchUrl(url);
          if(!match) return originals.sendBeacon.call(navigator, url, data);
          record("beacon", match.url, {
            bytes: typeof data === "string" ? data.length : Number(data?.size || 0)
          });
          return true;
        };
        beaconPatched = true;
      } catch(error) {}
    }
    Node.prototype.appendChild = function sunoTrackerBlockedAppendChild(node) {
      if(!sanitiseTree(node, "appendChild")) return node;
      return originals.appendChild.call(this, node);
    };
    Node.prototype.insertBefore = function sunoTrackerBlockedInsertBefore(node, reference) {
      if(!sanitiseTree(node, "insertBefore")) return node;
      return originals.insertBefore.call(this, node, reference);
    };
    Node.prototype.replaceChild = function sunoTrackerBlockedReplaceChild(node, oldNode) {
      if(!sanitiseTree(node, "replaceChild")) return oldNode;
      return originals.replaceChild.call(this, node, oldNode);
    };
    Element.prototype.setAttribute = function sunoTrackerBlockedSetAttribute(name, value) {
      const lowerName = String(name||"").toLowerCase();
      if((lowerName === "src" || lowerName === "href") && matchUrl(value)) {
        record("attribute", value, {
          tag: this.tagName?.toLowerCase() || "",
          attribute: lowerName
        });
        return undefined;
      }
      return originals.setAttribute.call(this, name, value);
    };

    patchUrlProperty(window.HTMLScriptElement?.prototype, "src");
    patchUrlProperty(window.HTMLImageElement?.prototype, "src");
    patchUrlProperty(window.HTMLIFrameElement?.prototype, "src");
    patchUrlProperty(window.HTMLLinkElement?.prototype, "href");
    patchUrlProperty(window.HTMLSourceElement?.prototype, "src");
    patchUrlProperty(window.HTMLMediaElement?.prototype, "src");

    observer = new MutationObserver(records=> {
      for(const mutation of records) {
        for(const node of mutation.addedNodes) sanitiseTree(node, "mutation-observer");
      }
    });
    observer.observe(document.documentElement, {
      childList:true,
      subtree:true
    });

    for(const element of document.querySelectorAll("script[src],img[src],iframe[src],link[href],source[src],audio[src],video[src]")) {
      if(blockResourceElement(element, "existing-dom")) state.removedExisting++;
    }

    const api = {
      blockedDomains: Object.freeze([...BLOCKED_DOMAINS]),
      summary,
      report,
      pause() { state.enabled = false; },
      resume() { state.enabled = true; },
      stop
    };
    window[TRACKER_BLOCKER_KEY] = api;
    return api;
  }

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
#suno-song-title-exact-overlay{position:fixed!important;display:block!important;width:max-content!important;height:auto!important;max-height:none!important;box-sizing:border-box!important;margin:0!important;padding:0!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere!important;background:#000!important;border-radius:2px!important;text-decoration:none!important;cursor:pointer!important;z-index:2147483647!important}
#suno-time-popup{position:fixed!important;z-index:2147483647!important;padding:3px 7px!important;border:1px solid rgba(255,255,255,.35)!important;border-radius:4px!important;background:#151515!important;color:#fff!important;font:400 11px/14px ui-monospace,SFMono-Regular,Consolas,monospace!important;white-space:nowrap!important;cursor:pointer!important;opacity:0!important;transition:opacity .12s ease-out!important}
#suno-time-popup[data-show="1"]{opacity:1!important}
[data-sc=txt] [class*=clip-title-wrapper],[data-sc=txt] .flex.items-center.gap-2{width:${W}px!important;max-width:${W}px!important;min-width:0!important;overflow:hidden!important}
.suno-card-action-line,.suno-card-creator-line{display:flex!important;align-items:center!important;justify-content:flex-start!important;min-width:0!important;width:var(--suno-card-metadata-width,100%)!important;max-width:var(--suno-card-metadata-width,100%)!important;box-sizing:border-box!important;padding-right:0!important;margin-right:0!important}
.suno-card-date,.suno-card-duration{display:inline-flex!important;align-items:center!important;justify-content:flex-end!important;flex:0 0 auto!important;white-space:nowrap!important;margin-left:auto!important;margin-right:0!important;padding-left:6px!important;padding-right:0!important;text-align:right!important;font-family:inherit!important;font-size:inherit!important;font-style:inherit!important;font-weight:inherit!important;line-height:inherit!important;letter-spacing:inherit!important;color:inherit!important;font-variant-numeric:inherit!important}
.suno-card-generated-creator{display:flex!important;align-items:center!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;color:inherit!important}
.suno-card-generated-creator>a{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:inherit!important;text-decoration:none!important}
[data-sc=menu]{position:absolute!important;top:8px!important;right:8px!important;z-index:20!important;opacity:0!important;transition:opacity .12s ease!important}
[data-sc=row]:hover [data-sc=menu]{opacity:1!important}
[data-sc=row] [class*=css-8rxof8],[data-sc=row] [class*=e1rxirk01]{font-size:12px!important;opacity:.65!important;max-width:${W}px!important;overflow:hidden!important}
[data-pb=main]{display:grid!important;grid-template-columns:minmax(220px,1fr) minmax(480px,5fr) minmax(280px,1fr)!important;align-items:center!important;gap:12px!important;overflow:visible!important}
[data-pb=l],[data-pb=c],[data-pb=r]{min-width:0!important;max-width:none!important;width:auto!important;flex:none!important;flex-basis:auto!important}
[data-pb=c]{position:relative!important;justify-self:stretch!important;width:100%!important;max-width:none!important}
[data-pb=ci]{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}
[data-pb=pr]{width:100%!important;max-width:none!important;min-width:0!important;--min-target-size:${PBS}rem!important;--button-width:${.75*PBS}rem!important;--button-height:${.75*PBS}rem!important;--button-border-width:${.125*PBS}rem!important;--track-width:${.25*PBS}rem!important}
[data-pb=pr] input[aria-label="Playback progress"]{height:${PBS}rem!important}
[data-pb=tr]{flex:1 1 auto!important;min-width:0!important;max-width:none!important;width:auto!important;min-height:${PBS}rem!important}
[data-pb=tr]{position:relative!important;overflow:visible!important}
.suno-editable-seek-time{position:absolute!important;z-index:2147483000!important;display:block!important;width:auto!important;min-width:48px!important;max-width:86px!important;height:20px!important;box-sizing:border-box!important;padding:1px 5px!important;border:1px solid transparent!important;border-radius:5px!important;outline:none!important;background:rgba(15,15,17,.88)!important;color:rgba(255,255,255,.88)!important;box-shadow:0 2px 7px rgba(0,0,0,.32)!important;font-family:ui-monospace,SFMono-Regular,Consolas,monospace!important;font-size:11px!important;font-weight:600!important;line-height:16px!important;text-align:center!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important;transform:translate(-50%,-100%)!important;cursor:text!important;pointer-events:auto!important;user-select:text!important}
.suno-editable-seek-time:hover{background:rgba(30,30,33,.96)!important;color:#fff!important}
.suno-editable-seek-time[data-editing="true"]{min-width:62px!important;border-color:rgba(255,218,76,.88)!important;background:rgba(20,20,22,.99)!important;color:#fff!important;box-shadow:0 0 0 2px rgba(255,218,76,.15),0 3px 9px rgba(0,0,0,.42)!important}
.suno-editable-seek-time[data-invalid="true"]{border-color:rgba(255,105,105,.95)!important;box-shadow:0 0 0 2px rgba(255,105,105,.14),0 3px 9px rgba(0,0,0,.42)!important}
.suno-seek-hover-time{position:absolute!important;z-index:2147482999!important;display:block!important;width:max-content!important;height:auto!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;color:#fff!important;opacity:0!important;font-family:ui-monospace,SFMono-Regular,Consolas,monospace!important;font-size:11px!important;font-style:normal!important;font-weight:400!important;line-height:14px!important;letter-spacing:0!important;text-align:center!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important;text-shadow:0 1px 3px rgba(0,0,0,.92)!important;transform:translate(-50%,-100%)!important;pointer-events:none!important;user-select:none!important;transition:opacity .05s linear!important}
.suno-seek-hover-time[data-visible="true"]{opacity:1!important}
[data-suno-pinned-column="1"]{display:block!important;flex:0 0 var(--suno-pinned-collapsed-height,128px)!important;height:var(--suno-pinned-collapsed-height,128px)!important;min-height:var(--suno-pinned-collapsed-height,128px)!important;max-height:var(--suno-pinned-collapsed-height,128px)!important;margin-bottom:12px!important;overflow-x:hidden!important;overflow-y:hidden!important;overscroll-behavior:contain!important;scrollbar-width:thin!important;box-shadow:0 2px 0 #ffda4c!important}
[data-suno-pinned-column="1"]:hover,[data-suno-pinned-column="1"]:focus-within,[data-suno-pinned-column="1"][data-suno-pinned-title-hover="1"],[data-suno-pinned-column="1"][data-suno-time-open="1"]{flex-basis:min(var(--suno-pinned-full-height,128px),50vh)!important;height:min(var(--suno-pinned-full-height,128px),50vh)!important;min-height:min(var(--suno-pinned-full-height,128px),50vh)!important;max-height:50vh!important;overflow-x:hidden!important;overflow-y:auto!important}
[data-suno-pinned-column="1"]::-webkit-scrollbar{width:8px!important;height:0!important}
[data-suno-pinned-column="1"]::-webkit-scrollbar-thumb{background:rgba(255,255,255,.28)!important;border-radius:999px!important}
[data-suno-pinned-column="1"]::-webkit-scrollbar-track{background:transparent!important}
[data-suno-pinned-column="1"]>*{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important}
[data-suno-pinned-column="1"] .clip-row.clip-pin{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
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
[data-testid="clip-row"].suno-current-selected-song{background:rgba(88,190,112,.085)!important;border-radius:8px!important;transition:background-color .14s ease!important}
#suno-create-ancestry-overlay{--suno-ancestry-scale:1;position:fixed!important;z-index:2147483646!important;box-sizing:border-box!important;overflow-x:hidden!important;overflow-y:hidden!important;overscroll-behavior:contain!important;max-height:none!important;padding:calc(6px * var(--suno-ancestry-scale))!important;border:1px solid rgba(255,255,255,.13)!important;border-radius:10px!important;background:linear-gradient(rgba(255,225,92,.075),rgba(255,225,92,.075)),rgba(13,13,15,.97)!important;color:#f5f5f6!important;box-shadow:0 12px 34px rgba(0,0,0,.48)!important;backdrop-filter:blur(10px)!important;-webkit-backdrop-filter:blur(10px)!important;scrollbar-gutter:auto!important}
#suno-create-ancestry-overlay .suno-ancestry-header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:calc(3px * var(--suno-ancestry-scale)) 7px calc(6px * var(--suno-ancestry-scale))!important;font-family:system-ui,sans-serif!important;font-size:calc(11px * var(--suno-ancestry-scale))!important;font-weight:600!important;line-height:1.2!important;color:rgba(255,255,255,.72)!important;text-transform:uppercase!important;letter-spacing:.045em!important}
#suno-create-ancestry-overlay .suno-ancestry-list{--suno-ancestry-arrow-gutter:calc(18px * var(--suno-ancestry-scale));position:relative!important;display:flex!important;flex-direction:column!important;gap:calc(2px * var(--suno-ancestry-scale))!important}
#suno-create-ancestry-overlay .suno-ancestry-entry{--suno-ancestry-depth:1;position:relative!important;z-index:1!important;display:grid!important;grid-template-columns:calc(34px * var(--suno-ancestry-scale)) minmax(0,1fr) auto!important;align-items:center!important;column-gap:calc(7px * var(--suno-ancestry-scale))!important;width:calc(100% - var(--suno-ancestry-arrow-gutter))!important;min-height:calc(42px * var(--suno-ancestry-scale))!important;box-sizing:border-box!important;margin:0 var(--suno-ancestry-arrow-gutter) 0 0!important;padding:calc(3px * var(--suno-ancestry-scale)) 7px calc(3px * var(--suno-ancestry-scale)) calc(7px + (var(--suno-ancestry-depth) - 1)*14px)!important;border:0!important;border-radius:7px!important;background:transparent!important;color:inherit!important;text-align:left!important;font-family:system-ui,sans-serif!important;cursor:default!important}
#suno-create-ancestry-overlay .suno-ancestry-links{position:absolute!important;inset:0!important;z-index:2!important;display:block!important;width:100%!important;height:100%!important;overflow:visible!important;pointer-events:none!important}
#suno-create-ancestry-overlay .suno-ancestry-link{fill:none!important;stroke:rgba(255,218,76,.84)!important;stroke-width:1.25!important;stroke-linecap:round!important;stroke-linejoin:round!important;vector-effect:non-scaling-stroke!important}
#suno-create-ancestry-overlay .suno-ancestry-junction{fill:rgba(13,13,15,.98)!important;stroke:rgba(255,218,76,.92)!important;stroke-width:1.35!important;vector-effect:non-scaling-stroke!important}
#suno-create-ancestry-overlay .suno-ancestry-entry[data-available="true"]{cursor:pointer!important}
#suno-create-ancestry-overlay .suno-ancestry-entry[data-available="true"]:hover,#suno-create-ancestry-overlay .suno-ancestry-entry[data-available="true"]:focus-visible{background:rgba(255,255,255,.10)!important;outline:none!important}
#suno-create-ancestry-overlay .suno-ancestry-entry[data-available="false"]{opacity:.56!important}
#suno-create-ancestry-overlay .suno-ancestry-entry[data-workspace-state="unknown"]{opacity:.82!important}
#suno-create-ancestry-overlay .suno-ancestry-art{display:block!important;width:calc(34px * var(--suno-ancestry-scale))!important;height:calc(34px * var(--suno-ancestry-scale))!important;border-radius:calc(5px * var(--suno-ancestry-scale))!important;object-fit:cover!important;background:rgba(255,255,255,.08)!important}
#suno-create-ancestry-overlay .suno-ancestry-art-placeholder{display:flex!important;align-items:center!important;justify-content:center!important;width:calc(34px * var(--suno-ancestry-scale))!important;height:calc(34px * var(--suno-ancestry-scale))!important;border-radius:calc(5px * var(--suno-ancestry-scale))!important;background:rgba(255,255,255,.08)!important;color:rgba(255,255,255,.38)!important;font-size:calc(15px * var(--suno-ancestry-scale))!important}
#suno-create-ancestry-overlay .suno-ancestry-copy{display:flex!important;min-width:0!important;flex-direction:column!important;gap:calc(1px * var(--suno-ancestry-scale))!important}
#suno-create-ancestry-overlay .suno-ancestry-title{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:calc(12.5px * var(--suno-ancestry-scale))!important;font-weight:600!important;line-height:1.18!important;color:rgba(255,255,255,.94)!important}
#suno-create-ancestry-overlay .suno-ancestry-id{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:calc(9.5px * var(--suno-ancestry-scale))!important;line-height:1.1!important;color:rgba(255,255,255,.42)!important}
#suno-create-ancestry-overlay .suno-ancestry-kind-block{align-self:center!important;display:flex!important;max-width:104px!important;min-width:0!important;flex-direction:column!important;align-items:flex-end!important;gap:calc(2px * var(--suno-ancestry-scale))!important}
#suno-create-ancestry-overlay .suno-ancestry-kind{display:block!important;max-width:104px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;padding:calc(2px * var(--suno-ancestry-scale)) 5px!important;border-radius:999px!important;background:rgba(255,255,255,.07)!important;font-size:calc(9px * var(--suno-ancestry-scale))!important;line-height:1.1!important;color:rgba(255,255,255,.60)!important;text-transform:uppercase!important;letter-spacing:.035em!important}
#suno-create-ancestry-overlay .suno-ancestry-time{display:block!important;padding-right:4px!important;white-space:nowrap!important;font-family:system-ui,sans-serif!important;font-size:calc(8.5px * var(--suno-ancestry-scale))!important;font-weight:500!important;line-height:1.05!important;color:rgba(255,255,255,.43)!important;font-variant-numeric:tabular-nums!important;text-transform:none!important;letter-spacing:0!important}
#suno-create-ancestry-overlay .suno-ancestry-cycle{color:#f0b36b!important}
#suno-create-ancestry-overlay .suno-ancestry-status{padding:calc(7px * var(--suno-ancestry-scale)) 9px!important;font-family:system-ui,sans-serif!important;font-size:calc(11px * var(--suno-ancestry-scale))!important;font-weight:500!important;line-height:1.35!important;color:rgba(255,255,255,.62)!important}
#suno-create-ancestry-overlay .suno-ancestry-more{padding:calc(5px * var(--suno-ancestry-scale)) 8px!important;font-family:system-ui,sans-serif!important;font-size:calc(10px * var(--suno-ancestry-scale))!important;font-weight:500!important;line-height:1.2!important;color:rgba(255,255,255,.54)!important}
@keyframes suno-ancestry-jump-pulse{0%,100%{outline-color:transparent;filter:none}25%,70%{outline-color:rgba(255,255,255,.92);filter:brightness(1.22)}}
[data-testid="clip-row"].suno-ancestry-jump-highlight{outline:2px solid transparent!important;outline-offset:2px!important;animation:suno-ancestry-jump-pulse 1.35s ease!important}
#suno-exact-credit-sidebar-entry{list-style:none!important;pointer-events:none!important;user-select:none!important;cursor:default!important}
#suno-exact-credit-sidebar-entry [data-suno-credit-line="1"]{display:flex!important;align-items:center!important;justify-content:flex-start!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;cursor:default!important}
#suno-exact-credit-sidebar-entry [data-suno-credit-value="1"]{display:block!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important;font-weight:600!important}
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
  // ---------------------------------------------------------------------------
  // Editable player time above the progress thumb
  // ---------------------------------------------------------------------------
  const EDITABLE_SEEK_KEY='__sunoEditableSeekTime';
  const editableSeekState={controls:new Set(),timer:0};

  function seekParseTime(raw) {
    const value=String(raw||'').trim().replace(',', '.');
    if(!value)return NaN;
    if(/^\d+(?:\.\d+)?$/.test(value))return Number(value);
    const parts=value.split(':');
    if(parts.length<2||parts.length>3||parts.some(part=>!/^\d+(?:\.\d+)?$/.test(part)))return NaN;
    let seconds=0;
    for(const part of parts)seconds=seconds*60+Number(part);
    return seconds;
  }

  function seekFormatTime(raw) {
    const seconds=Math.max(0,Number.isFinite(Number(raw))?Math.floor(Number(raw)):0);
    const hours=Math.floor(seconds/3600);
    const minutes=Math.floor((seconds%3600)/60);
    const rest=seconds%60;
    return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}`:
      `${minutes}:${String(rest).padStart(2,'0')}`;
  }

  function seekTimeStrings(root) {
    const values=[];
    for(const node of root?.querySelectorAll?.('span,p,div')||[]) {
      if(node.children.length)continue;
      const text=String(node.textContent||'').trim();
      if(!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(text))continue;
      const seconds=seekParseTime(text);
      if(Number.isFinite(seconds))values.push({node,text,seconds});
    }
    return values;
  }

  function seekMediaElement() {
    const audio=[...document.querySelectorAll('audio')];
    const video=[...document.querySelectorAll('video')].filter(media=>!media.closest('.clip-image-container'));
    const media=[...audio,...video].filter(item=>Number.isFinite(item.duration)&&item.duration>0);
    return media.find(item=>!item.paused&&!item.ended)||
      media.find(item=>item.currentTime>0&&item.currentSrc)||
      media.find(item=>item.currentSrc)||media[0]||null;
  }

  function seekSliderNumbers(slider) {
    let minimum=Number(slider.min);
    let maximum=Number(slider.max);
    let value=Number(slider.value);
    if(!Number.isFinite(minimum))minimum=0;
    if(!Number.isFinite(maximum)||maximum<=minimum)maximum=100;
    if(!Number.isFinite(value))value=minimum;
    const ratio=Math.max(0,Math.min(1,(value-minimum)/(maximum-minimum)));
    return {minimum,maximum,value,ratio};
  }

  function seekSnapshot(control) {
    const {root,slider,progressRow}=control;
    const media=seekMediaElement();
    const numbers=seekSliderNumbers(slider);
    const labels=seekTimeStrings(progressRow||root);
    let duration=media?.duration;
    if(!Number.isFinite(duration)||duration<=0)duration=labels.length?Math.max(...labels.map(item=>item.seconds)):0;
    if((!duration||duration<=0)&&numbers.maximum>1.5&&numbers.maximum<86400)duration=numbers.maximum;

    let current=media?.currentTime;
    if(!Number.isFinite(current)||current<0) {
      if(labels.length>=2)current=labels[0].seconds;
      else current=duration>0?numbers.ratio*duration:(numbers.maximum>1.5?numbers.value:0);
    }
    if(duration>0)current=Math.max(0,Math.min(duration,current));
    else current=Math.max(0,current||0);
    return {media,duration,current,ratio:duration>0?current/duration:numbers.ratio,numbers};
  }

  function seekSetNativeRangeValue(slider,value) {
    const oldValue=String(slider.value);
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    try {
      if(slider._valueTracker)slider._valueTracker.setValue(oldValue);
      if(setter)setter.call(slider,String(value));
      else slider.value=String(value);
    } catch(error) {
      slider.value=String(value);
    }
    slider.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:String(value)}));
    slider.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function seekWideClickInteractive(target,control,event) {
    if(!(target instanceof Element))return true;

    const interactiveSelector=
      'button,a,input,select,textarea,label,'+
      '[role="button"],[role="slider"],[role="link"],[role="menuitem"],'+
      '[contenteditable="true"],.suno-editable-seek-time';

    if(target.closest(interactiveSelector))return true;
    if(target.closest('svg,img,picture,canvas,video'))return true;

    // In capture phase, inspect the complete event path as well. This catches
    // controls whose inner wrapper itself has no role or tag suggesting UI.
    for(const node of event?.composedPath?.()||[]) {
      if(!(node instanceof Element))continue;
      if(node.matches?.(interactiveSelector))return true;
      if(node.matches?.('svg,img,picture,canvas,video'))return true;
    }

    // Suno renders current and total time as ordinary text nodes.
    for(const item of seekTimeStrings(control.progressRow||control.root)) {
      if(item.node===target||item.node.contains(target))return true;
    }
    return false;
  }

  function seekPointerTime(control,event) {
    const {track,center}=control||{};
    if(!track?.isConnected||!center?.isConnected)return null;

    const trackRect=track.getBoundingClientRect();
    const centerRect=center.getBoundingClientRect();
    if(trackRect.width<=0||centerRect.height<=0)return null;
    if(event.clientX<trackRect.left||event.clientX>trackRect.right)return null;
    if(event.clientY<centerRect.top||event.clientY>centerRect.bottom)return null;

    const ratio=Math.max(
      0,
      Math.min(1,(event.clientX-trackRect.left)/trackRect.width)
    );
    const snapshot=seekSnapshot(control);
    const span=snapshot.numbers.maximum-snapshot.numbers.minimum;
    const seconds=snapshot.duration>0
      ?ratio*snapshot.duration
      :span>0
        ?snapshot.numbers.minimum+ratio*span
        :NaN;

    if(!Number.isFinite(seconds))return null;
    return {trackRect,centerRect,ratio,seconds};
  }

  function seekHoverPreview(control) {
    const center=control?.center;
    if(!center)return null;

    let preview=center.querySelector(':scope > .suno-seek-hover-time');
    if(!preview) {
      preview=document.createElement('span');
      preview.className='suno-seek-hover-time';
      preview.setAttribute('aria-hidden','true');
      center.appendChild(preview);
    }
    control.hoverPreview=preview;
    return preview;
  }

  function seekHideHoverPreview(control) {
    const preview=control?.hoverPreview;
    if(preview)preview.dataset.visible='false';
  }

  function seekHoverAllowed(control,event) {
    const target=event.target instanceof Element?event.target:null;
    if(!target)return false;

    // The native timeline itself is a valid hover-preview target even though its
    // thumb is an input element. Outside the timeline, retain the strict
    // "empty space only" rule used by the extended click area.
    if(control.track?.contains(target))return true;
    if(seekWideClickInteractive(target,control,event))return false;

    const topmost=document.elementFromPoint(event.clientX,event.clientY);
    if(topmost&&control.track?.contains(topmost))return true;
    return !topmost||!seekWideClickInteractive(topmost,control,event);
  }

  function seekMoveHoverPreview(control,event) {
    if(!control||!seekHoverAllowed(control,event)) {
      seekHideHoverPreview(control);
      return;
    }

    const point=seekPointerTime(control,event);
    if(!point) {
      seekHideHoverPreview(control);
      return;
    }

    const preview=seekHoverPreview(control);
    if(!preview)return;

    preview.textContent=seekFormatTime(point.seconds);
    preview.dataset.visible='true';

    const centerWidth=point.centerRect.width;
    const centerHeight=point.centerRect.height;
    const half=Math.max(15,preview.getBoundingClientRect().width/2||15);
    const rawX=event.clientX-point.centerRect.left;
    const x=Math.max(
      half,
      Math.min(Math.max(half,centerWidth-half),rawX)
    );

    // Follow the cursor with a small upward offset, while keeping the complete
    // text inside the central playbar area.
    const minimumTop=16;
    const maximumTop=Math.max(minimumTop,centerHeight-2);
    const rawTop=event.clientY-point.centerRect.top-6;
    const top=Math.max(minimumTop,Math.min(maximumTop,rawTop));

    preview.style.setProperty('left',`${x}px`,'important');
    preview.style.setProperty('top',`${top}px`,'important');
  }

  function seekWideClick(control,event) {
    if(!control||event.defaultPrevented||event.button!==0)return;
    if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;

    const {slider,track,center}=control;
    if(!slider?.isConnected||!track?.isConnected||!center?.isConnected)return;

    const target=event.target instanceof Element?event.target:null;
    if(seekWideClickInteractive(target,control,event))return;

    const topmost=document.elementFromPoint(event.clientX,event.clientY);
    if(topmost&&seekWideClickInteractive(topmost,control,event))return;

    const point=seekPointerTime(control,event);
    if(!point)return;

    // Clicks inside the real track rectangle remain entirely native. The custom
    // handler only adds the otherwise empty area above and below it.
    if(event.clientY>=point.trackRect.top&&event.clientY<=point.trackRect.bottom)return;

    if(!seekToSeconds(control,point.seconds))return;

    event.preventDefault();
    event.stopPropagation();
    seekUpdateControl(control,true);
  }

  function seekInstallWideClick(control) {
    const area=control.center;
    if(!area)return;

    // Capture on the complete central playbar column. This includes empty gaps in
    // the control row above the timeline, while real buttons remain excluded by
    // seekWideClickInteractive().
    const previous=area.__sunoWideSeekHandler;
    if(previous)area.removeEventListener('click',previous,true);
    const previousMove=area.__sunoHoverSeekMoveHandler;
    if(previousMove)area.removeEventListener('pointermove',previousMove,true);
    const previousLeave=area.__sunoHoverSeekLeaveHandler;
    if(previousLeave)area.removeEventListener('pointerleave',previousLeave,true);

    const handler=event=>seekWideClick(area.__sunoWideSeekControl,event);
    const moveHandler=event=>
      seekMoveHoverPreview(area.__sunoWideSeekControl,event);
    const leaveHandler=()=>
      seekHideHoverPreview(area.__sunoWideSeekControl);

    area.__sunoWideSeekControl=control;
    area.__sunoWideSeekHandler=handler;
    area.__sunoHoverSeekMoveHandler=moveHandler;
    area.__sunoHoverSeekLeaveHandler=leaveHandler;

    area.addEventListener('click',handler,true);
    area.addEventListener('pointermove',moveHandler,true);
    area.addEventListener('pointerleave',leaveHandler,true);

    control.wideClickArea=area;
    control.wideClickHandler=handler;
    control.hoverMoveHandler=moveHandler;
    control.hoverLeaveHandler=leaveHandler;
    seekHoverPreview(control);
  }

  function seekPause(control) {
    const button=control.root.querySelector('button[aria-label="Pause"],button[aria-label^="Pause "],button[aria-label="Playing"],button[aria-label^="Playing "]');
    if(button)press(button);
    else {
      const media=seekMediaElement();
      try { media?.pause(); } catch(error) {}
    }
  }

  function seekPlay(control) {
    const attempt=()=> {
      const button=control.root.querySelector('button[aria-label="Play"],button[aria-label^="Play "]');
      if(button)press(button);
      else {
        const media=seekMediaElement();
        try { media?.play?.().catch?.(()=>{}); } catch(error) {}
      }
    };
    window.setTimeout(attempt,70);
  }

  function seekToSeconds(control,requested) {
    const snapshot=seekSnapshot(control);
    let seconds=Number(requested);
    if(!Number.isFinite(seconds)||seconds<0)return false;
    if(snapshot.duration>0)seconds=Math.min(snapshot.duration,seconds);
    const ratio=snapshot.duration>0?seconds/snapshot.duration:Math.max(0,Math.min(1,seconds/(snapshot.numbers.maximum||1)));
    const rangeValue=snapshot.numbers.minimum+ratio*(snapshot.numbers.maximum-snapshot.numbers.minimum);
    seekSetNativeRangeValue(control.slider,rangeValue);
    if(snapshot.media) {
      try { snapshot.media.currentTime=seconds; } catch(error) {}
    }
    control.lastCommitted=seconds;
    return true;
  }

  function seekPositionControl(control,snapshot=seekSnapshot(control)) {
    const {editor,slider,track}=control;
    if(!editor.isConnected||!slider.isConnected||!track.isConnected)return false;
    const trackRect=track.getBoundingClientRect();
    const sliderRect=slider.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,snapshot.ratio||0));
    const rawX=sliderRect.left-trackRect.left+sliderRect.width*ratio;
    const half=Math.max(24,editor.getBoundingClientRect().width/2||24);
    const x=Math.max(half,Math.min(Math.max(half,trackRect.width-half),rawX));
    const y=sliderRect.top-trackRect.top-3;
    editor.style.setProperty('left',`${x}px`,'important');
    editor.style.setProperty('top',`${y}px`,'important');
    return true;
  }

  function seekBeginEdit(control) {
    const {editor}=control;
    if(editor.dataset.editing==='true')return;
    const snapshot=seekSnapshot(control);
    control.cancelValue=seekFormatTime(snapshot.current);
    seekPause(control);
    editor.dataset.editing='true';
    editor.readOnly=false;
    editor.value=control.cancelValue;
    editor.removeAttribute('data-invalid');
    window.setTimeout(()=> {
      editor.focus({preventScroll:true});
      editor.select();
    },0);
  }

  function seekEndEdit(control,keepValue=false) {
    const {editor}=control;
    editor.dataset.editing='false';
    editor.readOnly=true;
    editor.removeAttribute('data-invalid');
    if(!keepValue)editor.value=control.cancelValue||editor.value;
    try { editor.blur(); } catch(error) {}
    seekUpdateControl(control,true);
  }

  function seekCommit(control) {
    const seconds=seekParseTime(control.editor.value);
    if(!Number.isFinite(seconds)||seconds<0) {
      control.editor.dataset.invalid='true';
      control.editor.select();
      return;
    }
    if(!seekToSeconds(control,seconds))return;
    seekEndEdit(control,true);
    seekPlay(control);
  }

  function seekUpdateControl(control,force=false) {
    if(!control.editor.isConnected||!control.slider.isConnected)return false;
    const snapshot=seekSnapshot(control);
    if(control.editor.dataset.editing!=='true') {
      const formatted=seekFormatTime(snapshot.current);
      if(force||control.editor.value!==formatted)control.editor.value=formatted;
      control.editor.size=Math.max(5,Math.min(8,formatted.length));
    }
    seekPositionControl(control,snapshot);
    control.lastSnapshot={current:snapshot.current,duration:snapshot.duration,ratio:snapshot.ratio};
    return true;
  }

  function seekMakeControl(root,slider,progressRow,track) {
    let editor=track.querySelector(':scope > .suno-editable-seek-time');
    if(!editor) {
      editor=document.createElement('input');
      editor.type='text';
      editor.inputMode='numeric';
      editor.autocomplete='off';
      editor.spellcheck=false;
      editor.readOnly=true;
      editor.className='suno-editable-seek-time';
      editor.dataset.editing='false';
      editor.setAttribute('aria-label','Current playback time. Click to enter a new time.');
      editor.title='Click to enter a time such as 3:44';
      track.appendChild(editor);
    }
    const center=progressRow.closest('[data-pb="c"]')||
      track.closest('[data-pb="c"]')||root;
    const control={
      root,center,slider,progressRow,track,editor,
      cancelValue:'0:00',lastCommitted:0
    };
    editor.__sunoSeekControl=control;
    if(!editor.dataset.sunoSeekHandlers) {
      editor.dataset.sunoSeekHandlers='1';
      editor.addEventListener('pointerdown',event=> {
        event.stopPropagation();
      });
      editor.addEventListener('click',event=> {
        event.preventDefault();
        event.stopPropagation();
        seekBeginEdit(editor.__sunoSeekControl);
      });
      editor.addEventListener('keydown',event=> {
        event.stopPropagation();
        const live=editor.__sunoSeekControl;
        if(event.key==='Enter') {
          event.preventDefault();
          seekCommit(live);
        } else if(event.key==='Escape') {
          event.preventDefault();
          seekEndEdit(live,false);
        }
      });
      editor.addEventListener('input',()=>editor.removeAttribute('data-invalid'));
      editor.addEventListener('blur',()=> {
        const live=editor.__sunoSeekControl;
        if(editor.dataset.editing==='true')seekEndEdit(live,false);
      });
    }
    editableSeekState.controls.add(control);
    seekInstallWideClick(control);
    seekUpdateControl(control,true);
    return control;
  }

  function editableSeekRefresh() {
    const live=new Set();
    for(const root of $('[data-playbar=true]')) {
      const slider=root.querySelector(C);
      if(!slider)continue;
      const progressRow=slider.closest('[data-pb=pr]')||progRow(slider,root);
      const track=slider.closest('[data-pb=tr]')||progressRow?.querySelector('[data-pb=tr]')||slider.parentElement;
      if(!progressRow||!track)continue;
      A(progressRow,'pr','pb');
      A(track,'tr','pb');
      let editor=track.querySelector(':scope > .suno-editable-seek-time');
      let control=editor?.__sunoSeekControl;
      if(!control||control.slider!==slider||control.root!==root) {
        control=seekMakeControl(root,slider,progressRow,track);
        editor=control.editor;
      }
      control.progressRow=progressRow;
      control.track=track;
      control.center=progressRow.closest('[data-pb="c"]')||
        track.closest('[data-pb="c"]')||root;
      control.editor=editor||control.editor;
      control.editor.__sunoSeekControl=control;
      seekInstallWideClick(control);
      live.add(control);
      seekUpdateControl(control);
    }
    for(const control of [...editableSeekState.controls]) {
      if(!live.has(control)||!control.editor.isConnected)editableSeekState.controls.delete(control);
    }
  }

  function installEditableSeekTime() {
    clearControllers(EDITABLE_SEEK_KEY,/^__sunoEditableSeekTimeV\d+$/,controller=> {
      if(controller?.timer)window.clearInterval(controller.timer);
      for(const control of controller?.controls||[]) {
        const area=control?.wideClickArea;
        const handler=control?.wideClickHandler;
        const moveHandler=control?.hoverMoveHandler;
        const leaveHandler=control?.hoverLeaveHandler;
        if(area&&handler)area.removeEventListener('click',handler,true);
        if(area&&moveHandler)area.removeEventListener('pointermove',moveHandler,true);
        if(area&&leaveHandler)area.removeEventListener('pointerleave',leaveHandler,true);
        control?.hoverPreview?.remove?.();
        if(area?.__sunoWideSeekHandler===handler) {
          delete area.__sunoWideSeekHandler;
          delete area.__sunoWideSeekControl;
          delete area.__sunoHoverSeekMoveHandler;
          delete area.__sunoHoverSeekLeaveHandler;
        }
      }
    });
    editableSeekState.timer=window.setInterval(()=> {
      for(const control of [...editableSeekState.controls]) {
        if(!seekUpdateControl(control))editableSeekState.controls.delete(control);
      }
    },180);
    window[EDITABLE_SEEK_KEY]=editableSeekState;
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
  function markPinnedColumn() {
    const rows=[...document.querySelectorAll('.clip-row.clip-pin')].filter(row=> {
      if(!row.isConnected)return false;
      if(row.closest('[data-carousel-proxy="1"]'))return false;
      const rect=row.getBoundingClientRect();
      return rect.width>0&&rect.height>0;
    });
    if(rows.length<2)return false;

    let strip=null;
    for(let node=rows[0].parentElement,depth=0;node&&depth<12;node=node.parentElement,depth++) {
      const direct=[...node.children];
      const pinnedChildren=direct.filter(child=>
        child.querySelector?.('.clip-row.clip-pin')
      );
      if(pinnedChildren.length===rows.length) {
        strip=node;
        break;
      }
    }
    if(!strip)return false;

    // Only mark the actual strip. No parent, scroll owner or sibling is changed.
    if(strip.dataset.sunoPinnedColumn!=="1") {
      strip.dataset.sunoPinnedColumn="1";
    }

    const sizeStrip=()=> {
      if(!strip.isConnected)return;

      const items=[...strip.children].filter(child=>
        child.querySelector?.('.clip-row.clip-pin')
      );
      if(!items.length)return;

      let total=0;
      let collapsed=0;

      items.forEach((item,index)=> {
        const row=item.querySelector('.clip-row.clip-pin');
        const itemStyle=getComputedStyle(item);
        const height=Math.max(
          item.getBoundingClientRect().height,
          item.offsetHeight,
          item.scrollHeight,
          row?.getBoundingClientRect?.().height||0,
          row?.offsetHeight||0
        );
        const outerHeight=height+
          (parseFloat(itemStyle.marginTop)||0)+
          (parseFloat(itemStyle.marginBottom)||0);

        total+=outerHeight;
        if(index<2)collapsed+=outerHeight;
      });

      total=Math.ceil(total);
      collapsed=Math.ceil(collapsed);
      if(total<=0||collapsed<=0)return;

      const previousFull=parseFloat(
        strip.style.getPropertyValue('--suno-pinned-full-height')
      )||0;
      const previousCollapsed=parseFloat(
        strip.style.getPropertyValue('--suno-pinned-collapsed-height')
      )||0;

      if(Math.abs(previousFull-total)>=1) {
        strip.style.setProperty(
          '--suno-pinned-full-height',
          `${total}px`
        );
      }
      if(Math.abs(previousCollapsed-collapsed)>=1) {
        strip.style.setProperty(
          '--suno-pinned-collapsed-height',
          `${collapsed}px`
        );
      }
    };

    // Measure the first two rows separately from the complete list. CSS handles
    // collapse/expand without moving or rebuilding any React-managed elements.
    sizeStrip();
    if(strip.dataset.sunoPinnedHeightScheduled!=="1") {
      strip.dataset.sunoPinnedHeightScheduled="1";
      requestAnimationFrame(()=> {
        strip.dataset.sunoPinnedHeightScheduled="0";
        sizeStrip();
      });
    }

    if(strip.dataset.sunoPinnedCollapseReset!=="1") {
      strip.dataset.sunoPinnedCollapseReset="1";
      const resetScroll=()=>requestAnimationFrame(()=> {
        if(!strip.isConnected)return;
        if(
          strip.matches(':hover')||
          strip.matches(':focus-within')||
          strip.dataset.sunoPinnedTitleHover==="1"
        )return;
        strip.scrollTop=0;
      });
      strip.addEventListener('pointerleave',resetScroll);
      strip.addEventListener('focusout',resetScroll);
    }
    return true;
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
  // ---------------------------------------------------------------------------
  // Creation date and duration on profile song thumbnails
  // ---------------------------------------------------------------------------
  // Most cards expose their complete clip object through React props or embedded
  // page data. Those objects are scanned first and stored in the existing lineage
  // metadata cache. Only IDs still missing a date or duration are fetched in small
  // batches through Suno's normal get_songs_by_ids endpoint.
  const CARD_METADATA_CONTROLLER_KEY='__sunoProfileCardMetadata';
  const cardMetadataState={requested:new Set(),request:null,stopped:false};

  clearControllers(CARD_METADATA_CONTROLLER_KEY,/^__sunoProfileCardMetadataV\d+$/,controller=>controller?.stop?.());
  window[CARD_METADATA_CONTROLLER_KEY]={
    requested:cardMetadataState.requested,
    stop:()=>{cardMetadataState.stopped=true;}
  };

  function cardMetadataNativeTileRoot(link,root) {
    if(!link||!root||!root.contains(link))return null;

    // View All uses a native card without .clip-row/data-sc markers. Walk upward
    // until one compact ancestor owns exactly one song title, one artwork image and
    // the native play/like/comment controls. The single-song restriction prevents
    // accidentally selecting the complete grid or section.
    let node=link;
    for(let depth=0;node&&node!==root&&depth<10;depth++,node=node.parentElement) {
      const songIds=new Set($('a[href^="/song/"]',node).map(candidate=>
        lnNorm((candidate.getAttribute('href')||'').match(/\/song\/([0-9a-f-]{36})/i)?.[1])
      ).filter(Boolean));
      if(songIds.size!==1)continue;
      if(!node.querySelector('img'))continue;

      const hasPlay=!!plPlaySpan(node);
      const hasLike=!!node.querySelector('[data-liked]');
      const hasComments=!!node.querySelector('a[href*="show_comments=true"]');
      if(hasPlay&&(hasLike||hasComments))return node;
    }
    return null;
  }

  function cardMetadataPageRoot() {
    const profile=profileMain();
    if(profile)return profile;

    // The dedicated View All route can omit the profile hero used by profileMain().
    // Restrict the fallback to /@handle pages so home, search and discovery tiles
    // are not modified accidentally.
    const main=document.getElementById('main-container');
    return main&&/^\/@[^/?#]+/.test(location.pathname)?main:null;
  }

  function cardMetadataRows() {
    const root=cardMetadataPageRoot();
    if(!root)return [];

    const rows=$('[data-sc="row"]',root).filter(row=>
      row.querySelector('a[href^="/song/"]')
    );

    // Add native View All cards. Their outer wrapper is intentionally tagged only
    // for this metadata feature; the existing layout code remains in full control.
    $('a[href^="/song/"]',root).forEach(link=> {
      // Include native View All and carousel cards. Only the fixed bottom player is
      // excluded; carousel slides are valid metadata targets for this feature.
      if(link.querySelector('img')||link.closest('[data-playbar="true"]'))return;
      const row=cardMetadataNativeTileRoot(link,root);
      if(!row||rows.includes(row))return;
      row.dataset.sunoCardMetadataRoot='1';
      rows.push(row);
    });

    return rows;
  }

  function cardMetadataId(row) {
    return lnRowId(row)||lnNorm(songId(row));
  }

  function cardMetadataTextHost(row) {
    const marked=row.querySelector('[data-sc="txt"]');
    if(marked)return marked;

    const titleLink=$('a[href^="/song/"]',row).find(link=>
      !link.querySelector('img')&&!/show_comments=true/i.test(link.getAttribute('href')||'')
    );
    if(!titleLink)return null;

    // On View All cards the artwork and metadata are the two direct children of the
    // card wrapper. Return the top-level child containing the title, creator and
    // counters instead of the narrow clip-title-wrapper itself.
    let child=titleLink;
    while(child.parentElement&&child.parentElement!==row)child=child.parentElement;
    if(child.parentElement===row&&!child.querySelector('img'))return child;

    return titleLink.closest('div');
  }

  function cardMetadataTopLevelChild(node,host) {
    if(!node||!host||!host.contains(node))return null;
    let current=node;
    while(current.parentElement&&current.parentElement!==host)current=current.parentElement;
    return current.parentElement===host?current:null;
  }

  function cardMetadataCommonAncestor(nodes,boundary) {
    nodes=nodes.filter(node=>node&&boundary?.contains(node));
    if(nodes.length<2)return null;

    let candidate=nodes[0];
    while(candidate&&candidate!==boundary.parentElement) {
      if(nodes.every(node=>candidate.contains(node)))return candidate;
      candidate=candidate.parentElement;
    }
    return null;
  }

  function cardMetadataActionLine(row,host) {
    const play=plPlaySpan(row);
    const liked=row.querySelector(
      '[data-liked],button[aria-label*="like" i]'
    );
    const comments=row.querySelector(
      'a[href*="show_comments=true"],button[aria-label*="comment" i],a[aria-label*="comment" i]'
    );

    // Native View All cards wrap each count in its own button. Use the lowest
    // common ancestor of the available controls so the date is appended after the
    // complete play/like/comment group, not inside the play button.
    const shared=cardMetadataCommonAncestor([play,liked,comments],host);
    if(shared&&shared!==host)return shared;

    if(play&&host?.contains(play)) {
      // Older profile layouts may expose only a recognisable play icon. Prefer the
      // first compact ancestor with multiple controls before falling back to the
      // immediate parent used by the legacy layout.
      let node=play;
      while(node&&node!==host) {
        const controls=node.querySelectorAll?.('button,a[href*="show_comments=true"]')?.length||0;
        if(controls>=2)return node;
        node=node.parentElement;
      }
      return play.parentElement;
    }

    // Proxy cards use a text-only count line, while other Suno layouts may expose
    // accessible labels instead of the older play-count SVG path.
    const labelled=liked||comments;
    if(labelled&&host?.contains(labelled))return labelled.parentElement;

    const candidates=[...(host?.querySelectorAll('div,span')||[])];
    return candidates.find(node=>node.children.length<=4&&/[▶▷].*[♡♥]/.test(node.textContent||''))||null;
  }

  function cardMetadataCreatorLine(row,host,actionLine) {
    const creator=[...(host?.querySelectorAll('a[href]')||[])].find(link=> {
      const href=link.getAttribute('href')||'';
      return !href.startsWith('/song/')&&(
        href.startsWith('/@')||/\/(?:user|artist|profile)\//i.test(href)
      );
    });
    if(creator)return creator.parentElement;

    const actionTop=cardMetadataTopLevelChild(actionLine,host);
    const titleLink=host?.querySelector('a[href^="/song/"]');
    const titleTop=cardMetadataTopLevelChild(titleLink,host);
    const previous=actionTop?.previousElementSibling;
    if(previous&&previous!==titleTop&&!previous.querySelector?.('a[href^="/song/"]'))return previous;

    // Pinned proxies and carousel cards often omit the creator row entirely. On a
    // profile page the owner is unambiguous, so generate the missing row for every
    // such card and place it immediately above the action/count line. This gives
    // duration the same stable baseline used by normal View All cards.
    if(host) {
      const profileHandle=handle();
      if(!profileHandle)return null;
      let generated=host.querySelector('[data-suno-card-generated-creator="1"]');
      if(!generated) {
        generated=document.createElement('div');
        generated.className='suno-card-generated-creator';
        generated.dataset.sunoCardGeneratedCreator='1';
        const link=document.createElement('a');
        link.href=`/@${profileHandle}`;
        link.textContent=`@${profileHandle}`;
        generated.appendChild(link);
        if(actionTop)host.insertBefore(generated,actionTop);
        else host.appendChild(generated);
      }
      return generated;
    }
    return null;
  }

  function cardMetadataDate(timestamp) {
    timestamp=Number(timestamp||0);
    if(!Number.isFinite(timestamp)||timestamp<=0)return '';
    const date=new Date(timestamp);
    return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10);
  }

  function cardMetadataSetText(line,selector,className,text,title) {
    let label=line?.querySelector(selector);
    if(!line||!text) {
      label?.remove();
      return;
    }
    if(!label) {
      label=document.createElement('span');
      label.className=className;
      line.appendChild(label);
    }
    if(label.textContent!==text)label.textContent=text;
    label.title=title||text;
  }

  // Match Suno's own counter typography exactly instead of approximating it in
  // CSS. CSS-module class names differ between View All and carousel cards, while
  // computed font properties remain reliable across both layouts.
  function cardMetadataCopyTypography(label,reference) {
    if(!label||!reference||typeof getComputedStyle!=='function')return;
    const computed=getComputedStyle(reference);
    for(const property of [
      'font-family','font-size','font-style','font-weight','line-height',
      'letter-spacing','font-variant-numeric','color'
    ]) {
      const value=computed.getPropertyValue(property);
      if(value)label.style.setProperty(property,value,'important');
    }
  }

  function cardMetadataArtwork(row) {
    if(!row)return null;
    return row.querySelector(
      '.clip-image-container,[data-sc="art"],img[data-suno-card-img="1"],img'
    );
  }

  function cardMetadataAlignLineToArtwork(row,line) {
    if(!row||!line||typeof line.getBoundingClientRect!=='function')return;
    const artwork=cardMetadataArtwork(row);
    if(!artwork||typeof artwork.getBoundingClientRect!=='function')return;

    const artworkRect=artwork.getBoundingClientRect();
    const lineRect=line.getBoundingClientRect();
    const width=artworkRect.right-lineRect.left;

    // The line may begin inside a nested Suno wrapper, so its width cannot safely
    // be inherited from that wrapper. Measure to the real artwork edge instead.
    if(!Number.isFinite(width)||width<40||width>800)return;
    line.style.setProperty('--suno-card-metadata-width',`${width}px`);
  }

  function cardMetadataRender() {
    const rows=cardMetadataRows();
    for(const row of rows) {
      const id=cardMetadataId(row);
      if(!id)continue;

      // Reuse the existing bounded React scanner so metadata already mounted with
      // the card is learned without a network request.
      lnRememberRow(row);
      lnScanRow(row);

      const info=lnSongInfo.get(id)||{};
      const host=cardMetadataTextHost(row);
      if(!host)continue;

      const actionLine=cardMetadataActionLine(row,host);
      if(actionLine) {
        actionLine.classList.add('suno-card-action-line');
        const date=cardMetadataDate(info.createdAt);
        cardMetadataSetText(
          actionLine,'[data-suno-card-date="1"]','suno-card-date',date,
          date?`Created ${date}`:''
        );
        const label=actionLine.querySelector('.suno-card-date');
        if(label) {
          label.dataset.sunoCardDate='1';
          cardMetadataCopyTypography(label,plPlaySpan(row)||actionLine.firstElementChild);
        }
        cardMetadataAlignLineToArtwork(row,actionLine);
      }

      const creatorLine=cardMetadataCreatorLine(row,host,actionLine);
      if(creatorLine) {
        creatorLine.classList.add('suno-card-creator-line');
        const duration=lnDuration(info.duration);
        const formatted=duration>0?seekFormatTime(duration):'';
        cardMetadataSetText(
          creatorLine,'[data-suno-card-duration="1"]','suno-card-duration',formatted,
          formatted?`Duration ${formatted}`:''
        );
        const label=creatorLine.querySelector('.suno-card-duration');
        if(label) {
          label.dataset.sunoCardDuration='1';
          const creatorReference=creatorLine.querySelector('a[href]')||plPlaySpan(row)||actionLine;
          cardMetadataCopyTypography(label,creatorReference);
          if(creatorLine.dataset.sunoCardGeneratedCreator==='1') {
            cardMetadataCopyTypography(creatorLine,plPlaySpan(row)||actionLine);
            const creatorLink=creatorLine.querySelector('a[href]');
            if(creatorLink)cardMetadataCopyTypography(creatorLink,plPlaySpan(row)||actionLine);
          }
        }
        cardMetadataAlignLineToArtwork(row,creatorLine);
      }
    }
    return rows;
  }

  async function cardMetadataFetchUrl(url) {
    const headers={accept:'application/json'};
    const token=await creditGetClerkToken();
    if(token)headers.authorization=`Bearer ${token}`;
    let response=await fetch(url,{credentials:'include',cache:'default',headers});
    if(response.status===401&&!headers.authorization) {
      const retryToken=await creditGetClerkToken();
      if(retryToken)response=await fetch(url,{
        credentials:'include',cache:'default',
        headers:{accept:'application/json',authorization:`Bearer ${retryToken}`}
      });
    }
    if(!response.ok)throw new Error(`Card metadata request failed: ${response.status}`);
    const contentType=response.headers.get('content-type')||'';
    return contentType.includes('json')?response.json():response.text();
  }

  async function cardMetadataFetchBatch(ids) {
    ids=[...new Set(ids.map(lnNorm).filter(Boolean))];
    if(!ids.length)return;
    const buildUrl=mode=> {
      const url=new URL(`${STUDIO_API_BASE}/api/clips/get_songs_by_ids`);
      if(mode==='repeated')ids.forEach(id=>url.searchParams.append('ids',id));
      else url.searchParams.set('ids',ids.join(','));
      return url.href;
    };

    let payload;
    try { payload=await cardMetadataFetchUrl(buildUrl('repeated')); }
    catch(firstError) { payload=await cardMetadataFetchUrl(buildUrl('comma')); }
    workspaceIndexPayload(payload,{
      source:'profile-card-metadata',allowOrder:false,
      context:'profile get_songs_by_ids',max:50000
    });
  }

  function cardMetadataRefresh() {
    if(cardMetadataState.stopped)return;
    const rows=cardMetadataRender();
    if(cardMetadataState.request||!rows.length)return;

    const missing=[];
    for(const row of rows) {
      const id=cardMetadataId(row);
      const info=lnSongInfo.get(id)||{};
      if(id&&!cardMetadataState.requested.has(id)&&(!info.createdAt||!lnDuration(info.duration)))missing.push(id);
    }
    const chunk=[...new Set(missing)].slice(0,WORKSPACE_BATCH_SIZE);
    if(!chunk.length)return;
    chunk.forEach(id=>cardMetadataState.requested.add(id));

    cardMetadataState.request=cardMetadataFetchBatch(chunk).catch(()=>{}).finally(()=> {
      cardMetadataState.request=null;
      cardMetadataRender();
      if(cardMetadataRows().some(row=> {
        const info=lnSongInfo.get(cardMetadataId(row))||{};
        return !info.createdAt||!lnDuration(info.duration);
      }))window.setTimeout(cardMetadataRefresh,180);
    });
  }
  // ---------------------------------------------------------------------------
  // Multi-source relation store and proactive Create-workspace index
  // ---------------------------------------------------------------------------
  // The relation graph is intentionally separate from the removed background-colour
  // feature. A child may have multiple direct sources. Shared ancestors are retained
  // independently in every branch when the overlay renders the graph.
  const ANCESTRY_STORE='__suno_create_ancestry_v43';
  const LEGACY_LINEAGE_STORE='__suno_create_lineage_v26';
  const STUDIO_API_BASE='https://studio-api-prod.suno.com';
  const WORKSPACE_REQUEST_CONCURRENCY=2;
  const WORKSPACE_BATCH_SIZE=35;

  const CREDIT_WIDGET_ID='suno-exact-credit-sidebar-entry';
  const CREDIT_CACHE_KEY='__suno_exact_credit_balance_v64';
  const CREDIT_REFRESH_MS=60000;
  const CREDIT_API_URL=`${STUDIO_API_BASE}/api/billing/info/`;
  const CREDIT_CONTROLLER_KEY='__sunoCredits';

  clearControllers(CREDIT_CONTROLLER_KEY,/^__sunoCreditsV\d+$/,controller=>controller?.stop?.());

  const creditState={
    value:null,
    lastUpdated:0,
    lastAttempt:0,
    lastError:'',
    request:null,
    interval:0,
    visibilityHandler:null
  };

  function creditParseNumber(value) {
    if(typeof value==='number')return Number.isFinite(value)&&value>=0?Math.trunc(value):null;
    if(typeof value!=='string')return null;
    const normalized=value.replace(/[\s,]/g,'');
    if(!/^\d+(?:\.\d+)?$/.test(normalized))return null;
    const number=Number(normalized);
    return Number.isFinite(number)&&number>=0?Math.trunc(number):null;
  }

  function creditExtractBalance(payload) {
    if(!payload||typeof payload!=='object')return null;
    const preferredKeys=[
      'total_credits_left','totalCreditsLeft','credits_left','creditsLeft',
      'remaining_credits','remainingCredits','credit_balance','creditBalance'
    ];
    const visited=new Set();
    const inspect=(value,depth=0)=> {
      if(!value||typeof value!=='object'||depth>5||visited.has(value))return null;
      visited.add(value);
      for(const key of preferredKeys) {
        if(Object.prototype.hasOwnProperty.call(value,key)) {
          const parsed=creditParseNumber(value[key]);
          if(parsed!==null)return parsed;
        }
      }
      for(const [key,child] of Object.entries(value)) {
        if(!/(billing|credit|balance|subscription|plan|usage|account|data|info)/i.test(key))continue;
        const parsed=inspect(child,depth+1);
        if(parsed!==null)return parsed;
      }
      return null;
    };
    return inspect(payload);
  }

  function creditFormattedValue(value=creditState.value) {
    return Number.isFinite(value)?Math.trunc(value).toLocaleString('en-US'):'';
  }

  function creditText(value=creditState.value) {
    const formatted=creditFormattedValue(value);
    return formatted?`${formatted} Credits`:'';
  }

  function creditFindHomeLink() {
    const normalize=link=>String(link?.textContent||'').replace(/\s+/g,' ').trim();

    // Suno currently maps the visible "Home" item to /discover. Prefer the exact
    // navigation block supplied by the page instead of falling back to the logo.
    const exact=document.querySelector('div.flex.flex-col.gap-px.px-3 > a[href="/discover"]');
    if(exact&&/^home$/i.test(normalize(exact)))return exact;

    const candidates=[...document.querySelectorAll('a[href="/discover"],a[href="/home"],a[href="/"]')];
    const inNavigationBlock=link=>Boolean(
      link.parentElement?.matches?.('div.flex.flex-col.gap-px.px-3')||
      link.closest?.('nav,aside,[data-sidebar],[class*="sidebar"],[class*="Sidebar"]')
    );
    return candidates.find(link=>/^home$/i.test(normalize(link))&&inNavigationBlock(link))||
      candidates.find(link=>/^home$/i.test(normalize(link)))||null;
  }

  function creditCreateSidebarEntry(homeLink) {
    const entry=document.createElement('div');
    entry.id=CREDIT_WIDGET_ID;
    entry.dataset.sunoExactCredits='1';
    entry.dataset.sunoCreditLine='1';
    entry.className=homeLink.className;
    entry.setAttribute('data-inactive','');
    entry.setAttribute('role','status');
    entry.setAttribute('aria-live','polite');
    entry.setAttribute('aria-atomic','true');

    // Match Suno's button structure so the row occupies exactly the same navigation
    // column as Home, but keep it non-interactive and display text only.
    const overlay=document.createElement('span');
    overlay.setAttribute('aria-hidden','true');
    overlay.className='hxc-btn-overlay-slot hxc-btn-border';

    const content=document.createElement('span');
    content.className='hxc-btn-content';

    const label=document.createElement('span');
    label.dataset.sunoCreditValue='1';
    label.className='overflow-hidden whitespace-nowrap transition-opacity duration-200 group-data-[show-content=false]/sidebar:opacity-0';

    content.appendChild(label);
    entry.append(overlay,content);
    return entry;
  }

  function creditMountSidebar() {
    const text=creditText();
    if(!text)return false;
    const homeLink=creditFindHomeLink();
    if(!homeLink)return false;

    // The Home link itself is a direct child of the px-3 navigation column. Insert
    // the credits as that column's first row, immediately before Home.
    const navigationBlock=homeLink.parentElement;
    if(!navigationBlock)return false;

    let entry=document.getElementById(CREDIT_WIDGET_ID);
    if(!entry||entry.parentElement!==navigationBlock) {
      entry?.remove();
      entry=creditCreateSidebarEntry(homeLink);
      navigationBlock.insertBefore(entry,homeLink);
    } else if(entry.nextElementSibling!==homeLink) {
      navigationBlock.insertBefore(entry,homeLink);
    }

    const valueNode=entry.querySelector('[data-suno-credit-value="1"]')||entry;
    if(valueNode.textContent!==text)valueNode.textContent=text;
    entry.setAttribute('aria-label',text);
    entry.title=text;
    return true;
  }

  function creditElementIsBalanceDisplay(element) {
    let node=element;
    for(let depth=0;node&&node!==document.body&&depth<6;depth++,node=node.parentElement) {
      const marker=[
        typeof node.className==='string'?node.className:'',node.id||'',
        node.getAttribute?.('data-testid')||'',node.getAttribute?.('aria-label')||'',
        node.getAttribute?.('href')||''
      ].join(' ');
      if(/(?:credit|billing|subscription|account)/i.test(marker))return true;
    }
    return false;
  }

  function creditReplaceAbbreviatedLabels() {
    const text=creditText();
    if(!text)return;
    const abbreviated=/^\s*\d[\d,.]*\s*[KMB]?\s+credits?\s*$/i;
    document.querySelectorAll('span,p,a,button').forEach(element=> {
      if(element.closest(`#${CREDIT_WIDGET_ID}`))return;
      if(element.children.length||!creditElementIsBalanceDisplay(element))return;
      const current=element.textContent.trim();
      if(!abbreviated.test(current))return;
      if(current!==text)element.textContent=text;
    });
  }

  function creditRender() {
    creditMountSidebar();
    creditReplaceAbbreviatedLabels();
  }

  function creditStore(value) {
    try {
      sessionStorage.setItem(CREDIT_CACHE_KEY,JSON.stringify({value,updatedAt:Date.now()}));
    } catch(error) {}
  }

  function creditLoadStored() {
    try {
      const cached=JSON.parse(sessionStorage.getItem(CREDIT_CACHE_KEY)||'null');
      const value=creditParseNumber(cached?.value);
      if(value===null)return;
      creditState.value=value;
      creditState.lastUpdated=Number(cached.updatedAt)||0;
    } catch(error) {}
  }

  async function creditGetClerkToken() {
    for(let attempt=0;attempt<12;attempt++) {
      const session=window.Clerk?.session;
      if(session&&typeof session.getToken==='function') {
        try { return await session.getToken(); } catch(error) {}
      }
      await new Promise(resolve=>window.setTimeout(resolve,250));
    }
    return '';
  }

  async function creditFetchBilling() {
    const token=await creditGetClerkToken();
    const headers={accept:'application/json'};
    if(token)headers.authorization=`Bearer ${token}`;
    let response=await fetch(CREDIT_API_URL,{
      method:'GET',credentials:'include',cache:'no-store',headers
    });
    if(response.status===401&&!token) {
      const retryToken=await creditGetClerkToken();
      if(retryToken)response=await fetch(CREDIT_API_URL,{
        method:'GET',credentials:'include',cache:'no-store',
        headers:{accept:'application/json',authorization:`Bearer ${retryToken}`}
      });
    }
    if(!response.ok)throw new Error(`Billing request failed: ${response.status}`);
    return response.json();
  }

  function creditRefresh(force=false) {
    const now=Date.now();
    if(creditState.request)return creditState.request;
    if(!force&&now-creditState.lastAttempt<10000)return Promise.resolve(creditState.value);
    creditState.lastAttempt=now;
    creditState.request=creditFetchBilling().then(payload=> {
      const value=creditExtractBalance(payload);
      if(value===null)throw new Error('Billing response contained no exact credit balance');
      creditState.value=value;
      creditState.lastUpdated=Date.now();
      creditState.lastError='';
      creditStore(value);
      creditRender();
      return value;
    }).catch(error=> {
      creditState.lastError=String(error?.message||error);
      return creditState.value;
    }).finally(()=> {
      creditState.request=null;
      creditDebugState();
    });
    return creditState.request;
  }

  function creditDebugState() {
    window[CREDIT_CONTROLLER_KEY]={
      value:creditState.value,
      formatted:creditText(),
      lastUpdated:creditState.lastUpdated,
      lastAttempt:creditState.lastAttempt,
      lastError:creditState.lastError,
      refreshing:Boolean(creditState.request),
      refresh:()=>creditRefresh(true),
      stop:()=> {
        if(creditState.interval)window.clearInterval(creditState.interval);
        if(creditState.visibilityHandler)document.removeEventListener('visibilitychange',creditState.visibilityHandler);
        creditState.interval=0;
      }
    };
  }

  function creditInitialize() {
    creditLoadStored();
    creditRender();
    creditRefresh(true);
    creditState.interval=window.setInterval(()=>creditRefresh(true),CREDIT_REFRESH_MS);
    creditState.visibilityHandler=()=> {
      if(document.visibilityState==='visible'&&Date.now()-creditState.lastUpdated>30000)creditRefresh(true);
    };
    document.addEventListener('visibilitychange',creditState.visibilityHandler,{passive:true});
    creditDebugState();
  }

  let lnSources=new Map();
  let lnSongInfo=new Map();
  let lnRowSeen=new WeakMap();
  let lnLastDetail=0;
  let lnSaveTimer=0;
  let lnLoadingStore=false;

  const relationDetailsRefreshed=new Set();

  const workspaceState={
    id:'',
    networkOrder:[],
    reactOrder:[],
    domOrder:[],
    networkSet:new Set(),
    reactSet:new Set(),
    domSet:new Set(),
    memberSet:new Set(),
    positionMap:new Map(),
    sequences:[],
    sequenceKeys:new Set(),
    rowStep:111,
    fetchedUrls:new Set(),
    pendingUrls:new Map(),
    requestedSongIds:new Set(),
    failedSongBatch:false,
    queue:[],
    activeRequests:0,
    indexingPromise:null,
    lastKick:0,
    lastReactScan:0,
    lastVisibleScan:0,
    reactScanScheduled:false,
    feedController:null,
    feedControllerScore:0,
    feedPreloadPromise:null,
    feedPreloadDone:false,
    feedPreloadPages:0,
    feedPreloadAttempts:0,
    feedPreloadLastGrowth:0,
    indexGeneration:0
  };

  function lnNorm(value) {
    let text='';
    if(typeof value==='string')text=value;
    else if(value&&typeof value==='object')text=value.id||value.clip_id||value.uuid||'';
    text=String(text||'').replace(/^m_/, '').toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)&&
      text!=='00000000-0000-0000-0000-000000000000'?text:'';
  }

  function lnKindPriority(kind) {
    const priorities={
      cover:100, remix:98, sample:96, chop_sample:95, underpainting:94,
      overpainting:94, stem_from:93, stemmed:93, stitch:92, concat:92,
      extend:90, continue:90, section:88, infill:88, speed:86,
      remaster:84, upsample:84, old_editor:82, edit:80, edited:78, source:76,
      reference:74, input:72, history:60, derived:40, root:10
    };
    return priorities[String(kind||'').toLowerCase()]||50;
  }

  function lnContinueAt(value) {
    if(value===undefined||value===null||value==='')return null;
    const number=Number(value);
    return Number.isFinite(number)&&number>=0?number:null;
  }

  function lnAddSource(childId, sourceId, kind='derived', details={}) {
    childId=lnNorm(childId);
    sourceId=lnNorm(sourceId);
    kind=String(kind||'derived').replace(/_clip_id$/i, '').toLowerCase();
    if(!childId||!sourceId||childId===sourceId)return false;

    const continueAt=lnContinueAt(
      details&&typeof details==='object'?(details.continueAt??details.continue_at):details
    );
    let sources=lnSources.get(childId);
    if(!sources)lnSources.set(childId, sources=[]);

    const existing=sources.find(source=>source.id===sourceId);
    let changed=false;
    if(existing) {
      if(lnKindPriority(kind)>lnKindPriority(existing.kind)) {
        existing.kind=kind;
        changed=true;
      }
      if(continueAt!==null&&lnContinueAt(existing.continueAt)!==continueAt) {
        existing.continueAt=continueAt;
        changed=true;
      }
    } else {
      const source={id:sourceId, kind};
      if(continueAt!==null)source.continueAt=continueAt;
      sources.push(source);
      changed=true;
    }

    if(changed&&!lnLoadingStore)lnSave();
    return changed;
  }

  function lnTimestamp(value) {
    if(value===undefined||value===null||value==='')return 0;
    if(typeof value==='number'&&Number.isFinite(value)) {
      if(value>1e15)return Math.round(value/1000);
      if(value<1e11)return Math.round(value*1000);
      return Math.round(value);
    }
    const text=String(value).trim();
    if(!text)return 0;
    if(/^\d+(?:\.\d+)?$/.test(text))return lnTimestamp(Number(text));
    const parsed=Date.parse(text);
    return Number.isFinite(parsed)?parsed:0;
  }

  function lnDuration(value) {
    if(value===undefined||value===null||value==='')return 0;
    if(typeof value==='string'&&value.includes(':')) {
      const parsed=seekParseTime(value);
      return Number.isFinite(parsed)&&parsed>0?parsed:0;
    }
    const number=Number(value);
    return Number.isFinite(number)&&number>0?number:0;
  }

  function lnRememberInfo(id, info={}) {
    id=lnNorm(id);
    if(!id)return false;

    const previous=lnSongInfo.get(id)||{};
    const title=String(info.title||previous.title||'').replace(/\s+/g, ' ').trim();
    const image=String(info.image||previous.image||'').trim();
    const createdAt=lnTimestamp(info.createdAt||info.created_at||previous.createdAt||0);
    const duration=lnDuration(info.duration??info.duration_seconds??previous.duration??0);
    const workspaceId=lnNorm(info.workspaceId||info.workspace_id||info.projectId||info.project_id||previous.workspaceId||'');
    const next={title, image, createdAt, duration, workspaceId};

    if(previous.title===next.title&&previous.image===next.image&&
      Number(previous.createdAt||0)===next.createdAt&&Number(previous.duration||0)===next.duration&&
      String(previous.workspaceId||'')===next.workspaceId)return false;
    lnSongInfo.set(id, next);
    if(!lnLoadingStore)lnSave();
    return true;
  }

  function lnRememberObject(object) {
    if(!object||typeof object!=='object')return;
    const id=lnNorm(object.id||object.clip_id||object.uuid);
    if(!id)return;
    const metadata=object.metadata&&typeof object.metadata==='object'?object.metadata:{};
    lnRememberInfo(id, {
      title:object.title||object.name||metadata.title||metadata.display_name||'',
      image:object.image_url||object.image_large_url||object.image||object.cover_url||
        metadata.image_url||metadata.image_large_url||'',
      createdAt:object.created_at||object.createdAt||object.created_ts||object.created_time||
        object.timestamp||metadata.created_at||metadata.createdAt||metadata.created_ts||metadata.timestamp||0,
      duration:object.duration||object.duration_seconds||object.durationSeconds||
        metadata.duration||metadata.duration_seconds||metadata.durationSeconds||0,
      workspaceId:object.project_id||object.workspace_id||object.project_uuid||object.projectId||
        object.workspaceId||metadata.project_id||metadata.workspace_id||metadata.project_uuid||
        metadata.projectId||metadata.workspaceId||''
    });
  }

  function lnRowId(row) {
    const href=row?.querySelector('a[href^="/song/"]')?.getAttribute('href')||'';
    return lnNorm(href.split('/song/')[1]?.split(/[?#]/)[0]);
  }

  function lnRememberRow(row) {
    const id=lnRowId(row);
    if(!id)return;
    const titleLink=row.querySelector('[class*="clip-title-wrapper"] > a[href^="/song/"]')||
      row.querySelector('a[href^="/song/"]');
    const image=row.querySelector('img');
    lnRememberInfo(id, {
      title:titleLink?.dataset.sunoFullTitle||titleLink?.textContent||'',
      image:image?.dataset.src||image?.currentSrc||image?.src||''
    });
  }

  function lnLoadStoreObject(data) {
    if(!data||typeof data!=='object')return;
    const parents=data.parents||{};
    const sources=data.sources||{};
    const songs=data.songs||{};

    for(const[id, value]of Object.entries(parents)) {
      const child=lnNorm(id);
      const parent=lnNorm(value?.parent||value);
      if(child&&parent&&child!==parent)lnAddSource(child, parent, value?.kind||'derived');
    }
    for(const[id, values]of Object.entries(sources)) {
      const child=lnNorm(id);
      if(!child||!Array.isArray(values))continue;
      for(const value of values)lnAddSource(child, value?.id||value?.parent||value, value?.kind||'derived', value||{});
    }
    for(const[id, info]of Object.entries(songs))lnRememberInfo(id, info||{});
  }

  function lnLoad() {
    lnLoadingStore=true;
    try {
      try { lnLoadStoreObject(JSON.parse(sessionStorage.getItem(LEGACY_LINEAGE_STORE)||'{}')); } catch(error) {}
      try { lnLoadStoreObject(JSON.parse(sessionStorage.getItem(ANCESTRY_STORE)||'{}')); } catch(error) {}
    } finally {
      lnLoadingStore=false;
    }
  }

  function lnSave() {
    clearTimeout(lnSaveTimer);
    lnSaveTimer=window.setTimeout(()=> {
      try {
        const sources={};
        const songs={};
        for(const[id, list]of lnSources) {
          sources[id]=list.map(source=>{
            const stored={id:source.id, kind:source.kind||'derived'};
            const continueAt=lnContinueAt(source.continueAt);
            if(continueAt!==null)stored.continueAt=continueAt;
            return stored;
          });
        }
        for(const[id, info]of [...lnSongInfo.entries()].slice(-1200)) {
          songs[id]={
            title:String(info?.title||''),
            image:String(info?.image||''),
            createdAt:Number(info?.createdAt||0),
            duration:Number(info?.duration||0),
            workspaceId:String(info?.workspaceId||'')
          };
        }
        sessionStorage.setItem(ANCESTRY_STORE, JSON.stringify({sources, songs}));
      } catch(error) {}
    }, 160);
  }

  function lnVal(object, metadata, key) {
    let value;
    try { value=metadata?.[key]; } catch(error) {}
    if(value!==undefined&&value!==null&&value!=='')return value;
    try { return object?.[key]; } catch(error) { return undefined; }
  }

  function lnIds(value, output=[]) {
    const add=candidate=> {
      const id=lnNorm(candidate);
      if(id&&!output.includes(id))output.push(id);
    };
    if(Array.isArray(value)) {
      for(const item of value)lnIds(item, output);
    } else if(value&&typeof value==='object') {
      add(value.id||value.clip_id||value.uuid);
      for(const key of['clips','items','history','sources','parents','inputs']) {
        if(value[key]!==undefined)lnIds(value[key], output);
      }
    } else add(value);
    return output;
  }

  function lnSourcesFromObject(object) {
    const metadata=object?.metadata&&typeof object.metadata==='object'?object.metadata:{};
    const task=String(lnVal(object, metadata, 'task')||'').toLowerCase();
    const type=String(lnVal(object, metadata, 'type')||lnVal(object, metadata, 'clip_type')||'').toLowerCase();
    const history=lnVal(object, metadata, 'history');
    const historyContinueAt=Array.isArray(history)?history.map(item=>
      lnContinueAt(item?.continue_at??item?.continueAt)
    ).find(value=>value!==null):null;
    const extendContinueAt=lnContinueAt(lnVal(object, metadata, 'continue_at'))??
      lnContinueAt(lnVal(object, metadata, 'continueAt'))??historyContinueAt;
    const result=[];
    const add=(value, kind, details={})=> {
      const continueAt=lnContinueAt(
        details&&typeof details==='object'?(details.continueAt??details.continue_at):details
      );
      for(const id of lnIds(value)) {
        const existing=result.find(source=>source.id===id);
        if(!existing) {
          const source={id, kind};
          if(continueAt!==null)source.continueAt=continueAt;
          result.push(source);
        } else {
          if(lnKindPriority(kind)>lnKindPriority(existing.kind))existing.kind=kind;
          if(continueAt!==null)existing.continueAt=continueAt;
        }
      }
    };

    if(task==='infill'||task==='fixed_infill') {
      add(lnVal(object, metadata, 'override_history_clip_id'), 'section');
      add(lnVal(object, metadata, 'override_future_clip_id'), 'section');
      add(history, 'section');
      add(lnVal(object, metadata, 'edited_clip_id'), 'edit');
    }
    if(task==='extend') {
      add(history, 'extend', {continueAt:extendContinueAt});
      add(lnVal(object, metadata, 'continue_clip_id'), 'extend', {continueAt:extendContinueAt});
      add(lnVal(object, metadata, 'edited_clip_id'), 'edit');
    }
    if(type==='concat') {
      add(lnVal(object, metadata, 'concat_history'), 'stitch');
      add(lnVal(object, metadata, 'edited_clip_id'), 'edit');
    }
    if(type==='edit_speed') {
      add(lnVal(object, metadata, 'speed_clip_id'), 'speed');
      add(lnVal(object, metadata, 'edited_clip_id'), 'edit');
    }
    if(task==='cover') {
      add(lnVal(object, metadata, 'cover_clip_id'), 'cover');
      add(lnVal(object, metadata, 'edited_clip_id'), 'edit');
    }
    if(type==='upsample'||task==='upsample') {
      add(lnVal(object, metadata, 'upsample_clip_id'), 'remaster');
      add(lnVal(object, metadata, 'remaster_clip_id'), 'remaster');
      add(lnVal(object, metadata, 'edited_clip_id'), 'edit');
    }
    if(type==='edit_v3_export')add(lnVal(object, metadata, 'edited_clip_id'), 'edit');

    const fields=[
      ['cover_clip_id','cover'], ['remix_clip_id','remix'],
      ['sample_clip_id','sample'], ['chop_sample_clip_id','chop_sample'],
      ['source_clip_id','source'], ['reference_clip_id','reference'],
      ['continue_clip_id','extend'], ['infill_clip_id','section'],
      ['underpainting_clip_id','underpainting'], ['overpainting_clip_id','overpainting'],
      ['stem_from_id','stem_from'], ['speed_clip_id','speed'],
      ['upsample_clip_id','remaster'], ['remaster_clip_id','remaster'],
      ['edited_clip_id','edit'], ['history',task==='extend'?'extend':'history'],
      ['concat_history','stitch'], ['source_clips','source'],
      ['reference_clips','reference'], ['input_clips','input']
    ];
    for(const[field, kind]of fields)add(
      lnVal(object, metadata, field),kind,kind==='extend'?{continueAt:extendContinueAt}:{}
    );

    if(!result.length) {
      const roots=lnVal(object, metadata, 'clip_roots');
      const rootValues=Array.isArray(roots)?roots:Array.isArray(roots?.clips)?roots.clips:[];
      add(rootValues, String(roots?.clip_attribution_type||'root'));
    }
    return result;
  }

  function lnRecord(object) {
    if(!object||typeof object!=='object')return false;
    const id=lnNorm(object.id||object.clip_id||object.uuid);
    if(!id)return false;
    lnRememberObject(object);
    let changed=false;
    for(const source of lnSourcesFromObject(object)) {
      changed=lnAddSource(id, source.id, source.kind, source)||changed;
    }
    return changed;
  }

  function lnWalk(value, seen=new WeakSet(), depth=0, budget={n:0,max:9000}) {
    if(value==null||depth>12||budget.n++>budget.max)return;
    if(typeof value==='string') {
      if(value.length<60||value.length>260000||
        !/(?:clip_id|clip_roots|history|stem_from_id|image_url|audio_url)/.test(value))return;
      const trimmed=value.trim();
      if(trimmed[0]==='{'||trimmed[0]==='[') {
        try { lnWalk(JSON.parse(trimmed), seen, depth+1, budget); } catch(error) {}
      }
      return;
    }
    if(typeof value!=='object'||seen.has(value))return;
    seen.add(value);
    lnRecord(value);
    if(value.nodeType)return;

    let keys;
    try { keys=Object.keys(value); } catch(error) { return; }
    for(const key of keys) {
      if(['stateNode','alternate','return','child','sibling','_owner'].includes(key))continue;
      let next;
      try { next=value[key]; } catch(error) { continue; }
      lnWalk(next, seen, depth+1, budget);
    }
  }

  function lnReactNode(node, seen=new WeakSet(), budget={n:0,max:5000}) {
    if(!node)return;
    let keys;
    try { keys=Object.getOwnPropertyNames(node); } catch(error) { return; }
    for(const key of keys) {
      if(!key.startsWith('__reactProps$')&&!key.startsWith('__reactFiber$'))continue;
      let value;
      try { value=node[key]; } catch(error) { continue; }
      if(key.startsWith('__reactProps$')) {
        lnWalk(value, seen, 0, budget);
      } else {
        let fiber=value;
        let steps=0;
        while(fiber&&steps++<24&&budget.n<budget.max) {
          lnWalk(fiber.memoizedProps, seen, 0, budget);
          lnWalk(fiber.pendingProps, seen, 0, budget);
          lnWalk(fiber.memoizedState, seen, 0, budget);
          fiber=fiber.return;
        }
      }
    }
  }

  function lnScanRow(row) {
    const id=lnRowId(row);
    if(!id||lnRowSeen.get(row)===id)return;
    lnRowSeen.set(row, id);
    const nodes=[row,row.parentElement,row.closest('[draggable="true"]'),
      row.querySelector('a[href^="/song/"]'),row.querySelector('[aria-label^="Play "]'),
      row.querySelector('button[aria-label="Edit title"]'),
      row.querySelector('button[aria-label="More options"]')].filter(Boolean);

    let count=0;
    for(const node of row.querySelectorAll('*')) {
      if(count>=18)break;
      let keys;
      try { keys=Object.getOwnPropertyNames(node); } catch(error) { continue; }
      if(keys.some(key=>key.startsWith('__reactProps$')||key.startsWith('__reactFiber$'))) {
        nodes.push(node);
        count++;
      }
    }

    const seen=new WeakSet();
    const budget={n:0,max:3500};
    for(const node of new Set(nodes)) {
      if(budget.n>=budget.max)break;
      lnReactNode(node, seen, budget);
    }
  }

  function lnLinkId(anchor) {
    const href=anchor?.getAttribute('href')||'';
    return lnNorm(href.split('/song/')[1]?.split(/[?#]/)[0]);
  }

  function lnDetailPanel() {
    const candidates=[];
    for(const seed of $('button, a, [role=button]')) {
      const text=(seed.textContent||'').trim();
      if(!/^(?:Show More|Remix\/Edit)$/i.test(text)&&
        !/(?:Cover|Remix|Sample|Extended?|Stemmed?|Remastered?)\s+(?:of|from)/i.test(text))continue;
      let node=seed;
      for(let depth=0;node&&depth<13;depth++,node=node.parentElement) {
        const links=node.querySelectorAll?.('a[href^="/song/"]')||[];
        const content=(node.textContent||'').replace(/\s+/g, ' ');
        if(links.length>=2&&/(?:Remix\/Edit|Cover\s+of|Remix\s+of|Sample(?:d)?\s+from|Extend(?:ed)?\s+from|Stemmed\s+from|Remastered\s+from)/i.test(content)) {
          candidates.push(node);
        }
      }
    }
    if(!candidates.length)return null;
    candidates.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length);
    return candidates[0];
  }

  function lnDomRelation(panel) {
    if(!panel)return;
    const links=[...panel.querySelectorAll('a[href^="/song/"]')];
    const counts=new Map();
    for(const anchor of links) {
      const id=lnLinkId(anchor);
      if(id)counts.set(id, (counts.get(id)||0)+1);
    }
    const child=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    if(!child)return;

    for(const anchor of links) {
      const source=lnLinkId(anchor);
      if(!source||source===child)continue;
      let node=anchor;
      let text='';
      for(let depth=0;node&&depth<5;depth++,node=node.parentElement) {
        text=(node.textContent||'').replace(/\s+/g, ' ').trim();
        if(/(?:Cover|Remix|Sample|Extended?|Stemmed?|Remastered?)\s+(?:of|from)/i.test(text))break;
      }
      const match=text.match(/(Cover|Remix|Sample|Extended?|Stemmed?|Remastered?)/i);
      if(match)lnAddSource(child, source, match[1].toLowerCase());
    }
  }

  function lnScanDetail() {
    const panel=lnDetailPanel();
    if(!panel)return;
    lnDomRelation(panel);
    const nodes=[panel];
    let count=0;
    for(const node of panel.querySelectorAll('*')) {
      if(count>=35)break;
      let keys;
      try { keys=Object.getOwnPropertyNames(node); } catch(error) { continue; }
      if(keys.some(key=>key.startsWith('__reactProps$')||key.startsWith('__reactFiber$'))) {
        nodes.push(node);
        count++;
      }
    }
    const seen=new WeakSet();
    const budget={n:0,max:14000};
    for(const node of new Set(nodes)) {
      if(budget.n>=budget.max)break;
      lnReactNode(node, seen, budget);
    }
  }

  const WORKSPACE_DEFAULT_CREATE_KEY='__suno_default_create__';

  function workspaceIdFromLocation() {
    try { return lnNorm(new URL(location.href).searchParams.get('wid')); }
    catch(error) { return ''; }
  }

  function workspaceIdFromSelectedDom() {
    const selectors=[
      'a[aria-current="page"][href*="wid="]',
      'a[aria-selected="true"][href*="wid="]',
      'a[data-state="active"][href*="wid="]',
      '[data-state="active"] a[href*="wid="]',
      '[aria-selected="true"] a[href*="wid="]',
      '[data-active="true"] a[href*="wid="]'
    ];
    for(const selector of selectors) {
      for(const anchor of document.querySelectorAll(selector)) {
        try {
          const id=lnNorm(new URL(anchor.href,location.href).searchParams.get('wid'));
          if(id)return id;
        } catch(error) {}
      }
    }
    return '';
  }

  function workspaceIdFromKnownRows() {
    const counts=new Map();
    for(const row of document.querySelectorAll('[data-testid="clip-row"]')) {
      const songId=lnRowId(row);
      const id=lnNorm(lnSongInfo.get(songId)?.workspaceId);
      if(id)counts.set(id,(counts.get(id)||0)+1);
    }
    const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
    return ranked[0]?.[1]>=2?ranked[0][0]:'';
  }

  function workspaceIsCreateRoute() {
    return /^\/create(?:\/|$)/i.test(location.pathname);
  }

  function workspaceIsFallbackId(id=workspaceState.id) {
    return id===WORKSPACE_DEFAULT_CREATE_KEY;
  }

  function workspaceIdFromPage() {
    return workspaceIdFromLocation()||workspaceIdFromSelectedDom()||workspaceIdFromKnownRows();
  }

  function workspaceAdoptRealId(id, source='page') {
    id=lnNorm(id);
    if(!id)return '';
    if(workspaceState.id===id)return id;

    if(workspaceIsFallbackId()) {
      // Keep everything already learned from the default Create route. Suno often
      // omits ?wid= for the selected/default workspace and exposes the UUID only
      // later through row metadata or React state.
      workspaceState.id=id;
      workspaceState.identitySource=source;
      workspaceState.indexGeneration++;
      workspaceState.fetchedUrls.clear();
      workspaceState.pendingUrls.clear();
      workspaceState.indexingPromise=null;
      workspaceState.feedPreloadDone=false;
      return id;
    }

    workspaceReset(id);
    workspaceState.identitySource=source;
    return id;
  }

  function workspaceReset(id) {
    workspaceState.id=id;
    workspaceState.identitySource=workspaceIsFallbackId(id)?'default-create-route':(id?'page':'');
    workspaceState.networkOrder=[];
    workspaceState.reactOrder=[];
    workspaceState.domOrder=[];
    workspaceState.networkSet.clear();
    workspaceState.reactSet.clear();
    workspaceState.domSet.clear();
    workspaceState.memberSet.clear();
    workspaceState.positionMap.clear();
    workspaceState.sequences=[];
    workspaceState.sequenceKeys.clear();
    workspaceState.rowStep=111;
    workspaceState.fetchedUrls.clear();
    workspaceState.pendingUrls.clear();
    workspaceState.requestedSongIds.clear();
    workspaceState.failedSongBatch=false;
    for(const job of workspaceState.queue.splice(0))job.resolve(null);
    workspaceState.indexingPromise=null;
    workspaceState.lastKick=0;
    workspaceState.lastReactScan=0;
    workspaceState.lastVisibleScan=0;
    workspaceState.reactScanScheduled=false;
    workspaceState.feedController=null;
    workspaceState.feedControllerScore=0;
    workspaceState.feedPreloadPromise=null;
    workspaceState.feedPreloadDone=false;
    workspaceState.feedPreloadPages=0;
    workspaceState.feedPreloadAttempts=0;
    workspaceState.feedPreloadLastGrowth=0;
    workspaceState.indexGeneration++;
  }

  function workspaceEnsureCurrent() {
    const discovered=workspaceIdFromPage();
    if(discovered) {
      if(discovered!==workspaceState.id)return workspaceAdoptRealId(discovered,'page');
      return discovered;
    }

    if(workspaceIsCreateRoute()) {
      // The current Suno Create route may omit ?wid even though a workspace is
      // selected. Use a stable internal identity so indexing, React inspection
      // and lazy-page preloading can start immediately instead of remaining null.
      if(!workspaceState.id)workspaceReset(WORKSPACE_DEFAULT_CREATE_KEY);
      return workspaceState.id;
    }

    if(workspaceState.id)workspaceReset('');
    return '';
  }

  function workspaceMarkMember(id) {
    id=lnNorm(id);
    if(id)workspaceState.memberSet.add(id);
  }

  function workspaceAppendOrder(id, source='network') {
    id=lnNorm(id);
    if(!id)return;
    workspaceMarkMember(id);
    const order=source==='network'?workspaceState.networkOrder:
      source==='react'?workspaceState.reactOrder:workspaceState.domOrder;
    const set=source==='network'?workspaceState.networkSet:
      source==='react'?workspaceState.reactSet:workspaceState.domSet;
    if(set.has(id))return;
    set.add(id);
    order.push(id);
  }

  function workspaceHasSong(id) {
    id=lnNorm(id);
    if(!id)return false;
    const info=lnSongInfo.get(id)||{};
    return Boolean(lnVisibleRow(id)||info.workspaceId===workspaceState.id||workspaceState.memberSet.has(id)||
      workspaceState.networkSet.has(id)||workspaceState.reactSet.has(id)||workspaceState.domSet.has(id));
  }

  function workspaceProjectIdFromObject(object) {
    if(!object||typeof object!=='object')return '';
    const metadata=object.metadata&&typeof object.metadata==='object'?object.metadata:{};
    return lnNorm(object.project_id||object.workspace_id||object.project_uuid||
      object.projectId||object.workspaceId||object.project||object.workspace||
      metadata.project_id||metadata.workspace_id||metadata.project_uuid||
      metadata.projectId||metadata.workspaceId);
  }

  function workspaceMarkObjectMembership(object) {
    if(!object||typeof object!=='object'||Array.isArray(object))return;
    const clipId=lnNorm(object.id||object.clip_id||object.uuid);
    if(!clipId)return;
    if(workspaceProjectIdFromObject(object)===workspaceState.id)workspaceMarkMember(clipId);
  }

  function workspaceSequenceClipId(object) {
    if(!object||typeof object!=='object'||Array.isArray(object))return '';
    return lnNorm(object.id||object.clip_id||object.uuid);
  }

  function workspaceLooksLikeFullClip(object) {
    const id=workspaceSequenceClipId(object);
    if(!id)return false;
    const metadata=object.metadata&&typeof object.metadata==='object'?object.metadata:{};
    const strong=Boolean(object.title||object.name||object.image_url||object.image_large_url||
      object.audio_url||object.video_url||object.created_at||object.status||object.model_name||
      metadata.title||metadata.image_url||metadata.prompt||metadata.tags||metadata.duration);
    return strong;
  }

  function workspaceRememberSequence(array, source='network', context='', path='') {
    if(!Array.isArray(array)||array.length<2)return;
    const pathText=String(path||'').toLowerCase();
    if(/(?:metadata|history|clip_roots?|sources?|parents?|inputs?|attribution|references?|lineage|ancestors?)/.test(pathText))return;

    const objects=array.filter(item=>item&&typeof item==='object'&&!Array.isArray(item));
    const clips=objects.filter(workspaceLooksLikeFullClip);
    if(clips.length<2||clips.length/Math.max(1,array.length)<0.7)return;

    const ids=[];
    for(const item of clips) {
      const id=workspaceSequenceClipId(item);
      if(id&&!ids.includes(id))ids.push(id);
    }
    if(ids.length<2)return;

    const signature=ids.join('|');
    if(workspaceState.sequenceKeys.has(signature))return;
    workspaceState.sequenceKeys.add(signature);
    workspaceState.sequences.push({ids,source,context:String(context||''),path:String(path||''),seenAt:Date.now()});
    if(workspaceState.sequences.length>120) {
      const removed=workspaceState.sequences.splice(0,workspaceState.sequences.length-120);
      for(const sequence of removed)workspaceState.sequenceKeys.delete(sequence.ids.join('|'));
    }

    for(const item of clips) {
      const id=workspaceSequenceClipId(item);
      if(!id)continue;
      workspaceAppendOrder(id,source);
      workspaceMarkObjectMembership(item);
      lnRecord(item);
    }
  }

  function workspaceRememberIdArray(array, source='network', context='', path='') {
    if(!Array.isArray(array)||array.length<2)return false;
    const key=String(path||'').split('.').pop().toLowerCase();
    // Plain UUID arrays are only trusted under explicit workspace-song keys.
    // This recovers complete project catalogues such as `clip_ids` without
    // treating attribution, history or arbitrary API ID arrays as list order.
    if(!/^(?:clip_ids?|song_ids?|generation_ids?|workspace_clip_ids?|project_clip_ids?)$/.test(key))return false;
    const ids=array.map(lnNorm).filter(Boolean);
    if(ids.length<2||ids.length/array.length<0.8)return false;

    const unique=[];
    for(const id of ids)if(!unique.includes(id))unique.push(id);
    if(unique.length<2)return false;

    const signature=`ids:${unique.join('|')}`;
    if(!workspaceState.sequenceKeys.has(signature)) {
      workspaceState.sequenceKeys.add(signature);
      workspaceState.sequences.push({
        ids:unique,source:`${source}-id-list`,context:String(context||''),
        path:String(path||''),seenAt:Date.now(),trustedIdList:true
      });
    }
    for(const id of unique)workspaceAppendOrder(id,source);
    workspaceScheduleSongDetails();
    return true;
  }


  function lnAttributionKind(relationship) {
    const normalized=String(relationship||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_');
    if(!normalized)return 'source';
    if(/^rev\d*$/.test(normalized)||normalized.includes('edit'))return 'old_editor';
    if(normalized.includes('extend')||normalized.includes('continue'))return 'extend';
    if(normalized.includes('concat')||normalized.includes('stitch')||normalized.includes('join'))return 'stitch';
    if(normalized.includes('cover'))return 'cover';
    if(normalized.includes('remix'))return 'remix';
    if(normalized.includes('sample'))return 'sample';
    if(normalized.includes('stem'))return 'stem_from';
    if(normalized.includes('speed'))return 'speed';
    if(normalized.includes('remaster')||normalized.includes('upsample'))return 'remaster';
    return normalized;
  }

  function workspaceAttributionChildId(context) {
    const match=String(context||'').match(/\/api\/clips\/([0-9a-f-]{36})\/attribution(?:[/?#]|$)/i);
    return lnNorm(match?.[1]);
  }

  function workspaceIndexAttributionPayload(childId, payload) {
    childId=lnNorm(childId);
    if(!childId||!payload||typeof payload!=='object')return false;

    const sourceClips=Array.isArray(payload.source_clips)?payload.source_clips:
      Array.isArray(payload.sources)?payload.sources:[];
    let changed=false;

    for(const source of sourceClips) {
      if(!source||typeof source!=='object')continue;
      const sourceId=lnNorm(source.clip_id||source.id||source.uuid);
      if(!sourceId)continue;
      lnRememberObject({
        ...source,
        id:sourceId,
        title:source.title||source.name||'',
        image_url:source.image_url||source.image||'',
        audio_url:source.audio_url||source.audio||''
      });
      changed=lnAddSource(childId,sourceId,lnAttributionKind(source.relationship),source)||changed;
    }
    return changed;
  }

  function workspaceIndexPayload(value, options={}) {
    const source=options.source||'network';
    const allowOrder=options.allowOrder!==false;
    const attributionChildId=workspaceAttributionChildId(options.context);
    if(attributionChildId)workspaceIndexAttributionPayload(attributionChildId,value);
    const seen=new WeakSet();
    const budget={n:0,max:options.max||80000};

    const walk=(node, context='', depth=0, path='')=> {
      if(node==null||depth>16||budget.n++>budget.max)return;
      if(typeof node==='string') {
        const trimmed=node.trim();
        if(trimmed.length>40&&trimmed.length<500000&&(trimmed[0]==='{'||trimmed[0]==='[')) {
          try { walk(JSON.parse(trimmed), context, depth+1, path); } catch(error) {}
        }
        return;
      }
      if(typeof node!=='object'||seen.has(node))return;
      seen.add(node);

      if(Array.isArray(node)) {
        if(allowOrder) {
          workspaceRememberIdArray(node,source,options.context||'',path||context);
          workspaceRememberSequence(node,source,options.context||'',path||context);
        }
        for(const item of node) {
          if(item&&typeof item==='object')workspaceMarkObjectMembership(item);
          if(item&&typeof item==='object')lnRecord(item);
          walk(item, context, depth+1, path);
        }
        return;
      }

      workspaceMarkObjectMembership(node);
      lnRecord(node);

      let keys;
      try { keys=Object.keys(node); } catch(error) { return; }
      const priority=['clips','songs','feed','generations','items','results','records','pages','data'];
      keys.sort((a,b)=>priority.indexOf(a)===-1?1:priority.indexOf(b)===-1?-1:priority.indexOf(a)-priority.indexOf(b));
      for(const key of keys) {
        if(['stateNode','alternate','return','child','sibling','_owner'].includes(key))continue;
        let child;
        try { child=node[key]; } catch(error) { continue; }
        const childPath=path?`${path}.${key}`:key;
        walk(child,key,depth+1,childPath);
      }
    };

    walk(value, options.context||'', 0, '');
  }

  function workspaceIndexVisibleRows() {
    const id=workspaceEnsureCurrent();
    if(!id)return;
    const rows=$('[data-testid="clip-row"]');
    const container=workspaceScrollContainer();
    const containerRect=container?.getBoundingClientRect?.()||{top:0};
    const measured=[];

    for(const row of rows) {
      const songId=lnRowId(row);
      if(!songId)continue;
      lnRememberRow(row);
      lnScanRow(row);
      workspaceAppendOrder(songId, 'dom');

      if(container) {
        const rect=row.getBoundingClientRect();
        const top=container.scrollTop+rect.top-containerRect.top;
        if(Number.isFinite(top)&&Number.isFinite(rect.height)&&rect.height>20) {
          workspaceState.positionMap.set(songId,{top,height:rect.height,seenAt:Date.now()});
          measured.push({top,height:rect.height});
        }
      }
    }

    measured.sort((a,b)=>a.top-b.top);
    const steps=[];
    for(let index=1;index<measured.length;index++) {
      const delta=measured[index].top-measured[index-1].top;
      if(delta>35&&delta<260)steps.push(delta);
    }
    if(steps.length) {
      steps.sort((a,b)=>a-b);
      workspaceState.rowStep=steps[Math.floor(steps.length/2)];
    }
    workspaceState.lastVisibleScan=Date.now();
  }

  function workspaceVisibleSongIds() {
    return new Set($('[data-testid="clip-row"]').map(row=>lnRowId(row)).filter(Boolean));
  }

  function workspaceCollectCandidateIds(value, limit=1800) {
    const ids=[];
    const seen=new WeakSet();
    let visited=0;
    const walk=(node,depth=0)=> {
      if(node==null||depth>11||visited++>9000||ids.length>=limit)return;
      const direct=lnNorm(node);
      if(direct) { if(!ids.includes(direct))ids.push(direct); return; }
      if(typeof node!=='object'||seen.has(node))return;
      seen.add(node);
      if(Array.isArray(node)) {
        for(const item of node)walk(item,depth+1);
        return;
      }
      let keys;
      try { keys=Object.keys(node); } catch(error) { return; }
      const priority=['data','pages','clips','songs','feed','generations','items','results','records'];
      keys.sort((a,b)=>priority.indexOf(a)===-1?1:priority.indexOf(b)===-1?-1:priority.indexOf(a)-priority.indexOf(b));
      for(const key of keys) {
        if(['stateNode','alternate','return','child','sibling','_owner'].includes(key))continue;
        let child;
        try { child=node[key]; } catch(error) { continue; }
        if(typeof child==='function')continue;
        walk(child,depth+1);
      }
    };
    walk(value);
    return ids;
  }

  function workspaceInspectInfiniteController(value, path='react') {
    if(!value||typeof value!=='object')return;
    const visible=workspaceVisibleSongIds();
    const seen=new WeakSet();
    let visited=0;

    const walk=(node,depth=0,currentPath=path)=> {
      if(!node||typeof node!=='object'||depth>12||visited++>12000||seen.has(node))return;
      seen.add(node);

      if(typeof node.fetchNextPage==='function') {
        const data=node.data?.pages||node.pages||node.data||null;
        const ids=workspaceCollectCandidateIds(data,1600);
        const overlap=ids.reduce((count,id)=>count+(visible.has(id)?1:0),0);
        const memberHits=ids.reduce((count,id)=>count+(workspaceHasSong(id)?1:0),0);
        const pathBonus=/(?:clip|song|feed|generation|workspace|project)/i.test(currentPath)?35:0;
        const hasNext=Boolean(node.hasNextPage);
        const score=overlap*220+Math.min(memberHits,20)*18+Math.min(ids.length,100)+pathBonus+(hasNext?40:0);
        if((overlap>=1||memberHits>=2||pathBonus)&&score>=workspaceState.feedControllerScore) {
          workspaceState.feedController={
            object:node,
            fetchNextPage:node.fetchNextPage,
            hasNextPage:hasNext,
            isFetchingNextPage:Boolean(node.isFetchingNextPage),
            ids,
            path:currentPath,
            seenAt:Date.now()
          };
          workspaceState.feedControllerScore=score;
        }
      }

      let keys;
      try { keys=Object.keys(node); } catch(error) { return; }
      const priority=['data','pages','query','result','infiniteQuery','feed','clips','songs','children'];
      keys.sort((a,b)=>priority.indexOf(a)===-1?1:priority.indexOf(b)===-1?-1:priority.indexOf(a)-priority.indexOf(b));
      for(const key of keys) {
        if(['stateNode','alternate','return','child','sibling','_owner'].includes(key))continue;
        let child;
        try { child=node[key]; } catch(error) { continue; }
        if(typeof child==='function')continue;
        walk(child,depth+1,`${currentPath}.${key}`);
      }
    };
    walk(value);
  }

  function workspaceScanReactState() {
    const id=workspaceEnsureCurrent();
    if(!id)return;
    const firstRow=document.querySelector('[data-testid="clip-row"]');
    const root=firstRow?.closest('main, [role="main"], #main-container')||
      document.getElementById('main-container')||document.body;
    const nodes=[root,firstRow,firstRow?.parentElement,firstRow?.parentElement?.parentElement].filter(Boolean);

    let count=0;
    for(const node of root.querySelectorAll('*')) {
      if(count>=18)break;
      let keys;
      try { keys=Object.getOwnPropertyNames(node); } catch(error) { continue; }
      if(keys.some(key=>key.startsWith('__reactProps$')||key.startsWith('__reactFiber$'))) {
        nodes.push(node);
        count++;
      }
    }

    let payloadCount=0;
    for(const node of new Set(nodes)) {
      if(payloadCount>=20)break;
      let keys;
      try { keys=Object.getOwnPropertyNames(node); } catch(error) { continue; }
      for(const key of keys) {
        if(payloadCount>=20)break;
        if(!key.startsWith('__reactProps$')&&!key.startsWith('__reactFiber$'))continue;
        let value;
        try { value=node[key]; } catch(error) { continue; }
        if(key.startsWith('__reactProps$')) {
          workspaceIndexPayload(value,{source:'react',allowOrder:true,max:5000});
          workspaceInspectInfiniteController(value,`props.${key}`);
          payloadCount++;
        } else {
          let fiber=value;
          let steps=0;
          while(fiber&&steps++<24&&payloadCount<20) {
            workspaceIndexPayload(fiber.memoizedProps,{source:'react',allowOrder:true,max:5000});
            workspaceIndexPayload(fiber.memoizedState,{source:'react',allowOrder:true,max:5000});
            workspaceInspectInfiniteController(fiber.memoizedProps,`fiber.props.${steps}`);
            workspaceInspectInfiniteController(fiber.memoizedState,`fiber.state.${steps}`);
            payloadCount+=2;
            fiber=fiber.return;
          }
        }
      }
    }
    workspaceState.lastReactScan=Date.now();
  }

  function workspaceScheduleReactScan() {
    if(workspaceState.reactScanScheduled)return;
    workspaceState.reactScanScheduled=true;
    const runScan=()=> {
      workspaceState.reactScanScheduled=false;
      try { workspaceScanReactState(); } catch(error) {}
    };
    if(typeof requestIdleCallback==='function')requestIdleCallback(runScan,{timeout:900});
    else window.setTimeout(runScan,120);
  }

  async function workspacePreloadReactFeed() {
    const id=workspaceEnsureCurrent();
    if(!id||workspaceState.feedPreloadDone)return;
    const generation=workspaceState.indexGeneration;
    let stagnant=0;

    for(let page=0;page<80;page++) {
      if(generation!==workspaceState.indexGeneration)return;
      workspaceState.feedController=null;
      workspaceState.feedControllerScore=0;
      workspaceScanReactState();
      const controller=workspaceState.feedController;
      workspaceState.feedPreloadAttempts++;

      if(!controller) {
        // React may not have exposed the infinite-query result yet. Retry on later
        // refresh passes rather than moving the visible list to provoke loading.
        if(page===0)return;
        break;
      }
      if(!controller.hasNextPage) {
        workspaceState.feedPreloadDone=true;
        break;
      }

      const beforeMembers=workspaceState.memberSet.size;
      const beforeMetadata=lnSongInfo.size;
      try {
        const result=await controller.fetchNextPage({cancelRefetch:false});
        if(result)workspaceIndexPayload(result,{
          source:'react-preload',allowOrder:true,context:'react.fetchNextPage',max:140000
        });
      } catch(error) {
        break;
      }
      if(generation!==workspaceState.indexGeneration)return;

      workspaceState.feedPreloadPages++;
      await new Promise(resolve=>window.setTimeout(resolve,160));
      workspaceScanReactState();
      workspaceScheduleSongDetails();

      const growth=(workspaceState.memberSet.size-beforeMembers)+(lnSongInfo.size-beforeMetadata);
      workspaceState.feedPreloadLastGrowth=growth;
      if(growth<=0)stagnant++;
      else stagnant=0;
      if(stagnant>=3)break;
    }
  }

  function workspaceScheduleFeedPreload() {
    const id=workspaceEnsureCurrent();
    if(!id||workspaceState.feedPreloadDone||workspaceState.feedPreloadPromise)return;
    workspaceState.feedPreloadPromise=Promise.resolve().then(workspacePreloadReactFeed).finally(()=> {
      workspaceState.feedPreloadPromise=null;
    });
  }

  function workspaceQueueTask(key, task) {
    if(workspaceState.pendingUrls.has(key))return workspaceState.pendingUrls.get(key);
    let resolvePromise;
    let rejectPromise;
    const promise=new Promise((resolve,reject)=>{resolvePromise=resolve;rejectPromise=reject;});
    workspaceState.pendingUrls.set(key,promise);
    workspaceState.queue.push({key,task,resolve:resolvePromise,reject:rejectPromise});
    workspacePumpQueue();
    return promise;
  }

  function workspacePumpQueue() {
    while(workspaceState.activeRequests<WORKSPACE_REQUEST_CONCURRENCY&&workspaceState.queue.length) {
      const job=workspaceState.queue.shift();
      workspaceState.activeRequests++;
      Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=> {
        workspaceState.activeRequests--;
        workspaceState.pendingUrls.delete(job.key);
        window.setTimeout(workspacePumpQueue, 80);
      });
    }
  }

  function workspaceRelevantUrl(rawUrl) {
    if(!rawUrl||!workspaceState.id)return false;
    try {
      const url=new URL(rawUrl,location.href);
      if(url.hostname!=='studio-api-prod.suno.com')return false;
      const realId=lnNorm(workspaceState.id);
      const exactProject=realId&&url.pathname===`/api/project/${realId}`;
      return Boolean(exactProject||
        /\/api\/feed\/v3\b/.test(url.pathname)||
        /\/api\/clips\/get_songs_by_ids\b/.test(url.pathname)||
        /\/api\/clip\//.test(url.pathname)||
        /\/api\/clips\/[0-9a-f-]{36}\/attribution/.test(url.pathname));
    } catch(error) { return false; }
  }

  function workspaceUrlAllowsOrder(rawUrl) {
    if(!rawUrl||!workspaceState.id)return false;
    try {
      const url=new URL(rawUrl,location.href);
      if(url.hostname!=='studio-api-prod.suno.com')return false;
      if(/\/pinned-clips(?:[/?#]|$)/i.test(url.pathname))return false;
      const realId=lnNorm(workspaceState.id);
      return Boolean((realId&&url.pathname===`/api/project/${realId}`)||
        /\/api\/feed\/v3(?:[/?#]|$)/i.test(url.pathname));
    } catch(error) { return false; }
  }

  function workspaceNextUrls(payload, currentUrl) {
    const output=[];
    const add=value=> {
      if(typeof value!=='string'||!value.trim())return;
      try {
        const next=new URL(value,currentUrl);
        if(next.hostname==='studio-api-prod.suno.com'&&!output.includes(next.href))output.push(next.href);
      } catch(error) {}
    };
    const inspect=(object,depth=0)=> {
      if(!object||typeof object!=='object'||depth>4)return;
      for(const key of ['next','next_url','next_page_url','nextPageUrl'])add(object[key]);
      const cursor=object.next_cursor||object.nextCursor||object.cursor?.next;
      if(typeof cursor==='string'&&cursor) {
        try {
          const next=new URL(currentUrl);
          next.searchParams.set('cursor',cursor);
          add(next.href);
        } catch(error) {}
      }
      for(const key of ['pagination','page_info','pageInfo','meta'])inspect(object[key],depth+1);
    };
    inspect(payload);
    return output;
  }

  async function workspaceFetchJson(url, options={}) {
    const id=workspaceEnsureCurrent();
    if(!id)return null;
    let normalized;
    try { normalized=new URL(url,location.href).href; } catch(error) { return null; }
    const generation=workspaceState.indexGeneration;
    const key=`${generation} GET ${normalized}`;
    if(workspaceState.fetchedUrls.has(key))return null;
    workspaceState.fetchedUrls.add(key);

    return workspaceQueueTask(key, async()=> {
      const headers={accept:'application/json'};
      if(options.authenticated) {
        const token=await creditGetClerkToken();
        if(token)headers.authorization=`Bearer ${token}`;
      }
      let response=await fetch(normalized,{credentials:'include',cache:'default',headers});
      if(response.status===401&&options.authenticated&&!headers.authorization) {
        const retryToken=await creditGetClerkToken();
        if(retryToken)response=await fetch(normalized,{
          credentials:'include',cache:'default',
          headers:{accept:'application/json',authorization:`Bearer ${retryToken}`}
        });
      }
      if(generation!==workspaceState.indexGeneration)return null;
      if(!response.ok)throw new Error(`Workspace request failed: ${response.status}`);
      const contentType=response.headers.get('content-type')||'';
      const payload=contentType.includes('json')?await response.json():await response.text();
      workspaceIndexPayload(payload,{
        source:options.source||'network',
        allowOrder:options.allowOrder!==false,
        context:normalized,
        max:options.max||100000
      });
      if(options.followPages!==false) {
        for(const nextUrl of workspaceNextUrls(payload,normalized).slice(0,3)) {
          workspaceFetchJson(nextUrl,{...options,followPages:true}).catch(()=>{});
        }
      }
      return payload;
    });
  }

  const WORKSPACE_FETCH_KEY='__sunoWorkspaceFetchCapture';

  function workspaceInstallFetchCapture() {
    clearControllers(WORKSPACE_FETCH_KEY,/^__sunoWorkspaceFetchCaptureV\d+$/,oldHook=> {
      if(oldHook?.wrapped&&window.fetch===oldHook.wrapped&&typeof oldHook.originalFetch==='function') {
        window.fetch=oldHook.originalFetch;
      }
    });
    const originalFetch=window.fetch;
    if(typeof originalFetch!=='function')return;

    const wrapped=function(...args) {
      const result=originalFetch.apply(this,args);
      try {
        const raw=typeof args[0]==='string'?args[0]:args[0]?.url;
        Promise.resolve(result).then(response=> {
          workspaceEnsureCurrent();
          if(!workspaceRelevantUrl(raw)||!response?.ok)return;
          const clone=response.clone();
          const contentType=clone.headers.get('content-type')||'';
          (contentType.includes('json')?clone.json():clone.text()).then(payload=> {
            workspaceIndexPayload(payload,{source:'network',allowOrder:workspaceUrlAllowsOrder(raw),context:String(raw||''),max:100000});
            workspaceScheduleSongDetails();
          }).catch(()=>{});
        }).catch(()=>{});
      } catch(error) {}
      return result;
    };
    wrapped.__sunoOriginalFetch=originalFetch;
    window.fetch=wrapped;
    window[WORKSPACE_FETCH_KEY]={originalFetch,wrapped};
  }

  function workspaceCandidateUrls() {
    const id=workspaceEnsureCurrent();
    const realId=lnNorm(id);
    if(!realId)return [];

    // Only refetch endpoints whose semantics are complete in the URL itself.
    // Suno's /api/feed/v3 request may be a POST with a workspace-specific body.
    // Replaying that resource entry as a plain GET can return an unrelated feed
    // and corrupt the workspace order used for virtual-list navigation.
    return [`${STUDIO_API_BASE}/api/project/${realId}`];
  }

  async function workspaceFetchSongBatch(ids) {
    ids=[...new Set(ids.map(lnNorm).filter(Boolean))].filter(id=>!workspaceState.requestedSongIds.has(id));
    if(!ids.length||workspaceState.failedSongBatch)return null;
    ids.forEach(id=>workspaceState.requestedSongIds.add(id));

    const buildUrl=mode=> {
      const url=new URL(`${STUDIO_API_BASE}/api/clips/get_songs_by_ids`);
      if(mode==='repeated')ids.forEach(id=>url.searchParams.append('ids',id));
      else url.searchParams.set('ids',ids.join(','));
      return url.href;
    };

    try {
      return await workspaceFetchJson(buildUrl('repeated'),{allowOrder:false,followPages:false,max:50000});
    } catch(firstError) {
      try {
        return await workspaceFetchJson(buildUrl('comma'),{allowOrder:false,followPages:false,max:50000});
      } catch(secondError) {
        if(ids.length>1)workspaceState.failedSongBatch=true;
        throw secondError;
      }
    }
  }

  function workspaceScheduleSongDetails() {
    if(workspaceState.failedSongBatch)return;
    const allIds=[...new Set([...workspaceState.networkOrder,...workspaceState.reactOrder,...workspaceState.domOrder])];
    const missing=allIds.filter(id=> {
      const info=lnSongInfo.get(id);
      return !workspaceState.requestedSongIds.has(id)&&(!info?.title||!info?.image||!info?.createdAt);
    });
    for(let index=0;index<missing.length;index+=WORKSPACE_BATCH_SIZE) {
      const chunk=missing.slice(index,index+WORKSPACE_BATCH_SIZE);
      workspaceFetchSongBatch(chunk).catch(()=>{});
    }
  }

  async function workspaceEnsureSong(id, forceDetails=false) {
    id=lnNorm(id);
    if(!id)return null;
    let info=lnSongInfo.get(id);
    if(!forceDetails&&info?.title&&info?.image&&info?.createdAt)return info;

    if(forceDetails)workspaceState.requestedSongIds.delete(id);
    try { await workspaceFetchSongBatch([id]); } catch(error) {}
    info=lnSongInfo.get(id);
    if(info?.title&&info?.image&&info?.createdAt)return info;

    try {
      await workspaceFetchJson(`${STUDIO_API_BASE}/api/clip/${id}`,{
        allowOrder:false,followPages:false,max:20000
      });
    } catch(error) {}
    return lnSongInfo.get(id)||null;
  }

  async function workspaceEnsureAttribution(id) {
    id=lnNorm(id);
    if(!id)return;
    try {
      const payload=await workspaceFetchJson(`${STUDIO_API_BASE}/api/clips/${id}/attribution`,{
        allowOrder:false,followPages:false,max:30000,authenticated:true
      });
      if(payload)workspaceIndexAttributionPayload(id,payload);
    } catch(error) {}
  }

  async function workspaceWarmAncestry(startId, maxDepth=7, maxSongs=55) {
    startId=lnNorm(startId);
    if(!startId)return;
    let frontier=[startId];
    const visited=new Set();

    for(let depth=0;depth<=maxDepth&&frontier.length&&visited.size<maxSongs;depth++) {
      const batch=[];
      for(const id of frontier) {
        if(!id||visited.has(id)||visited.size+batch.length>=maxSongs)continue;
        visited.add(id);
        batch.push(id);
      }
      if(!batch.length)break;

      await Promise.all(batch.flatMap(id=>{
        const sources=lnSources.get(id)||[];
        const missingExtendTime=sources.some(source=>
          (source.kind==='extend'||source.kind==='continue')&&lnContinueAt(source.continueAt)===null
        );
        const forceDetails=missingExtendTime&&!relationDetailsRefreshed.has(id);
        if(forceDetails)relationDetailsRefreshed.add(id);
        return [
          workspaceEnsureSong(id,forceDetails).catch(()=>null),
          workspaceEnsureAttribution(id).catch(()=>null)
        ];
      }));

      const next=[];
      for(const id of batch) {
        for(const source of lnSources.get(id)||[]) {
          if(!visited.has(source.id)&&!next.includes(source.id))next.push(source.id);
        }
      }
      frontier=next;
    }
  }

  async function workspaceBuildIndex() {
    const id=workspaceEnsureCurrent();
    if(!id)return;
    const generation=workspaceState.indexGeneration;
    workspaceInstallFetchCapture();
    workspaceIndexVisibleRows();
    workspaceScheduleReactScan();

    for(const url of workspaceCandidateUrls()) {
      if(generation!==workspaceState.indexGeneration)return;
      try { await workspaceFetchJson(url,{allowOrder:true,followPages:true,max:120000}); }
      catch(error) {}
    }
    if(generation!==workspaceState.indexGeneration)return;
    workspaceScheduleSongDetails();
    workspaceScheduleFeedPreload();
  }

  function workspaceKickIndexing() {
    const id=workspaceEnsureCurrent();
    if(!id)return;
    const now=Date.now();
    if(now-workspaceState.lastKick<1200)return;
    workspaceState.lastKick=now;
    if(!workspaceState.indexingPromise) {
      workspaceState.indexingPromise=workspaceBuildIndex().finally(()=> {
        workspaceState.indexingPromise=null;
        });
    }
  }

  function workspaceCleanupLegacyColours() {
    for(const row of $('[data-suno-lineage-color], [data-suno-lineage-root], [data-suno-lineage-parent], [data-suno-lineage-known]')) {
      row.removeAttribute('data-suno-lineage-color');
      row.removeAttribute('data-suno-lineage-root');
      row.removeAttribute('data-suno-lineage-parent');
      row.removeAttribute('data-suno-lineage-known');
      row.style.removeProperty('background');
      row.style.removeProperty('background-color');
      row.style.removeProperty('box-shadow');
      row.style.removeProperty('border-radius');
    }
  }

  function workspaceRefresh() {
    workspaceCleanupLegacyColours();
    const id=workspaceEnsureCurrent();
    if(!id)return;
    const now=Date.now();
    if(now-workspaceState.lastVisibleScan>450)workspaceIndexVisibleRows();
    if(now-workspaceState.lastReactScan>4500)workspaceScheduleReactScan();
    if(now-lnLastDetail>350) {
      lnLastDetail=now;
      lnScanDetail();
    }
    workspaceKickIndexing();
  }

  // ---------------------------------------------------------------------------
  // Compact multi-branch ancestry overlay for Create rows
  // ---------------------------------------------------------------------------
  // The same ancestor may appear in multiple branches when sources converge. Only
  // cycles within the current branch are stopped. Entries are rendered from the
  // workspace index, so covers and navigation do not depend on a row being mounted.
  const ANCESTRY_OVERLAY_ID='suno-create-ancestry-overlay';
  const ANCESTRY_HANDLER_KEY='__sunoCreateAncestryOverlayHandlers';
  const ANCESTRY_OPEN_DELAY=340;
  const ANCESTRY_CLOSE_DELAY=650;
  const ANCESTRY_MAX_DEPTH=10;
  const ANCESTRY_MAX_ENTRIES=100;
  const ANCESTRY_POINTER_OFFSET=14;
  function lnRawSources(id) {
    id=lnNorm(id);
    return (lnSources.get(id)||[]).filter(source=>source?.id&&source.id!==id);
  }

  function lnSourceReaches(startId, targetId, maxDepth=14) {
    startId=lnNorm(startId);
    targetId=lnNorm(targetId);
    if(!startId||!targetId)return false;
    const queue=[{id:startId,depth:0}];
    const visited=new Set();
    while(queue.length) {
      const current=queue.shift();
      if(!current||visited.has(current.id)||current.depth>maxDepth)continue;
      visited.add(current.id);
      for(const source of lnRawSources(current.id)) {
        if(source.id===targetId)return true;
        if(!visited.has(source.id))queue.push({id:source.id,depth:current.depth+1});
      }
    }
    return false;
  }

  function lnKnownSources(id) {
    const direct=lnRawSources(id);
    if(direct.length<2)return direct;

    // Suno's "Get Whole Song" / concat metadata often names both the latest
    // extension and the original song as direct inputs. When one candidate is
    // already reachable through another direct candidate, it is transitive rather
    // than an independent branch and is hidden from the direct-parent level.
    return direct.filter(candidate=>!direct.some(other=>
      other.id!==candidate.id&&lnSourceReaches(other.id,candidate.id)
    ));
  }

  function lnShortId(id) {
    id=String(id||'');
    return id.length>13?`${id.slice(0,8)}…${id.slice(-4)}`:id;
  }

  function lnFormatRelationTime(seconds) {
    seconds=lnContinueAt(seconds);
    if(seconds===null)return '';
    const total=Math.max(0,Math.round(seconds));
    const hours=Math.floor(total/3600);
    const minutes=Math.floor((total%3600)/60);
    const remainder=total%60;
    return hours>0?`${hours}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`:
      `${minutes}:${String(remainder).padStart(2,'0')}`;
  }

  function lnDisplayKind(kind) {
    const labels={
      cover:'Cover',remix:'Remix',sample:'Sample',chop_sample:'Chop sample',
      source:'Source',reference:'Reference',extend:'Extended from',continue:'Extended from',
      section:'Section edit',infill:'Section edit',stitch:'Stitched from',concat:'Stitched from',
      underpainting:'Underpainting',overpainting:'Overpainting',stem_from:'Stem source',
      stemmed:'Stem source',speed:'Speed edit',remaster:'Remaster',upsample:'Remaster',
      old_editor:'Old editor source',edit:'Edited from',edited:'Edited from',history:'History',input:'Input',root:'Root',
      derived:'Derived from'
    };
    const key=String(kind||'derived').toLowerCase();
    return labels[key]||key.replace(/_/g,' ').replace(/\b\w/g,character=>character.toUpperCase());
  }

  function lnVisibleRow(id) {
    id=lnNorm(id);
    if(!id)return null;
    for(const row of $('[data-testid="clip-row"]'))if(lnRowId(row)===id)return row;
    return null;
  }

  function lnBuildAncestry(startId) {
    const entries=[];
    const firstEntryBySong=new Map();
    let truncated=false;
    const walk=(childId,depth,path)=> {
      if(depth>ANCESTRY_MAX_DEPTH)return;
      for(const source of lnKnownSources(childId)) {
        if(entries.length>=ANCESTRY_MAX_ENTRIES) {
          truncated=true;
          return;
        }
        const cycle=path.has(source.id);
        const duplicateOf=firstEntryBySong.has(source.id)?firstEntryBySong.get(source.id):null;
        const entryIndex=entries.length;
        entries.push({
          id:source.id,
          kind:source.kind||'derived',
          continueAt:lnContinueAt(source.continueAt),
          depth,
          cycle,
          duplicateOf,
          info:lnSongInfo.get(source.id)||{}
        });
        if(duplicateOf===null)firstEntryBySong.set(source.id,entryIndex);

        // A song already rendered higher in the list is represented only by a compact
        // reference row. Its ancestry was already expanded at the first occurrence.
        if(!cycle&&duplicateOf===null)walk(source.id,depth+1,new Set([...path,source.id]));
        if(truncated)return;
      }
    };
    startId=lnNorm(startId);
    walk(startId,1,new Set([startId]));
    const duplicateReferences=entries.filter(entry=>entry.duplicateOf!==null).length;
    return {entries,truncated,uniqueSongs:firstEntryBySong.size,duplicateReferences};
  }

  function lnCreateAncestryArrowLayer(list,token) {
    const namespace='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(namespace,'svg');
    svg.classList.add('suno-ancestry-links');
    svg.setAttribute('aria-hidden','true');
    const markerId=`suno-ancestry-arrow-${token}`;
    svg.dataset.markerId=markerId;

    const defs=document.createElementNS(namespace,'defs');
    const marker=document.createElementNS(namespace,'marker');
    marker.id=markerId;
    marker.setAttribute('viewBox','0 0 8 8');
    marker.setAttribute('refX','6.5');
    marker.setAttribute('refY','4');
    marker.setAttribute('markerWidth','6');
    marker.setAttribute('markerHeight','6');
    marker.setAttribute('orient','auto-start-reverse');
    const arrow=document.createElementNS(namespace,'path');
    arrow.setAttribute('d','M 0 0 L 8 4 L 0 8 z');
    arrow.setAttribute('fill','rgba(255,218,76,.92)');
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svg.appendChild(defs);
    list.appendChild(svg);
    return svg;
  }

  function lnBracketArrowPath(startX,startY,laneX,targetY,targetX,radius=5) {
    const direction=targetY<startY?-1:1;
    const verticalDistance=Math.abs(targetY-startY);
    const horizontalOut=Math.max(0,laneX-startX);
    const horizontalIn=Math.max(0,laneX-targetX);
    const corner=Math.max(0,Math.min(radius,verticalDistance/2,horizontalOut,horizontalIn));
    if(corner<.5)return `M ${startX.toFixed(1)} ${startY.toFixed(1)} H ${laneX.toFixed(1)} V ${targetY.toFixed(1)} H ${targetX.toFixed(1)}`;
    const beforeFirst=laneX-corner;
    const afterFirstY=startY+direction*corner;
    const beforeSecondY=targetY-direction*corner;
    const afterSecond=laneX-corner;
    return [
      `M ${startX.toFixed(1)} ${startY.toFixed(1)}`,
      `H ${beforeFirst.toFixed(1)}`,
      `Q ${laneX.toFixed(1)} ${startY.toFixed(1)} ${laneX.toFixed(1)} ${afterFirstY.toFixed(1)}`,
      `V ${beforeSecondY.toFixed(1)}`,
      `Q ${laneX.toFixed(1)} ${targetY.toFixed(1)} ${afterSecond.toFixed(1)} ${targetY.toFixed(1)}`,
      `H ${targetX.toFixed(1)}`
    ].join(' ');
  }

  function lnDrawAncestryDuplicateArrows(panel) {
    const list=panel?.querySelector('.suno-ancestry-list');
    const svg=list?.querySelector(':scope > .suno-ancestry-links');
    if(!list||!svg)return {arrows:0,targets:0,mergedConnectors:0,junctions:0,lanes:0,gutter:0};
    svg.querySelectorAll('.suno-ancestry-link,.suno-ancestry-junction').forEach(element=>element.remove());

    const references=[...list.querySelectorAll('.suno-ancestry-entry[data-duplicate-of]')];
    if(!references.length) {
      list.style.setProperty('--suno-ancestry-arrow-gutter','calc(18px * var(--suno-ancestry-scale))','important');
      return {arrows:0,targets:0,mergedConnectors:0,junctions:0,lanes:0,gutter:18};
    }

    const preliminaryTargets=new Set(references.map(reference=>reference.dataset.duplicateOf).filter(value=>value!==undefined));
    const logicalGutter=Math.min(132,22+preliminaryTargets.size*13+Math.min(24,Math.max(0,references.length-preliminaryTargets.size)*3));
    list.style.setProperty('--suno-ancestry-arrow-gutter',`calc(${logicalGutter}px * var(--suno-ancestry-scale))`,'important');

    // Reserve the arrow gutter before measuring. This ensures the relation badges have
    // already moved to their final x positions when the SVG geometry is calculated.
    const listRect=list.getBoundingClientRect();
    const scale=Math.max(.66,Math.min(1,Number.parseFloat(getComputedStyle(panel).getPropertyValue('--suno-ancestry-scale'))||1));
    const markerId=svg.dataset.markerId;
    const links=[];

    for(const reference of references) {
      const target=list.querySelector(`.suno-ancestry-entry[data-entry-index="${reference.dataset.duplicateOf}"]`);
      if(!target)continue;
      const relationAnchor=reference.querySelector('.suno-ancestry-kind')||reference.querySelector('.suno-ancestry-kind-block')||reference;
      const targetRelationAnchor=target.querySelector('.suno-ancestry-kind')||target.querySelector('.suno-ancestry-kind-block')||target;
      const relationRect=relationAnchor.getBoundingClientRect();
      const targetRect=targetRelationAnchor.getBoundingClientRect();
      const referenceRect=reference.getBoundingClientRect();
      const targetEntryRect=target.getBoundingClientRect();
      links.push({
        reference,target,
        fromIndex:Number(reference.dataset.entryIndex)||0,
        toIndex:Number(reference.dataset.duplicateOf)||0,
        startX:relationRect.right-listRect.left+4*scale,
        startY:relationRect.top-listRect.top+relationRect.height/2,
        targetX:targetRect.right-listRect.left+3*scale,
        targetY:targetRect.top-listRect.top+targetRect.height/2,
        entryRight:referenceRect.right-listRect.left,
        distance:Math.max(1,(Number(reference.dataset.entryIndex)||0)-(Number(reference.dataset.duplicateOf)||0)),
        pixelDistance:Math.abs((referenceRect.top+referenceRect.height/2)-(targetEntryRect.top+targetEntryRect.height/2))
      });
    }

    // All later occurrences that point to the same first occurrence share one vertical trunk.
    // The farthest occurrence supplies the full bracket and arrowhead. Nearer occurrences end
    // at that trunk with a hollow junction circle, so only one line continues to the target song.
    const groupedByTarget=new Map();
    for(const link of links) {
      if(!groupedByTarget.has(link.toIndex))groupedByTarget.set(link.toIndex,[]);
      groupedByTarget.get(link.toIndex).push(link);
    }
    const groups=[...groupedByTarget.entries()].map(([toIndex,groupLinks])=> {
      groupLinks.sort((a,b)=>b.distance-a.distance||b.pixelDistance-a.pixelDistance||b.fromIndex-a.fromIndex);
      return {
        toIndex,
        links:groupLinks,
        main:groupLinks[0],
        maxDistance:Math.max(...groupLinks.map(link=>link.distance)),
        maxPixelDistance:Math.max(...groupLinks.map(link=>link.pixelDistance)),
        entryRight:Math.max(...groupLinks.map(link=>link.entryRight))
      };
    });

    // Short target groups use inner tracks; longer shared trunks are placed farther right.
    groups.sort((a,b)=>a.maxDistance-b.maxDistance||a.maxPixelDistance-b.maxPixelDistance||a.toIndex-b.toIndex);
    const width=Math.max(1,list.scrollWidth);
    const height=Math.max(1,list.scrollHeight);
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    svg.setAttribute('width',String(width));
    svg.setAttribute('height',String(height));

    const firstEntryRight=Math.max(...groups.map(group=>group.entryRight));
    const innerLane=firstEntryRight+7*scale;
    const outerLane=Math.max(innerLane,listRect.width-7*scale);
    const laneGap=groups.length>1?(outerLane-innerLane)/(groups.length-1):0;
    const namespace='http://www.w3.org/2000/svg';
    let mergedConnectors=0;
    let junctions=0;

    groups.forEach((group,laneIndex)=> {
      const laneX=innerLane+laneGap*laneIndex;
      const main=group.main;

      const trunk=document.createElementNS(namespace,'path');
      trunk.classList.add('suno-ancestry-link','suno-ancestry-main-link');
      trunk.dataset.fromIndex=String(main.fromIndex);
      trunk.dataset.toIndex=String(main.toIndex);
      trunk.dataset.lane=String(laneIndex);
      trunk.dataset.jump=String(main.distance);
      trunk.dataset.mergedCount=String(group.links.length);
      trunk.setAttribute('d',lnBracketArrowPath(main.startX,main.startY,laneX,main.targetY,main.targetX,5*scale));
      if(markerId)trunk.setAttribute('marker-end',`url(#${markerId})`);
      svg.appendChild(trunk);

      for(const link of group.links.slice(1)) {
        const connector=document.createElementNS(namespace,'path');
        connector.classList.add('suno-ancestry-link','suno-ancestry-merge-link');
        connector.dataset.fromIndex=String(link.fromIndex);
        connector.dataset.toIndex=String(link.toIndex);
        connector.dataset.lane=String(laneIndex);
        connector.dataset.jump=String(link.distance);
        connector.setAttribute('d',`M ${link.startX.toFixed(1)} ${link.startY.toFixed(1)} H ${laneX.toFixed(1)}`);
        svg.appendChild(connector);
        mergedConnectors++;

        const circle=document.createElementNS(namespace,'circle');
        circle.classList.add('suno-ancestry-junction');
        circle.dataset.fromIndex=String(link.fromIndex);
        circle.dataset.toIndex=String(link.toIndex);
        circle.setAttribute('cx',laneX.toFixed(1));
        circle.setAttribute('cy',link.startY.toFixed(1));
        circle.setAttribute('r',String(3.5*scale));
        svg.appendChild(circle);
        junctions++;
      }
    });

    return {
      arrows:groups.length+mergedConnectors,
      targets:groups.length,
      mainArrows:groups.length,
      mergedConnectors,
      junctions,
      lanes:groups.length,
      gutter:logicalGutter
    };
  }

  function workspaceScrollContainer() {
    const row=document.querySelector('[data-testid="clip-row"]');
    let node=row?.parentElement;
    let fallback=null;
    while(node&&node!==document.body) {
      const style=getComputedStyle(node);
      const canScroll=/(auto|scroll)/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+40;
      if(canScroll) {
        fallback=node;
        if(node.clientHeight>240)return node;
      }
      node=node.parentElement;
    }
    return fallback||document.scrollingElement||document.documentElement;
  }

  function workspaceMedian(values) {
    values=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!values.length)return NaN;
    const middle=Math.floor(values.length/2);
    return values.length%2?values[middle]:(values[middle-1]+values[middle])/2;
  }

  function workspaceChronologyPosition(id) {
    id=lnNorm(id);
    if(!id)return null;
    const targetInfo=lnSongInfo.get(id)||{};
    if(!targetInfo.createdAt)return null;

    const candidateIds=new Set([
      ...workspaceState.memberSet,
      ...workspaceState.domSet,
      ...workspaceState.networkSet,
      ...workspaceState.reactSet,
      id
    ]);
    const candidates=[...candidateIds].map(songId=>({
      id:songId,
      createdAt:Number(lnSongInfo.get(songId)?.createdAt||0),
      observed:workspaceState.positionMap.get(songId)||null
    })).filter(item=>item.createdAt>0);
    if(candidates.length<4)return null;

    // Determine whether the current workspace is newest-first or oldest-first from
    // real measured rows. This avoids assuming that every Suno workspace uses the
    // same sort direction.
    const observedByTop=candidates.filter(item=>item.observed).sort((a,b)=>a.observed.top-b.observed.top);
    let directionScore=0;
    for(let index=1;index<observedByTop.length;index++) {
      const delta=observedByTop[index].createdAt-observedByTop[index-1].createdAt;
      if(delta>0)directionScore++;
      else if(delta<0)directionScore--;
    }
    const oldestFirst=directionScore>0;

    candidates.sort((a,b)=> {
      const timeDelta=oldestFirst?a.createdAt-b.createdAt:b.createdAt-a.createdAt;
      if(timeDelta)return timeDelta;
      const aTop=a.observed?.top;
      const bTop=b.observed?.top;
      if(Number.isFinite(aTop)&&Number.isFinite(bTop))return aTop-bTop;
      if(Number.isFinite(aTop))return -1;
      if(Number.isFinite(bTop))return 1;
      return a.id.localeCompare(b.id);
    });

    const targetIndex=candidates.findIndex(item=>item.id===id);
    if(targetIndex<0)return null;
    const anchors=candidates.map((item,index)=>item.observed?{index,top:item.observed.top}:null).filter(Boolean);
    if(!anchors.length)return null;

    const slopes=[];
    for(let left=0;left<anchors.length;left++)for(let right=left+1;right<anchors.length;right++) {
      const indexDelta=anchors[right].index-anchors[left].index;
      const topDelta=anchors[right].top-anchors[left].top;
      const slope=indexDelta?topDelta/indexDelta:0;
      if(slope>35&&slope<260)slopes.push(slope);
    }
    let step=workspaceMedian(slopes);
    if(!Number.isFinite(step))step=Number(workspaceState.rowStep||111);
    if(!Number.isFinite(step)||step<35||step>260)return null;

    const intercept=workspaceMedian(anchors.map(anchor=>anchor.top-anchor.index*step));
    if(!Number.isFinite(intercept))return null;
    const errors=anchors.map(anchor=>Math.abs(anchor.top-(intercept+anchor.index*step)));
    const medianError=workspaceMedian(errors);
    const maxError=Math.max(...errors,0);

    // Creation timestamps are allowed a small amount of uncertainty because Suno
    // often creates paired generations within the same millisecond. Large errors,
    // however, mean the current Create view is not sorted chronologically.
    if(anchors.length>=3&&medianError>step*0.8)return null;
    if(anchors.length>=5&&maxError>step*2.4)return null;

    return {
      top:intercept+targetIndex*step,
      source:'created-at',
      anchors:anchors.length,
      error:medianError,
      maxError,
      step,
      targetIndex,
      sequenceLength:candidates.length,
      oldestFirst
    };
  }

  function workspaceSequencePosition(id) {
    id=lnNorm(id);
    if(!id)return null;
    const exact=workspaceState.positionMap.get(id);
    if(exact)return {top:exact.top,source:'observed',anchors:1,error:0};

    const chronology=workspaceChronologyPosition(id);
    let best=chronology?{...chronology,score:chronology.anchors*1200-chronology.error}:null;
    for(const sequence of workspaceState.sequences) {
      const originalIndex=sequence.ids.indexOf(id);
      if(originalIndex<0)continue;
      for(const reversed of [false,true]) {
        const ids=reversed?[...sequence.ids].reverse():sequence.ids;
        const targetIndex=ids.indexOf(id);
        const anchors=[];
        ids.forEach((songId,index)=> {
          const position=workspaceState.positionMap.get(songId);
          if(position)anchors.push({index,top:position.top});
        });
        if(anchors.length<2)continue;

        const slopes=[];
        for(let left=0;left<anchors.length;left++)for(let right=left+1;right<anchors.length;right++) {
          const indexDelta=anchors[right].index-anchors[left].index;
          const topDelta=anchors[right].top-anchors[left].top;
          if(indexDelta&&topDelta/indexDelta>35&&topDelta/indexDelta<260)slopes.push(topDelta/indexDelta);
        }
        const step=workspaceMedian(slopes);
        if(!Number.isFinite(step))continue;
        const intercept=workspaceMedian(anchors.map(anchor=>anchor.top-anchor.index*step));
        const errors=anchors.map(anchor=>Math.abs(anchor.top-(intercept+anchor.index*step)));
        const error=Math.max(...errors,0);
        if(error>Math.max(30,step*0.55))continue;

        const candidate={
          top:intercept+targetIndex*step,
          source:`${sequence.source}-sequence`,
          anchors:anchors.length,
          error,
          step,
          reversed,
          sequenceLength:ids.length,
          context:sequence.context,
          path:sequence.path
        };
        const score=anchors.length*1000-error-(Math.abs(step-(workspaceState.rowStep||step))*2);
        if(!best||score>best.score)best={...candidate,score};
      }
    }
    return best;
  }

  function workspaceSetScrollAnchoring(container,disabled) {
    if(!container)return ()=>{};
    const value=container.style.getPropertyValue('overflow-anchor');
    const priority=container.style.getPropertyPriority('overflow-anchor');
    if(disabled)container.style.setProperty('overflow-anchor','none','important');
    return ()=> {
      if(value)container.style.setProperty('overflow-anchor',value,priority);
      else container.style.removeProperty('overflow-anchor');
    };
  }

  async function workspaceRevealRow(row, container=workspaceScrollContainer()) {
    if(!row||!container)return row;
    const rect=row.getBoundingClientRect();
    const box=container.getBoundingClientRect();
    const margin=36;
    let movement=0;
    if(rect.top<box.top+margin)movement=rect.top-(box.top+margin);
    else if(rect.bottom>box.bottom-margin)movement=rect.bottom-(box.bottom-margin);
    if(Math.abs(movement)>2) {
      const restoreAnchor=workspaceSetScrollAnchoring(container,true);
      container.scrollTo({top:Math.max(0,container.scrollTop+movement),behavior:'auto'});
      await new Promise(resolve=>window.setTimeout(resolve,120));
      restoreAnchor();
    }
    return row;
  }

  function workspaceHighlightRow(row) {
    if(!row)return null;
    row.classList.remove('suno-ancestry-jump-highlight');
    void row.offsetWidth;
    row.classList.add('suno-ancestry-jump-highlight');
    window.setTimeout(()=>row.classList.remove('suno-ancestry-jump-highlight'),1500);
    return row;
  }

  const SELECTED_SONG_HANDLER_KEY='__sunoSelectedSongTint';
  let selectedSongId='';

  function workspaceRowSongId(row) {
    if(!row)return '';
    const titleLink=[...row.querySelectorAll('a[href^="/song/"]')].find(anchor=>
      Boolean(anchor.closest('[class*="clip-title-wrapper"]'))&&lnLinkId(anchor)
    );
    return lnLinkId(titleLink);
  }

  function workspaceApplySelectedSongTint() {
    for(const row of $('[data-testid="clip-row"]')) {
      row.classList.toggle('suno-current-selected-song',Boolean(selectedSongId)&&workspaceRowSongId(row)===selectedSongId);
    }
  }

  function workspaceMarkSelectedSong(id) {
    id=lnNorm(id);
    if(!id)return;
    selectedSongId=id;
    workspaceApplySelectedSongTint();
  }

  function installSelectedSongTint() {
    clearControllers(SELECTED_SONG_HANDLER_KEY,/^__sunoSelectedSongTintV\d+$/,controller=> {
      if(controller?.onClick)document.removeEventListener('click',controller.onClick,true);
    });

    const onClick=event=> {
      const row=event.target.closest?.('[data-testid="clip-row"]');
      if(!row)return;

      // Ignore controls that do not select the song. Play/Pause and the title area
      // do select it, while edit/like/remix/menu actions should leave the tint alone.
      const control=event.target.closest?.('button,a,[role="button"],input,select,textarea');
      if(control) {
        const label=String(control.getAttribute?.('aria-label')||'');
        const isPlayback=/^(play|pause|playing)(\s|$)/i.test(label);
        const isTitle=control.matches?.('a[href^="/song/"]')&&Boolean(control.closest('[class*="clip-title-wrapper"]'));
        if(!isPlayback&&!isTitle)return;
      }

      const id=workspaceRowSongId(row);
      if(id)window.setTimeout(()=>workspaceMarkSelectedSong(id),0);
    };

    document.addEventListener('click',onClick,true);
    window[SELECTED_SONG_HANDLER_KEY]={onClick};
    workspaceApplySelectedSongTint();
  }

  function workspaceSelectRow(row,id) {
    id=lnNorm(id);
    if(!row||!id)return false;

    const titleLink=[...row.querySelectorAll('a[href^="/song/"]')].find(anchor=>
      lnLinkId(anchor)===id&&Boolean(anchor.closest('[class*="clip-title-wrapper"]'))
    );
    const titleWrapper=titleLink?.closest('[class*="clip-title-wrapper"]')||
      row.querySelector('[class*="clip-title-wrapper"]');
    const target=titleWrapper||row;

    try {
      target.dispatchEvent(new MouseEvent('click',{
        bubbles:true,cancelable:true,view:window,button:0,buttons:0
      }));
      row.dataset.sunoAncestrySelected=String(Date.now());
      workspaceMarkSelectedSong(id);
      window.setTimeout(()=>delete row.dataset.sunoAncestrySelected,1200);
      return true;
    } catch(error) {
      return false;
    }
  }

  async function workspaceWaitForRow(id, timeout=1500) {
    const start=Date.now();
    while(Date.now()-start<timeout) {
      const row=lnVisibleRow(id);
      if(row)return row;
      workspaceIndexVisibleRows();
      await new Promise(resolve=>window.setTimeout(resolve,100));
    }
    return null;
  }

  async function workspaceWaitForCatalogueSong(id, timeout=10000) {
    id=lnNorm(id);
    if(!id)return false;
    const start=Date.now();
    while(Date.now()-start<timeout) {
      const info=lnSongInfo.get(id)||{};
      if(workspaceHasSong(id)&&info.createdAt)return true;
      workspaceScheduleFeedPreload();
      const pending=workspaceState.feedPreloadPromise;
      if(pending)await Promise.race([pending,new Promise(resolve=>window.setTimeout(resolve,220))]);
      else await new Promise(resolve=>window.setTimeout(resolve,220));
      if(workspaceState.feedPreloadDone)break;
    }
    return workspaceHasSong(id);
  }

  async function workspaceJumpToSong(id) {
    id=lnNorm(id);
    if(!id)return null;
    let row=lnVisibleRow(id);
    const container=workspaceScrollContainer();
    if(row) {
      await workspaceRevealRow(row,container);
      return workspaceHighlightRow(row);
    }

    await workspaceBuildIndex().catch(()=>{});
    if(!workspaceHasSong(id)||!lnSongInfo.get(id)?.createdAt) {
      await workspaceWaitForCatalogueSong(id,10000);
    }
    workspaceIndexVisibleRows();
    const position=workspaceSequencePosition(id);
    if(!position||!Number.isFinite(position.top))return null;

    const before=container.scrollTop;
    const maximum=Math.max(0,container.scrollHeight-container.clientHeight);
    const proposed=Math.max(0,Math.min(maximum,position.top-container.clientHeight*0.34));
    const restoreAnchor=workspaceSetScrollAnchoring(container,true);
    container.scrollTo({top:proposed,behavior:'auto'});
    row=await workspaceWaitForRow(id,1350);

    if(!row) {
      // A direct virtual-position jump must never turn into a list traversal. If
      // Suno cannot mount the target from its existing cache, restore the user's
      // previous position and leave the workspace contents untouched.
      container.scrollTo({top:before,behavior:'auto'});
      await new Promise(resolve=>window.setTimeout(resolve,100));
      restoreAnchor();
      return null;
    }

    await workspaceRevealRow(row,container);
    restoreAnchor();
    workspaceIndexVisibleRows();
    return workspaceHighlightRow(row);
  }

  function installAncestryOverlay() {
    const previous=window[ANCESTRY_HANDLER_KEY];
    if(previous) {
      document.removeEventListener('pointerover',previous.onPointerOver,true);
      document.removeEventListener('pointerout',previous.onPointerOut,true);
      document.removeEventListener('pointermove',previous.onPointerMove,true);
      document.removeEventListener('pointerdown',previous.onPointerDown,true);
      document.removeEventListener('keydown',previous.onKeyDown,true);
      window.removeEventListener('scroll',previous.onViewportChange,true);
      window.removeEventListener('resize',previous.onViewportChange,true);
      previous.destroy?.();
    }
    document.getElementById(ANCESTRY_OVERLAY_ID)?.remove();

    let overlay=null;
    let activeRow=null;
    let openTimer=0;
    let closeTimer=0;
    let showToken=0;
    let pointerAnchor={x:Math.round(window.innerWidth/2),y:Math.round(window.innerHeight/2)};

    const clearOpen=()=> {
      if(openTimer)clearTimeout(openTimer);
      openTimer=0;
    };
    const clearClose=()=> {
      if(closeTimer)clearTimeout(closeTimer);
      closeTimer=0;
    };
    const hide=()=> {
      showToken++;
      clearOpen();
      clearClose();
      overlay?.remove();
      overlay=null;
      activeRow=null;
    };
    const scheduleClose=()=> {
      clearClose();
      closeTimer=window.setTimeout(hide,ANCESTRY_CLOSE_DELAY);
    };
    const ANCESTRY_VIEWPORT_EDGE=8;
    const ANCESTRY_MIN_SCALE=.66;
    let positionFrame=0;

    const setPanelScale=(panel,scale)=> {
      const safe=Math.max(ANCESTRY_MIN_SCALE,Math.min(1,Number(scale)||1));
      panel.style.setProperty('--suno-ancestry-scale',safe.toFixed(4),'important');
      return safe;
    };

    const panelNaturalHeight=panel=> {
      // max-height is deliberately disabled while measuring. scrollHeight reflects the
      // scaled row, artwork and typography sizes defined through the CSS variable.
      panel.style.setProperty('max-height','none','important');
      panel.style.setProperty('overflow-y','hidden','important');
      return Math.ceil(Math.max(panel.scrollHeight,panel.getBoundingClientRect().height));
    };

    const fitPanelToViewport=(panel,availableHeight)=> {
      availableHeight=Math.max(80,Math.floor(availableHeight));
      setPanelScale(panel,1);
      let naturalHeight=panelNaturalHeight(panel);
      let scale=1;
      let scrolling=false;

      if(naturalHeight>availableHeight) {
        setPanelScale(panel,ANCESTRY_MIN_SCALE);
        const minimumHeight=panelNaturalHeight(panel);

        if(minimumHeight<=availableHeight) {
          // Find the largest scale that still fits, so text is never made smaller
          // than necessary. Seven passes are more precise than a visible CSS pixel.
          let low=ANCESTRY_MIN_SCALE;
          let high=1;
          for(let pass=0;pass<7;pass++) {
            const middle=(low+high)/2;
            setPanelScale(panel,middle);
            const height=panelNaturalHeight(panel);
            if(height<=availableHeight)low=middle;
            else high=middle;
          }
          scale=setPanelScale(panel,low);
          naturalHeight=panelNaturalHeight(panel);
        } else {
          // Even the allowed 66% density does not fit. Only now permit scrolling.
          scale=setPanelScale(panel,ANCESTRY_MIN_SCALE);
          naturalHeight=panelNaturalHeight(panel);
          scrolling=true;
          panel.style.setProperty('max-height',`${availableHeight}px`,'important');
          panel.style.setProperty('overflow-y','auto','important');
          panel.style.setProperty('scrollbar-gutter','stable','important');
        }
      }

      if(!scrolling) {
        panel.style.setProperty('max-height','none','important');
        panel.style.setProperty('overflow-y','hidden','important');
        panel.style.setProperty('scrollbar-gutter','auto','important');
      }
      panel.dataset.ancestryScale=scale.toFixed(3);
      panel.dataset.ancestryScrolling=String(scrolling);
      return {scale,scrolling,naturalHeight,availableHeight};
    };

    const position=panel=> {
      if(positionFrame)cancelAnimationFrame(positionFrame);
      const width=Math.max(320,Math.min(590,window.innerWidth-20));
      const x=Math.max(0,Math.min(window.innerWidth,pointerAnchor.x||0));
      const y=Math.max(0,Math.min(window.innerHeight,pointerAnchor.y||0));
      let left=x+ANCESTRY_POINTER_OFFSET;
      let top=y+ANCESTRY_POINTER_OFFSET;

      setPanelScale(panel,1);
      panel.style.setProperty('max-height','none','important');
      panel.style.setProperty('overflow-y','hidden','important');
      panel.style.setProperty('width',`${Math.round(width)}px`,'important');
      panel.style.setProperty('left',`${Math.round(Math.max(ANCESTRY_VIEWPORT_EDGE,Math.min(left,window.innerWidth-width-ANCESTRY_VIEWPORT_EDGE)))}px`,'important');
      panel.style.setProperty('top',`${Math.round(Math.max(ANCESTRY_VIEWPORT_EDGE,top))}px`,'important');

      positionFrame=requestAnimationFrame(()=> {
        positionFrame=0;
        if(!panel.isConnected)return;

        // Preserve the accepted pointer-relative placement. If the uncompressed panel
        // does not fit below the pointer, place it above; if it is taller than either
        // region, start at the viewport edge so it may use nearly the full screen.
        let rect=panel.getBoundingClientRect();
        if(rect.right>window.innerWidth-ANCESTRY_VIEWPORT_EDGE)left=x-rect.width-ANCESTRY_POINTER_OFFSET;
        if(rect.bottom>window.innerHeight-ANCESTRY_VIEWPORT_EDGE)top=y-rect.height-ANCESTRY_POINTER_OFFSET;
        top=Math.max(ANCESTRY_VIEWPORT_EDGE,top);
        left=Math.max(ANCESTRY_VIEWPORT_EDGE,Math.min(left,window.innerWidth-rect.width-ANCESTRY_VIEWPORT_EDGE));
        panel.style.setProperty('left',`${Math.round(left)}px`,'important');
        panel.style.setProperty('top',`${Math.round(top)}px`,'important');

        const availableHeight=window.innerHeight-top-ANCESTRY_VIEWPORT_EDGE;
        fitPanelToViewport(panel,availableHeight);
        rect=panel.getBoundingClientRect();
        panel.style.setProperty('left',`${Math.round(Math.max(ANCESTRY_VIEWPORT_EDGE,Math.min(left,window.innerWidth-rect.width-ANCESTRY_VIEWPORT_EDGE)))}px`,'important');

        lnDrawAncestryDuplicateArrows(panel);
      });
    };


    const createShell=(row,statusText='Loading ancestry…')=> {
      overlay?.remove();
      activeRow=row;
      overlay=document.createElement('div');
      overlay.id=ANCESTRY_OVERLAY_ID;
      overlay.setAttribute('role','dialog');
      overlay.setAttribute('aria-label','Known song ancestry');

      const header=document.createElement('div');
      header.className='suno-ancestry-header';
      const heading=document.createElement('span');
      heading.textContent='Ancestry';
      const count=document.createElement('span');
      count.textContent='';
      header.append(heading,count);

      const list=document.createElement('div');
      list.className='suno-ancestry-list';
      const status=document.createElement('div');
      status.className='suno-ancestry-status';
      status.textContent=statusText;
      list.appendChild(status);

      overlay.append(header,list);
      overlay.addEventListener('pointerenter',clearClose);
      overlay.addEventListener('pointerleave',scheduleClose);
      document.body.appendChild(overlay);
      position(overlay);
      return {header,count,list};
    };

    const renderTree=(row,tree,token)=> {
      if(token!==showToken||activeRow!==row||!overlay?.isConnected)return;
      const list=overlay.querySelector('.suno-ancestry-list');
      const count=overlay.querySelector('.suno-ancestry-header span:last-child');
      if(!list||!count)return;
      list.textContent='';
      const uniqueCount=Number.isFinite(tree.uniqueSongs)?tree.uniqueSongs:new Set(tree.entries.map(entry=>entry.id)).size;
      count.textContent=`${uniqueCount} source${uniqueCount===1?'':'s'}`;

      if(!tree.entries.length) {
        const status=document.createElement('div');
        status.className='suno-ancestry-status';
        status.textContent='No known sources were found for this song.';
        list.appendChild(status);
      }

      lnCreateAncestryArrowLayer(list,token);
      tree.entries.forEach((entry,entryIndex)=> {
        const inWorkspace=workspaceHasSong(entry.id);
        const canSearch=!entry.cycle;


        const item=document.createElement('button');
        item.type='button';
        item.className='suno-ancestry-entry';
        item.dataset.songId=entry.id;
        item.dataset.entryIndex=String(entryIndex);
        if(entry.duplicateOf!==null) {
          item.dataset.duplicateOf=String(entry.duplicateOf);
          item.classList.add('suno-ancestry-duplicate');
        }
        item.dataset.available=String(canSearch);
        item.dataset.workspaceState=inWorkspace?'confirmed':'unknown';
        item.style.setProperty('--suno-ancestry-depth',String(entry.depth));
        item.disabled=!canSearch;
        const locationTitle=inWorkspace?'Scroll to this song in the current Create workspace':
          'Search for this song in the current Create workspace';
        item.title=entry.duplicateOf!==null?`Already shown above · ${locationTitle}`:locationTitle;

        const image=String(entry.info?.image||'');
        let artwork;
        if(image) {
          artwork=document.createElement('img');
          artwork.className='suno-ancestry-art';
          artwork.alt='';
          artwork.loading='lazy';
          artwork.src=U(image);
        } else {
          artwork=document.createElement('span');
          artwork.className='suno-ancestry-art-placeholder';
          artwork.textContent='♪';
        }

        const copy=document.createElement('span');
        copy.className='suno-ancestry-copy';
        const title=document.createElement('span');
        title.className='suno-ancestry-title';
        title.textContent=String(entry.info?.title||'Unknown song');
        const shortId=document.createElement('span');
        shortId.className='suno-ancestry-id';
        shortId.textContent=entry.cycle?`${lnShortId(entry.id)} · cycle stopped`:lnShortId(entry.id);
        if(entry.cycle)shortId.classList.add('suno-ancestry-cycle');
        copy.append(title,shortId);

        const kindBlock=document.createElement('span');
        kindBlock.className='suno-ancestry-kind-block';
        const kind=document.createElement('span');
        kind.className='suno-ancestry-kind';
        kind.textContent=lnDisplayKind(entry.kind);
        kindBlock.appendChild(kind);
        const relationTime=lnFormatRelationTime(entry.continueAt);
        if((entry.kind==='extend'||entry.kind==='continue')&&relationTime) {
          const time=document.createElement('span');
          time.className='suno-ancestry-time';
          time.textContent=`at ${relationTime}`;
          time.title=`Extended from ${relationTime}`;
          kindBlock.appendChild(time);
        }
        item.append(artwork,copy,kindBlock);

        if(canSearch)item.addEventListener('click',async event=> {
          event.preventDefault();
          event.stopPropagation();
          const targetId=item.dataset.songId;
          hide();
          const targetRow=await workspaceJumpToSong(targetId);
          if(targetRow) {
            await new Promise(resolve=>window.setTimeout(resolve,180));
            workspaceSelectRow(targetRow,targetId);
          }
        });
        list.appendChild(item);
      });

      if(tree.truncated) {
        const more=document.createElement('div');
        more.className='suno-ancestry-more';
        more.textContent=`More than ${ANCESTRY_MAX_ENTRIES} known ancestry entries; remaining branches are hidden.`;
        list.appendChild(more);
      }
      position(overlay);
      requestAnimationFrame(()=>lnDrawAncestryDuplicateArrows(overlay));
    };

    const show=async row=> {
      clearOpen();
      clearClose();
      if(!row?.isConnected)return;
      const id=lnRowId(row);
      if(!id)return;
      const token=++showToken;
      lnRememberRow(row);
      lnScanRow(row);
      workspaceRefresh();
      createShell(row);

      const existingTree=lnBuildAncestry(id);
      if(existingTree.entries.length)renderTree(row,existingTree,token);

      workspaceWarmAncestry(id).then(()=> {
        if(token!==showToken||activeRow!==row||!row.isConnected)return;
        renderTree(row,lnBuildAncestry(id),token);
      }).catch(()=> {
        if(token!==showToken||activeRow!==row||!row.isConnected)return;
        renderTree(row,lnBuildAncestry(id),token);
      });
    };

    const scheduleOpen=(row,point)=> {
      if(point&&Number.isFinite(point.x)&&Number.isFinite(point.y))pointerAnchor={x:point.x,y:point.y};
      clearOpen();
      clearClose();
      if(activeRow&&activeRow!==row) {
        overlay?.remove();
        overlay=null;
        activeRow=null;
      }
      openTimer=window.setTimeout(()=>show(row),ANCESTRY_OPEN_DELAY);
    };

    const onPointerOver=event=> {
      if(event.target.closest?.(`#${ANCESTRY_OVERLAY_ID}`)) {
        clearClose();
        return;
      }
      const row=event.target.closest?.('[data-testid="clip-row"]');
      if(!row||row.contains(event.relatedTarget))return;
      scheduleOpen(row,{x:event.clientX,y:event.clientY});
    };


    const onPointerMove=event=> {
      if(overlay)return;
      const row=event.target.closest?.('[data-testid="clip-row"]');
      if(!row)return;
      pointerAnchor={x:event.clientX,y:event.clientY};
    };

    const onPointerOut=event=> {
      const row=event.target.closest?.('[data-testid="clip-row"]');
      if(!row||row.contains(event.relatedTarget))return;
      const related=event.relatedTarget;
      if(overlay&&(related===overlay||overlay.contains(related))) {
        clearClose();
        return;
      }
      if(related?.id==='suno-song-title-exact-overlay')return;
      clearOpen();
      scheduleClose();
    };

    const onPointerDown=event=> {
      if(overlay&&(event.target===overlay||overlay.contains(event.target)))return;
      if(event.target.closest?.('[data-testid="clip-row"]'))return;
      hide();
    };
    const onKeyDown=event=> { if(event.key==='Escape')hide(); };
    const onViewportChange=event=> {
      if(event?.type==='scroll'&&overlay&&(event.target===overlay||overlay.contains(event.target)))return;
      hide();
    };
    const destroy=()=>hide();
    const handlers={onPointerOver,onPointerOut,onPointerMove,onPointerDown,onKeyDown,onViewportChange,destroy};
    window[ANCESTRY_HANDLER_KEY]=handlers;
    document.addEventListener('pointerover',onPointerOver,true);
    document.addEventListener('pointerout',onPointerOut,true);
    document.addEventListener('pointermove',onPointerMove,true);
    document.addEventListener('pointerdown',onPointerDown,true);
    document.addEventListener('keydown',onKeyDown,true);
    window.addEventListener('scroll',onViewportChange,true);
    window.addEventListener('resize',onViewportChange,true);
  }
  lnLoad();
  workspaceCleanupLegacyColours();
  workspaceInstallFetchCapture();
  clearControllers('',/^__suno(?:Lineage|WorkspaceIndex|AncestryOverlay|AncestryNavigationDiagnostic)V\d+$/);
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
  // ---------------------------------------------------------------------------
  // Exact-position full-title bar for every song title
  // ---------------------------------------------------------------------------
  // The black title bar is intentionally available for every song, not only for
  // visibly truncated titles. On hover or keyboard focus it places a clickable
  // copy at the exact viewport coordinates of the original title. The first line
  // retains the source typography and starting position, so the title expands in
  // place instead of appearing as a detached browser tooltip.
  const TITLE_SELECTOR = '[class*="clip-title-wrapper"] > a[href^="/song/"]';
  const TITLE_OVERLAY_ID = 'suno-song-title-exact-overlay';
  const TITLE_HANDLER_KEY = '__sunoSongTitleExactOverlayHandlers';
  const OLD_TITLE_EXPAND_HANDLER_KEY = '__sunoSongTitleExpansionHandlers';
  const OLD_TITLE_TOOLTIP_HANDLER_KEY = '__sunoSongTitleTooltipHandlers';
  function normalizeSongTitle(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function titleWrapperFor(link) {
    return link.closest('[class*="clip-title-wrapper"]');
  }

  function clearIncorrectTitleMarkers() {
    $('a[data-suno-full-title], a[data-suno-title-expand]').forEach(link => {
      if (link.matches(TITLE_SELECTOR)) return;

      delete link.dataset.sunoFullTitle;
      delete link.dataset.sunoTitleExpand;
      link.style.removeProperty('--suno-title-visible-width');
    });
  }

  function prepareSongTitleExpansion() {
    clearIncorrectTitleMarkers();

    $(TITLE_SELECTOR).forEach(link => {
      const visibleTitle = normalizeSongTitle(link.textContent);
      const explicitTitle = normalizeSongTitle(link.getAttribute('title'));
      const rememberedTitle = normalizeSongTitle(link.dataset.sunoFullTitle);
      const fullTitle = explicitTitle || visibleTitle || rememberedTitle;
      const wrapper = titleWrapperFor(link);

      if (!visibleTitle || !fullTitle || !wrapper) return;

      link.dataset.sunoFullTitle = fullTitle;
      link.removeAttribute('title');

      // The title bar is always enabled. Keeping the marker explicit lets the
      // delegated event handlers remain narrow and avoids reacting to unrelated links.
      link.dataset.sunoTitleExpand = '1';
    });
  }

  function removeListenerSet(key) {
    const handlers = window[key];
    if (!handlers) return;

    if (handlers.onPointerOver) {
      document.removeEventListener('pointerover', handlers.onPointerOver, true);
    }
    if (handlers.onPointerOut) {
      document.removeEventListener('pointerout', handlers.onPointerOut, true);
    }
    if (handlers.onFocusIn) {
      document.removeEventListener('focusin', handlers.onFocusIn, true);
    }
    if (handlers.onFocusOut) {
      document.removeEventListener('focusout', handlers.onFocusOut, true);
    }
    if (handlers.onPointerDown) {
      document.removeEventListener('pointerdown', handlers.onPointerDown, true);
    }
    if (handlers.onKeyDown) {
      document.removeEventListener('keydown', handlers.onKeyDown, true);
    }
    if (handlers.hide) {
      window.removeEventListener('scroll', handlers.hide, true);
      window.removeEventListener('resize', handlers.hide, true);
    }

    handlers.hide?.();
    handlers.clearActive?.();
    delete window[key];
  }

  function installSongTitleExpansion() {
    removeListenerSet(TITLE_HANDLER_KEY);
    removeListenerSet(OLD_TITLE_EXPAND_HANDLER_KEY);
    removeListenerSet(OLD_TITLE_TOOLTIP_HANDLER_KEY);
    document.getElementById('suno-song-title-tooltip')?.remove();
    document.getElementById(TITLE_OVERLAY_ID)?.remove();

    let activeLink = null;
    let overlay = null;
    let activePinnedStrip = null;
    let hideTimer = 0;

    const cancelHide = () => {
      if (!hideTimer) return;
      clearTimeout(hideTimer);
      hideTimer = 0;
    };

    const hide = () => {
      cancelHide();
      overlay?.remove();
      overlay = null;
      if(activePinnedStrip?.isConnected) {
        delete activePinnedStrip.dataset.sunoPinnedTitleHover;
      }
      activePinnedStrip = null;
      activeLink = null;
    };

    const scheduleHide = () => {
      cancelHide();
      hideTimer = window.setTimeout(hide, 45);
    };

    const copyTypography = (source, target) => {
      const style = getComputedStyle(source);
      const properties = [
        'color',
        'fontFamily',
        'fontSize',
        'fontStyle',
        'fontWeight',
        'fontStretch',
        'fontVariant',
        'fontFeatureSettings',
        'fontKerning',
        'letterSpacing',
        'lineHeight',
        'textTransform',
        'wordSpacing'
      ];

      properties.forEach(property => {
        const value = style[property];
        if (value) target.style[property] = value;
      });
    };

    const show = link => {
      if (!link?.matches?.(`${TITLE_SELECTOR}[data-suno-title-expand="1"]`)) return;

      cancelHide();

      if (activeLink === link && overlay?.isConnected) return;
      hide();

      const fullTitle = normalizeSongTitle(link.dataset.sunoFullTitle || link.textContent);
      const wrapper = titleWrapperFor(link);
      const linkRect = link.getBoundingClientRect();
      const wrapperRect = wrapper?.getBoundingClientRect() || linkRect;

      if (!fullTitle || !linkRect.width || !linkRect.height) return;

      activeLink = link;
      activePinnedStrip=link.closest('[data-suno-pinned-column="1"]');
      if(activePinnedStrip) {
        activePinnedStrip.dataset.sunoPinnedTitleHover='1';
      }

      overlay = document.createElement('a');
      overlay.id = TITLE_OVERLAY_ID;
      overlay.href = link.href;
      overlay.textContent = fullTitle;
      overlay.setAttribute('aria-label', fullTitle);
      overlay.dataset.sunoTimestampRow = link.closest('.clip-row,[data-testid="clip-row"]')?'1':'0';

      if (link.target) overlay.target = link.target;
      if (link.rel) overlay.rel = link.rel;

      copyTypography(link, overlay);

      const left = Math.round(linkRect.left);
      const top = Math.round(linkRect.top);
      const visibleWidth = Math.max(1, Math.round(wrapperRect.width || linkRect.width));
      const viewportRoom = Math.max(visibleWidth, window.innerWidth - left - 8);
      const maximumWidth = Math.max(visibleWidth, Math.min(520, viewportRoom));

      overlay.style.setProperty('left', `${left}px`, 'important');
      overlay.style.setProperty('top', `${top}px`, 'important');
      overlay.style.setProperty('min-width', `${visibleWidth}px`, 'important');
      overlay.style.setProperty('max-width', `${maximumWidth}px`, 'important');
      overlay.style.setProperty('color', getComputedStyle(link).color, 'important');

      overlay.addEventListener('pointerenter',()=> {
        cancelHide();
        if(activePinnedStrip?.isConnected) {
          activePinnedStrip.dataset.sunoPinnedTitleHover='1';
        }
      });
      overlay.addEventListener('pointerleave', scheduleHide);
      overlay.addEventListener('focus',()=> {
        cancelHide();
        if(activePinnedStrip?.isConnected) {
          activePinnedStrip.dataset.sunoPinnedTitleHover='1';
        }
      });
      overlay.addEventListener('blur', scheduleHide);

      document.body.appendChild(overlay);
    };

    const onPointerOver = event => {
      const link = event.target.closest?.(`${TITLE_SELECTOR}[data-suno-title-expand="1"]`);
      if (!link || link.contains(event.relatedTarget)) return;
      show(link);
    };

    const onPointerOut = event => {
      const link = event.target.closest?.(`${TITLE_SELECTOR}[data-suno-title-expand="1"]`);
      if (!link || link.contains(event.relatedTarget)) return;
      if (overlay && (event.relatedTarget === overlay || overlay.contains(event.relatedTarget))) {
        return;
      }
      scheduleHide();
    };

    const onFocusIn = event => {
      const link = event.target.closest?.(`${TITLE_SELECTOR}[data-suno-title-expand="1"]`);
      if (link) show(link);
    };

    const onFocusOut = event => {
      const link = event.target.closest?.(`${TITLE_SELECTOR}[data-suno-title-expand="1"]`);
      if (!link) return;
      if (overlay && (event.relatedTarget === overlay || overlay.contains(event.relatedTarget))) {
        return;
      }
      scheduleHide();
    };

    const onPointerDown = event => {
      if (overlay && (event.target === overlay || overlay.contains(event.target))) return;
      hide();
    };

    const onKeyDown = event => {
      if (event.key === 'Escape') hide();
    };

    const handlers = {
      onPointerOver,
      onPointerOut,
      onFocusIn,
      onFocusOut,
      onPointerDown,
      onKeyDown,
      hide
    };

    window[TITLE_HANDLER_KEY] = handlers;

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide, true);
  }

  function installTimestampMarkers() {
    const KEY='__sunoTimestampMarkers', POP='suno-time-popup';
    const old=window[KEY];
    if(old) {
      document.removeEventListener('pointermove',old.move,true);
      document.removeEventListener('pointerdown',old.down,true);
      old.hide?.(true);
    }
    document.getElementById(POP)?.remove();

    const RX=/\d+:\d{2}(?:\.\d+)?/g;
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const pageId=()=>location.pathname.match(/^\/song\/([0-9a-f-]{36})/i)?.[1]||'';
    const hrefId=e=>String(e?.getAttribute?.('href')||'').match(/\/song\/([0-9a-f-]{36})/i)?.[1]||'';
    const ROW='.clip-row,[data-testid="clip-row"]';
    const SONG_TEXT='[data-testid*="lyric" i],[class*="lyric" i],[aria-label*="lyric" i],[data-testid*="comment" i],[class*="comment" i],[aria-label*="comment" i]';
    const songId=e=> {
      const own=hrefId(e)||hrefId(e?.closest?.('a[href*="/song/"]'));
      if(own)return own;
      const row=e?.closest?.(ROW);
      if(row) {
        const ids=[...new Set([...row.querySelectorAll('a[href*="/song/"]')].map(hrefId).filter(Boolean))];
        if(ids.length===1)return ids[0];
      }
      return pageId();
    };
    const source=e=> {
      if(!(e instanceof Element)||e.closest(`#${POP},[data-playbar="true"],input,textarea,select,[contenteditable="true"]`))return null;

      const exact=e.closest('#suno-song-title-exact-overlay');
      if(exact)return exact.dataset.sunoTimestampRow==='1'?exact:null;

      const row=e.closest(ROW);
      if(row)return e.closest('a[href*="/song/"],p,span,blockquote')||e;

      if(pageId()) {
        const area=e.closest(SONG_TEXT);
        if(area)return e.closest('p,span,blockquote,li,div')||area;
      }
      return null;
    };
    const hit=(el,x,y)=> {
      const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n,m;
      while((n=w.nextNode())) {
        RX.lastIndex=0;
        while((m=RX.exec(n.nodeValue||''))) {
          const r=document.createRange(); r.setStart(n,m.index); r.setEnd(n,m.index+m[0].length);
          for(const b of r.getClientRects()) if(x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom) {
            const sec=seekParseTime(m[0]); if(Number.isFinite(sec))return {text:m[0],sec,rect:b};
          }
        }
      }
      return null;
    };
    const activeId=()=> {
      for(const a of document.querySelectorAll('[data-playbar="true"] a[href*="/song/"]')) { const id=hrefId(a); if(id)return id; }
      return '';
    };
    const control=()=> {
      editableSeekRefresh();
      const s=document.querySelector(`[data-playbar="true"] ${C}`); if(!s)return null;
      const t=s.closest('[data-pb="tr"]')||s.parentElement;
      return t?.querySelector(':scope > .suno-editable-seek-time')?.__sunoSeekControl||null;
    };
    const playButton=(src,id)=> {
      const q='.clip-image-container[role="button"][aria-label^="Play"],button[aria-label^="Play"],[role="button"][aria-label^="Play"]';
      const row=src?.closest?.('.clip-row,[data-testid="clip-row"]');
      if(row?.querySelector(q))return row.querySelector(q);
      for(const a of document.querySelectorAll(`a[href^="/song/${id}"]`)) {
        const host=a.closest('.clip-row,[data-testid="clip-row"]'); if(host?.querySelector(q))return host.querySelector(q);
      }
      if(pageId()===id)return [...document.querySelectorAll(q)].find(b=>!b.closest('[data-playbar="true"],.clip-row,[class*="comment" i]'))||null;
      return null;
    };
    const playAt=async(src,id,target)=> {
      const same=activeId()===id;

      if(same) {
        const c=control();
        if(!c)return;
        seekPlay(c);
        seekToSeconds(c,target);
        return;
      }

      if(!press(playButton(src,id)))return;

      // Give Suno a moment to finish switching the global player to the new song.
      await sleep(1000);

      const c=control();
      if(!c)return;
      seekToSeconds(c,target);
      seekPlay(c);
    };

    let popup=null,timer=0,hideTimer=0,key='',last=null,pin=null,visibleUntil=0;
    const unlock=()=> { if(pin?.isConnected)delete pin.dataset.sunoTimeOpen; pin=null; };
    const hide=force=> {
      clearTimeout(timer); timer=0;
      clearTimeout(hideTimer);
      const old=popup, remove=()=>{ if(old?.matches(':hover')&&!force)return; old?.remove(); if(popup===old)popup=null; if(!popup)unlock(); };
      if(force){key='';remove()}else hideTimer=setTimeout(remove,Math.max(0,visibleUntil-Date.now()));
    };
    const show=(src,id,h,k)=> {
      hide(true); key=k; last={src,id,h};
      popup=document.createElement('button'); popup.id=POP; popup.type='button'; popup.textContent=h.text;
      document.body.appendChild(popup);
      const pr=popup.getBoundingClientRect(), top=h.rect.top-pr.height-5>=4?h.rect.top-pr.height-5:h.rect.bottom+5;
      popup.style.left=`${Math.max(4,Math.min(innerWidth-pr.width-4,h.rect.left+(h.rect.width-pr.width)/2))}px`;
      popup.style.top=`${top}px`; visibleUntil=Date.now()+1000;
      pin=src.closest?.('[data-suno-pinned-column="1"]')||document.querySelector(`[data-suno-pinned-column="1"] a[href^="/song/${id}"]`)?.closest('[data-suno-pinned-column="1"]');
      if(pin)pin.dataset.sunoTimeOpen='1';
      requestAnimationFrame(()=>popup&&(popup.dataset.show='1'));
      popup.onpointerenter=()=>clearTimeout(hideTimer); popup.onpointerleave=()=>hide(false);
      popup.onclick=e=>{e.preventDefault();e.stopPropagation();const {src,id,h}=last;hide(true);void playAt(src,id,h.sec)};
    };
    const move=e=> {
      if(popup?.contains(e.target))return;
      const s=source(e.target), h=s&&hit(s,e.clientX,e.clientY), id=s&&songId(s);
      if(!h||!id){hide(false);return}
      const k=`${id}|${h.text}|${Math.round(h.rect.left)}|${Math.round(h.rect.top)}`;
      if(popup&&key===k){clearTimeout(hideTimer);return}
      if(key===k&&timer)return;
      hide(true); key=k; timer=setTimeout(()=>{ if(s.isConnected)show(s,id,h,k) },280);
    };
    const down=e=> { if(!popup?.contains(e.target))hide(true); };
    document.addEventListener('pointermove',move,true);
    document.addEventListener('pointerdown',down,true);
    window[KEY]={move,down,hide};
  }

  // Main idempotent refresh pass. Safe to call after every relevant DOM mutation.
function run() {
    wide();

    // Hide the profile carousel independently of pinned-song discovery.
    // This is required after client-side navigation from Create to a profile,
    // where pinned-song data may not be available during the first refresh pass.
    hideCarousel();

    playlistCovers();
    playlistLikes();
    createTitleEdit();
    workspaceRefresh();
    workspaceApplySelectedSongTint();
    layoutCards();
    prepareSongTitleExpansion();
    markPinnedColumn();
    let nr=layoutNewRows(), ch=applyPins();
    if(ch||nr) {
      layoutCards();
      layoutNewRows()
    }
    cardMetadataRefresh();
    clearPlayDiscs();
    clearOverlayDiscs();
    playbar();
    editableSeekRefresh();
    exactNumbers();
    creditRender();
    aboutInBanner()
  }
  // ---------------------------------------------------------------------------
// Mutation scheduling and initialization
// ---------------------------------------------------------------------------
let raf=0, sched=()=>raf||(raf=requestAnimationFrame(()=> {
    raf=0;
    run()
  }));
  installTrackerBlocker();
  installSongTitleExpansion();
  installTimestampMarkers();
  installAncestryOverlay();
  installSelectedSongTint();
  installEditableSeekTime();
  creditInitialize();
  run();
  window[OBS]=new MutationObserver(sched);
  window[OBS].observe(document.body, {
    childList:true, subtree:true
  });
  window.addEventListener("resize", sched, {
    passive:true
  })
})();

//# sourceURL=suno-tweaks-v90-simple-timestamp-seek.js
