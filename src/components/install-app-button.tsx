"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Chrome/Android exponen este evento para poder disparar la instalación de
// la PWA por código — Safari/iOS no lo tiene, así que ahí siempre se
// muestran las instrucciones manuales.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error -- solo existe en Safari/iOS
    window.navigator.standalone === true
  );
}

function isIos() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function handleClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    // Sin evento nativo disponible (iOS, o Android antes de que el
    // navegador decida ofrecerlo) — se explican los pasos manuales.
    setShowIosHelp(true);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleClick}>
        <Download className="size-3.5" />
        Descargar app para el celular
      </Button>

      <Dialog open={showIosHelp} onOpenChange={setShowIosHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="size-4" />
              Instalar Reditus CRM en tu celular
            </DialogTitle>
          </DialogHeader>
          {isIos() ? (
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>Abre esta página en Safari.</li>
              <li>
                Toca el botón de <span className="font-medium text-foreground">Compartir</span> (el
                cuadrado con la flecha hacia arriba).
              </li>
              <li>
                Elige <span className="font-medium text-foreground">&quot;Agregar a pantalla de inicio&quot;</span>.
              </li>
              <li>Confirma el nombre y toca &quot;Agregar&quot; — quedará como una app normal.</li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>Abre el menú de tu navegador (los tres puntos, arriba a la derecha).</li>
              <li>
                Busca la opción <span className="font-medium text-foreground">&quot;Instalar app&quot;</span> o
                &quot;Agregar a pantalla de inicio&quot;.
              </li>
              <li>Confirma — quedará como una app normal en tu celular.</li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
