import {
  DARK_CLASS,
  DEFAULT_THEME,
  PREFERENCES_STORAGE_KEY,
  THEME_VALUES,
} from "./schema";

/**
 * Source of the inline script that paints the theme before first paint.
 *
 * It is a string, built from the same constants the store and resolver use, so
 * the key, the accepted value set, the default and the class name cannot be
 * changed in one place only. The branching logic below mirrors `resolveTheme`;
 * `boot-script.test.ts` (qa) must run this string against the resolver across
 * every stored value x OS setting and fail on any difference.
 *
 * Reads the zustand-persist envelope `{"state":{"theme":...},"version":n}`.
 * Never throws: storage blocked, JSON malformed, matchMedia missing all fall
 * through to the default. It only toggles the class on <html>, with an explicit
 * force, so it is idempotent.
 */
export const THEME_BOOT_SCRIPT = `(function(){var t=${JSON.stringify(DEFAULT_THEME)};try{var s=JSON.parse(window.localStorage.getItem(${JSON.stringify(PREFERENCES_STORAGE_KEY)})||"null");var p=s&&s.state&&s.state.theme;if(${JSON.stringify(THEME_VALUES)}.indexOf(p)>-1)t=p}catch(e){}var d=t==="dark";if(t==="system"){try{d=window.matchMedia("(prefers-color-scheme: dark)").matches}catch(e){d=false}}document.documentElement.classList.toggle(${JSON.stringify(DARK_CLASS)},d)})();`;
