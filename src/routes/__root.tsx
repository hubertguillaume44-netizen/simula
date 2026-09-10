import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { VisitsBeacon } from "@/components/visits-beacon";
import appCss from "../styles.css?url";

const APP_NAME = "Véna — simulateur de stratégies trading";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Simulateur de stratégies trading. Testez une règle avant d’y mettre un euro : Véna rejoue vos stratégies et découpe l’historique pour vérifier si le résultat tient hors période.",
      },
      { name: "theme-color", content: "#ebeae6" },
    ],
    // TROIS ICÔNES, ET NON UNE. Le signe existe en trois DESSINS, pas en trois tailles :
    // le rapport de graisses du grand palier ne tient qu'au-dessus de 40 px, en dessous
    // le jambage fin passe sous le pixel et il ne reste qu'un V ordinaire. `favicon-16`
    // vient donc du palier `sm`, `favicon-32` du palier `md`, l'apple-touch du `lg`.
    // Les consolider en une seule déclaration, ou en régénérer une en réduisant une
    // autre, efface la marque là où elle est la plus vue. Du plus capable au plus bête :
    // le SVG d'abord, puis les deux PNG.
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      // visait /__grok/icon-180.png, qui ne porte pas la marque
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
  }),
  component: () => (
    <html lang="fr" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-paper text-ink">
        <PreviewHostBridge />
        <VisitsBeacon />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
