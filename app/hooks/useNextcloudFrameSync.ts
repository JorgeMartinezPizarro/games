import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Mensaje que escucha la app de Nextcloud (nextcloud/custom_apps/gaming/js/main.js)
// para reflejar en su propia URL (/apps/gaming/<ruta>) la página que se ve
// dentro del iframe. Así recargar, copiar el enlace o volver atrás mantiene
// el juego abierto (deeplink).
export const NAVIGATE_MESSAGE = "gaming:navigate";

export type NavigateMessage = {
  type: typeof NAVIGATE_MESSAGE;
  // Ruta sin el basePath (/bookmarks), p. ej. "/pages/games/tetris".
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
    // targetOrigin "*": el cliente no conoce el origen de Nextcloud (solo el
    // servidor tiene NEXTCLOUD_URL) y el mensaje solo lleva la ruta visible,
    // nada sensible. Quien valida es el receptor: Nextcloud solo acepta
    // mensajes de su propio iframe con el origen de los juegos.
    window.parent.postMessage(message, "*");
  }, [pathname]);
}
