import {
  DARK_CLASS,
  DEFAULT_THEME,
  PREFERENCES_STORAGE_KEY,
  TASK_PANEL_ATTRIBUTE,
  TASK_PANEL_HIDDEN_VALUE,
  THEME_VALUES,
} from "./schema";

/**
 * Source of the inline script that paints the theme and the task panel's
 * hidden/shown state before first paint.
 *
 * It is a string, built from the same constants the store and resolver use, so
 * the key, the accepted value set, the default, the class name and the
 * attribute cannot be changed in one place only. The theme branching mirrors
 * `resolveTheme`; `boot-script.test.ts` (qa) must run this string against the
 * resolver across every stored theme x OS setting, and across every stored
 * `taskPanelVisible` value, and fail on any difference.
 *
 * One `getItem` and one `JSON.parse` serve both keys. Reads the zustand-persist
 * envelope `{"state":{"theme":...,"taskPanelVisible":...},"version":n}`. Never
 * throws: storage blocked, JSON malformed, matchMedia missing all fall through
 * to defaults. Idempotent, so a bfcache restore can run it again: the dark
 * class is toggled with an explicit force, and the panel attribute is set or
 * removed outright, never toggled. Only a stored boolean `false` hides the
 * panel; anything else (absent, `true`, wrong type) leaves it visible.
 */
export const PREFERENCES_BOOT_SCRIPT = `(function(){var t=${JSON.stringify(DEFAULT_THEME)},h=false;try{var s=JSON.parse(window.localStorage.getItem(${JSON.stringify(PREFERENCES_STORAGE_KEY)})||"null");var st=s&&s.state;var p=st&&st.theme;if(${JSON.stringify(THEME_VALUES)}.indexOf(p)>-1)t=p;h=!!st&&st.taskPanelVisible===false}catch(e){}var d=t==="dark";if(t==="system"){try{d=window.matchMedia("(prefers-color-scheme: dark)").matches}catch(e){d=false}}var r=document.documentElement;r.classList.toggle(${JSON.stringify(DARK_CLASS)},d);if(h)r.setAttribute(${JSON.stringify(TASK_PANEL_ATTRIBUTE)},${JSON.stringify(TASK_PANEL_HIDDEN_VALUE)});else r.removeAttribute(${JSON.stringify(TASK_PANEL_ATTRIBUTE)})})();`;
