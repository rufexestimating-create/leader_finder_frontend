export const THEME_STORAGE_KEY = "lf-theme";

/** Runs in <head> before first paint. Light unless the user picked dark with the toggle. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})();`;
