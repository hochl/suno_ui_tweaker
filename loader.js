(() => {
  "use strict";

  // Persistent local loader for the main Suno script.
  // The large readable script is stored in suno.com's localStorage.
  const CODE_KEY = "__suno_local_script_code_v1";
  const META_KEY = "__suno_local_script_meta_v1";
  const BUTTON_ID = "suno-local-script-delete-button";
  const OBSERVER_KEY = "__sunoLocalLoaderUiObserver";
  const LOGO_SELECTOR = 'svg[aria-label="Suno Logo"]';

  function stopUiObserver() {
    window[OBSERVER_KEY]?.disconnect?.();
    delete window[OBSERVER_KEY];
  }

  function deleteStoredScript(button) {
    localStorage.removeItem(CODE_KEY);
    localStorage.removeItem(META_KEY);
    stopUiObserver();
    button.remove();
    console.log("[Suno Local Loader] Stored script deleted.");
  }

  function createDeleteButton() {
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;

    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.title = "Gespeichertes lokales Skript löschen";
    button.setAttribute("aria-label", button.title);
    button.dataset.sunoLocalLoaderControl = "delete";
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-2 6h10l-1 11H8L7 9zm3 2v7h2v-7h-2zm4 0v7h2v-7h-2z"></path>
      </svg>
    `;

    // Keep the control independent from Suno's button and sidebar styles.
    const styles = {
      position: "relative",
      display: "inline-flex",
      visibility: "visible",
      opacity: "0.9",
      flex: "0 0 32px",
      order: "2",
      width: "32px",
      height: "32px",
      minWidth: "32px",
      minHeight: "32px",
      maxWidth: "32px",
      maxHeight: "32px",
      padding: "0",
      margin: "0 0 0 6px",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      border: "1px solid rgba(255, 110, 110, 0.75)",
      borderRadius: "9px",
      backgroundColor: "rgba(55, 12, 12, 0.96)",
      color: "#ffd7d7",
      cursor: "pointer",
      pointerEvents: "auto",
      boxShadow: "0 2px 10px rgba(0, 0, 0, 0.45)",
      outline: "none",
      overflow: "visible",
      zIndex: "2147483646",
      transform: "none"
    };

    for (const [property, value] of Object.entries(styles)) {
      const cssProperty = property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
      button.style.setProperty(cssProperty, value, "important");
    }

    const icon = button.querySelector("svg");
    icon.style.setProperty("display", "block", "important");
    icon.style.setProperty("width", "17px", "important");
    icon.style.setProperty("height", "17px", "important");
    icon.style.setProperty("fill", "currentColor", "important");
    icon.style.setProperty("pointer-events", "none", "important");

    button.addEventListener("mouseenter", () => {
      button.style.setProperty("opacity", "1", "important");
      button.style.setProperty("background-color", "rgba(75, 16, 16, 0.98)", "important");
    });

    button.addEventListener("mouseleave", () => {
      button.style.setProperty("opacity", "0.9", "important");
      button.style.setProperty("background-color", "rgba(55, 12, 12, 0.96)", "important");
    });

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      deleteStoredScript(button);
    });

    return button;
  }

  function mountDeleteButton() {
    if (!localStorage.getItem(CODE_KEY)) return false;

    const logo = document.querySelector(LOGO_SELECTOR);
    const logoLink = logo?.closest("a");
    const header = logoLink?.parentElement;
    if (!logo || !logoLink || !header) return false;

    // Use Suno's existing flex header and place the control immediately after
    // the logo link. No viewport coordinates or measured positions are used.
    header.style.setProperty("display", "flex", "important");
    header.style.setProperty("flex-direction", "row", "important");
    header.style.setProperty("align-items", "center", "important");
    header.style.setProperty("justify-content", "flex-start", "important");
    header.style.setProperty("overflow", "visible", "important");
    header.style.setProperty("position", "relative", "important");

    logoLink.style.setProperty("order", "1", "important");
    logoLink.style.setProperty("flex", "0 1 7rem", "important");
    logoLink.style.setProperty("min-width", "0", "important");

    const button = createDeleteButton();

    // insertAdjacentElement guarantees that the button is the next sibling of
    // the logo link even after React rebuilds or reorders the header children.
    if (logoLink.nextElementSibling !== button) {
      logoLink.insertAdjacentElement("afterend", button);
    }

    console.debug("[Suno Local Loader] Delete button mounted next to the logo.", {
      header,
      logoLink,
      button
    });
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

    const observer = new MutationObserver(scheduleMount);
    observer.observe(document.documentElement, { childList: true, subtree: true });
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
        const code = (await file.text()).replace(/^\s*javascript:/i, "").trim();
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
        alert(`Datei konnte nicht geladen werden:\n${error}`);
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
    alert(`Suno-Loader-Fehler:\n${error}`);
  }
})();