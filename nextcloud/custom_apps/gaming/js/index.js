
    let deferredPrompt;

        window.addEventListener("beforeinstallprompt", (event) => {
            event.preventDefault(); // Evita que el navegador lo muestre automáticamente
            deferredPrompt = event; // Guarda el evento para usarlo después

            // Muestra el botón de instalación
            const installButton = document.getElementById("installApp");
            installButton.style.display = "block";
            
            installButton.addEventListener("click", () => {
                deferredPrompt.prompt(); // Muestra el diálogo nativo
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === "accepted") {
                    console.log("Usuario instaló la PWA");
                    } else {
                    console.log("Usuario canceló la instalación");
                    }
                    deferredPrompt = null;
                });
            });
        });
