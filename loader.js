(() => {
  "use strict";

  // Persistent local loader for the main Suno enhancement script.
  // The selected source file is stored in suno.com's localStorage.
  const CODE_KEY = "__suno_local_script_code_v1";
  const META_KEY = "__suno_local_script_meta_v1";
  const BUTTON_ID = "suno-local-script-delete-button";
  const OBSERVER_KEY = "__sunoLocalLoaderUiObserver";
  const EARN_CREDITS_SELECTOR = 'a[href="/listen-and-rank"]';

  function stopUiObserver() {
    window[OBSERVER_KEY]?.disconnect?.();
    delete window[OBSERVER_KEY];

    // Remove listeners left by older loader versions.
    const oldReposition = window.__sunoLocalLoaderReposition;
    if (oldReposition) {
      window.removeEventListener("resize", oldReposition);
      window.removeEventListener("scroll", oldReposition, true);
      delete window.__sunoLocalLoaderReposition;
    }
  }

  function deleteStoredScript(button) {
    localStorage.removeItem(CODE_KEY);
    localStorage.removeItem(META_KEY);
    stopUiObserver();
    button.remove();
    console.log("[Suno Local Loader] Stored script deleted.");
  }

  function createDeleteButton(earnCreditsLink) {
    // Remove a button created by an older loader version, including the former
    // fixed-position body control.
    document.getElementById(BUTTON_ID)?.remove();

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.title = "Remove UI Tweak";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("data-inactive", "");
    button.dataset.sunoLocalLoaderControl = "delete";

    // Reuse Suno's own Earn Credits classes so the control follows the sidebar
    // width, colors, hover effect and collapsed-state behavior automatically.
    button.className = earnCreditsLink.className;

    button.innerHTML = `
      <span aria-hidden="true" class="hxc-btn-overlay-slot hxc-btn-border"></span>
      <span class="hxc-btn-content">
        <svg xmlns="http://www.w3.org/2000/svg"
             width="1em"
             height="1em"
             viewBox="0 0 24 24"
             fill="currentColor"
             class="hxc-btn-icon"
             aria-hidden="true">
          <path d="M9 3h6l1 2h4v2h-1.1l-1 13H6.1l-1-13H4V5h4l1-2Zm-1.9 4 .85 11h8.1l.85-11H7.1ZM9 9h2v7H9V9Zm4 0h2v7h-2V9Z"></path>
        </svg>
        <span class="overflow-hidden whitespace-nowrap transition-opacity duration-200 group-data-[show-content=false]/sidebar:opacity-0">
          Remove UI Tweak
        </span>
      </span>`;

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      deleteStoredScript(button);
    }, true);

    return button;
  }

  function mountDeleteButton() {
    if (!localStorage.getItem(CODE_KEY)) {
      document.getElementById(BUTTON_ID)?.remove();
      return false;
    }

    const earnCreditsLink = document.querySelector(EARN_CREDITS_SELECTOR);
    const targetGroup = earnCreditsLink?.parentElement;
    if (!earnCreditsLink || !targetGroup) return false;

    let button = document.getElementById(BUTTON_ID);

    // Recreate controls from older versions or controls that React moved into a
    // different parent. A fresh button also guarantees the current Suno classes.
    if (!button || button.parentElement !== targetGroup) {
      button?.remove();
      button = createDeleteButton(earnCreditsLink);
      targetGroup.insertBefore(button, earnCreditsLink);
    } else if (button.nextElementSibling !== earnCreditsLink) {
      targetGroup.insertBefore(button, earnCreditsLink);
    }

    // Keep the style synchronized if Suno changes the navigation button classes.
    if (button.className !== earnCreditsLink.className) {
      button.className = earnCreditsLink.className;
    }

    return true;
  }

  function startUiObserver() {
    stopUiObserver();
    let pending = false;

    const scheduleMount = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        mountDeleteButton();
      });
    };

    // Suno rebuilds parts of the sidebar with React. Reinsert the control after
    // navigation and layout changes without polling continuously.
    const observer = new MutationObserver(scheduleMount);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window[OBSERVER_KEY] = observer;
    scheduleMount();
  }

  function executeScript(code, fileName = "suno-local-script.txt") {
    mountDeleteButton();
    startUiObserver();

    const safeName = String(fileName).replace(/[^a-z0-9._-]+/gi, "-");
    new Function(`${code}\n//# sourceURL=${safeName}`)();
    console.log(`[Suno Local Loader] Executed: ${safeName}`);
  }

  function chooseLocalFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.js,text/plain,text/javascript,application/javascript";
    input.hidden = true;

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      try {
        const code = (await file.text())
          .replace(/^\s*javascript:/i, "")
          .trim();

        if (!code) throw new Error("The selected file is empty.");

        localStorage.setItem(CODE_KEY, code);
        localStorage.setItem(META_KEY, JSON.stringify({
          name: file.name,
          size: file.size,
          savedAt: new Date().toISOString()
        }));

        executeScript(code, file.name);
      } catch (error) {
        console.error("[Suno Local Loader] The file could not be loaded.", error);
        alert(`Could not load file:\n${error}`);
      }
    });

    document.documentElement.appendChild(input);
    input.click();
  }

  try {
    const code = localStorage.getItem(CODE_KEY);
    const metadata = JSON.parse(localStorage.getItem(META_KEY) || "{}");

    if (code) executeScript(code, metadata.name);
    else chooseLocalFile();
  } catch (error) {
    console.error("[Suno Local Loader] Loader error.", error);
    alert(`Suno loader error:\n${error}`);
  }
})();