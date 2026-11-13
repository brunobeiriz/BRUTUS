(() => {
  let deferredPrompt = null;
  const installButtons = [...document.querySelectorAll(".install-app-btn")];
  const help = document.getElementById("installHelp");
  const closeHelp = document.getElementById("closeInstallHelp");
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js", {scope: "./"})
        .catch(error => console.warn("PWA indisponível:", error));
    });
  }

  const setInstallVisibility = visible => {
    installButtons.forEach(button => button.classList.toggle("hidden", !visible));
  };

  if (!isStandalone && isIOS) setInstallVisibility(true);

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    if (!isStandalone) setInstallVisibility(true);
  });

  installButtons.forEach(button => button.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      setInstallVisibility(false);
      return;
    }
    help?.classList.remove("hidden");
  }));

  closeHelp?.addEventListener("click", () => help.classList.add("hidden"));
  help?.addEventListener("click", event => {
    if (event.target === help) help.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    setInstallVisibility(false);
  });
})();
