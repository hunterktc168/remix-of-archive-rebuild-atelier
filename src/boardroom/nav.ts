/**
 * Bridge between the ported Boardroom view modules and TanStack Router.
 * The shell registers the router's navigate function; views call navigateTo()
 * instead of assigning window.location.hash like the original app did.
 */
type Navigator = (href: string, opts?: { replace?: boolean }) => void;

let navigator: Navigator | null = null;
let silentHref: string | null = null;

export function setNavigator(fn: Navigator | null) {
  navigator = fn;
}

export function navigateTo(href: string) {
  if (navigator) navigator(href);
  else window.location.assign(href);
}

/** Update the address bar without re-rendering the current view (was history.replaceState). */
export function replaceUrlSilently(href: string) {
  if (!navigator) {
    window.history.replaceState(null, "", href);
    return;
  }
  silentHref = href;
  navigator(href, { replace: true });
}

/** Returns true (once) when the given href came from replaceUrlSilently. */
export function consumeSilentNavigation(href: string) {
  if (silentHref !== null && silentHref === href) {
    silentHref = null;
    return true;
  }
  return false;
}
