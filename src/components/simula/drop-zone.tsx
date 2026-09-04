import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { CSV_HELP } from "@/lib/demo";
import { useSim } from "@/lib/store";

export function DropZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropFiles = useSim((s) => s.dropFiles);
  const message = useSim((s) => s.messageDepot);
  const [over, setOver] = useState(false);

  function take(files: FileList | null) {
    if (files && files.length) void dropFiles(files);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-28 w-full flex-col items-center justify-center gap-2 border border-dashed border-line px-4 py-6 text-center transition-colors duration-150",
          over ? "border-steel bg-steel-soft/60" : "bg-paper hover:bg-steel-soft/30",
        )}
      >
        <Upload className="size-4 text-steel" />
        <div className="text-sm">
          Glissez votre export H1 en CSV — c’est votre version, sur cet ordinateur.
        </div>
        <div className="text-xs text-muted">
          Jamais envoyé. Le lien public continue d’afficher uniquement les démos.
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      {message ? <p className="text-xs text-steel">{message}</p> : null}
      <details className="text-xs text-muted">
        <summary className="cursor-pointer text-ink/80">Exporter depuis MetaTrader 5</summary>
        <p className="mt-2 leading-relaxed">
          MT5 → Clic droit sur le graphique H1 → Fenêtre des cotations n’est pas la bonne
          piste. Ouvrez le symbole, clic droit → Exporter → CSV. Colonnes attendues :
          date, heure, open, high, low, close, volume. Séparateur virgule, point-virgule ou
          tabulation. Le fichier est lu ici, jamais envoyé.
        </p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
          {CSV_HELP}
        </pre>
      </details>
    </div>
  );
}
