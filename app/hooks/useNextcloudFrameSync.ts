import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Message the Nextcloud app listens for (nextcloud/custom_apps/gaming/js/main.js)
// to mirror in its own URL (/apps/gaming/<path>) the page shown inside the
// iframe. That way reloading, copying the link or going back keeps the game
// open (deeplink).
export const NAVIGATE_MESSAGE = "gaming:navigate";

export type NavigateMessage = {
  type: typeof NAVIGATE_MESSAGE;
  // Path without the basePath (/bookmarks), e.g. "/pages/games/tetris".
  path: string;
  search: string;
};

export function useNextcloudFrameSync(): void {
  const pathname = usePathname();

  useEffect(() => {
    if (window.parent === window) {
      return;
    }

    const message: NavigateMessage = {
      type: NAVIGATE_MESSAGE,
      path: pathname,
      search: window.location.search,
    };
    // targetOrigin "*": the client doesn't know Nextcloud's origin (only the
    // server has NEXTCLOUD_URL) and the message only carries the visible
    // path, nothing sensitive. The receiver does the validation: Nextcloud
    // only accepts messages from its own iframe with the games' origin.
    window.parent.postMessage(message, "*");
  }, [pathname]);
}
