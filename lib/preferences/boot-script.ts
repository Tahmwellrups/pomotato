import {
  PREFERENCES_STORAGE_KEY,
  TASK_PANEL_ATTRIBUTE,
  TASK_PANEL_HIDDEN_VALUE,
} from "./schema";

/**
 * Source of the inline script that paints the task panel's hidden/shown state
 * before first paint. It carries no theme branch: the app is dark only (task
 * 019), and dark comes from the server-rendered <html>, not from this script.
 *
 * It is a string, built from the same constants the store uses, so the key and
 * the attribute cannot be changed in one place only. One `getItem` and one
 * `JSON.parse`, reading the zustand-persist envelope
 * `{"state":{"taskPanelVisible":...},"version":n}`. Never throws: storage
 * blocked or JSON malformed falls through to the default. Idempotent, so a
 * bfcache restore can run it again: the attribute is set or removed outright,
 * never toggled. Only a stored boolean `false` hides the panel; anything else
 * (absent, `true`, wrong type) leaves it visible. Any other stored key, a stale
 * `theme` included, is never read.
 */
export const PREFERENCES_BOOT_SCRIPT = `(function(){var h=false;try{var s=JSON.parse(window.localStorage.getItem(${JSON.stringify(PREFERENCES_STORAGE_KEY)})||"null");var st=s&&s.state;h=!!st&&st.taskPanelVisible===false}catch(e){}var r=document.documentElement;if(h)r.setAttribute(${JSON.stringify(TASK_PANEL_ATTRIBUTE)},${JSON.stringify(TASK_PANEL_HIDDEN_VALUE)});else r.removeAttribute(${JSON.stringify(TASK_PANEL_ATTRIBUTE)})})();`;
