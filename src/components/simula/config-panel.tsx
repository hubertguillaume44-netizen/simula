import { Blueprint } from "@/components/blueprint";
import { DropZone } from "@/components/simula/drop-zone";
import { CheckRow, Field, NumberInput, Select } from "@/components/simula/fields";
import { Button } from "@/components/ui/button";
import { ENTREES_TXT, LIGNES_TXT, EUR } from "@/lib/format";
import { useSim } from "@/lib/store";
import type { EntreeType, LigneType, SecuType, Timeframe } from "@/lib/types";

const UT: Timeframe[] = ["H1", "H4", "D1"];

export function ConfigPanel() {
  const settings = useSim((s) => s.settings);
  const instruments = useSim((s) => s.instruments);
  const patch = useSim((s) => s.patch);
  const retirer = useSim((s) => s.retirerFichier);
  const euroR = (settings.capital * settings.risquePct) / 100;
  const current = instruments.find((i) => i.id === settings.symbol);
  const demos = instruments.filter((i) => i.kind === "demo");
  const files = instruments.filter((i) => i.kind === "upload");

  return (
    <div className="flex flex-col gap-6">
      <Blueprint className="flex flex-col gap-4 p-5">
        <div className="kicker">Instrument</div>
        <p className="text-xs leading-relaxed text-muted">
          Deux versions, même moteur. <strong className="font-medium text-ink">En ligne</strong> : les
          quatre démos, pour tout le monde. <strong className="font-medium text-ink">Vos CSV</strong> :
          restent sur cet ordinateur, jamais envoyés, jamais sur le lien public.
        </p>
        <Field label="Série">
          <Select
            value={settings.symbol}
            onChange={(e) => patch({ symbol: e.target.value })}
          >
            {files.length ? (
              <optgroup label="Mes exports">
                {files.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Démonstration (en ligne)">
              {demos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <p className="text-xs text-muted">{current?.hint}</p>
        {current?.kind === "upload" ? (
          <Button variant="ghost" size="sm" onClick={() => void retirer(current.id)}>
            Retirer ce fichier de cet ordinateur
          </Button>
        ) : null}
        <DropZone />
      </Blueprint>

      <Blueprint className="flex flex-col gap-4 p-5">
        <div className="kicker">Entrée</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Règle" className="col-span-2">
            <Select
              value={settings.entree}
              onChange={(e) => patch({ entree: e.target.value as EntreeType })}
            >
              {Object.entries(ENTREES_TXT).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ligne">
            <Select
              value={settings.ligne}
              onChange={(e) => patch({ ligne: e.target.value as LigneType })}
            >
              {Object.entries(LIGNES_TXT).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Période">
            <NumberInput
              min={2}
              max={200}
              value={settings.periode}
              onChange={(e) => patch({ periode: Number(e.target.value) })}
            />
          </Field>
          <Field label="Unité">
            <Select
              value={settings.ut}
              onChange={(e) => patch({ ut: e.target.value as Timeframe })}
            >
              {UT.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Blueprint>

      <Blueprint className="flex flex-col gap-4 p-5">
        <div className="kicker">Sortie et risque</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stop ( % )">
            <NumberInput
              min={0.1}
              max={20}
              step={0.1}
              value={settings.sl}
              onChange={(e) => patch({ sl: Number(e.target.value) })}
            />
          </Field>
          <Field label="Objectif (R)">
            <NumberInput
              min={0.5}
              max={10}
              step={0.5}
              value={settings.rr}
              onChange={(e) => patch({ rr: Number(e.target.value) })}
            />
          </Field>
          <Field label="Capital (€)">
            <NumberInput
              min={500}
              max={10000000}
              step={500}
              value={settings.capital}
              onChange={(e) => patch({ capital: Number(e.target.value) })}
            />
          </Field>
          <Field label="Risque / trade (%)">
            <NumberInput
              min={0.1}
              max={5}
              step={0.1}
              value={settings.risquePct}
              onChange={(e) => patch({ risquePct: Number(e.target.value) })}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">
          1 R = {EUR.format(euroR)} sur ce compte. Le pire creux sera aussi converti.
        </p>
        <CheckRow checked={settings.be} onChange={(v) => patch({ be: v })}>
          Sécuriser le trade (break-even / trailing)
        </CheckRow>
        {settings.be ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" className="col-span-2">
              <Select
                value={settings.typeSecu}
                onChange={(e) => patch({ typeSecu: e.target.value as SecuType })}
              >
                <option value="be_progressif">Break-even progressif</option>
                <option value="trailing">Trailing</option>
              </Select>
            </Field>
            {settings.typeSecu === "trailing" ? (
              <Field label="Distance (%)" className="col-span-2">
                <NumberInput
                  min={0.2}
                  max={10}
                  step={0.1}
                  value={settings.trailingPct}
                  onChange={(e) => patch({ trailingPct: Number(e.target.value) })}
                />
              </Field>
            ) : (
              <>
                <Field label="Seuil 1 (%)">
                  <NumberInput
                    value={settings.beSeuil1}
                    onChange={(e) => patch({ beSeuil1: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Niveau 1 (% vers TP)">
                  <NumberInput
                    value={settings.beNiveau1}
                    onChange={(e) => patch({ beNiveau1: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Seuil 2 (%)">
                  <NumberInput
                    value={settings.beSeuil2}
                    onChange={(e) => patch({ beSeuil2: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Niveau 2 (% vers TP)">
                  <NumberInput
                    value={settings.beNiveau2}
                    onChange={(e) => patch({ beNiveau2: Number(e.target.value) })}
                  />
                </Field>
              </>
            )}
          </div>
        ) : null}
      </Blueprint>

      <Blueprint className="flex flex-col gap-3 p-5">
        <div className="kicker">Filtres</div>
        <CheckRow checked={settings.mtf} onChange={(v) => patch({ mtf: v })}>
          Tendance d’unité supérieure
        </CheckRow>
        {settings.mtf ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="UT">
              <Select
                value={settings.utMtf}
                onChange={(e) => patch({ utMtf: e.target.value as Timeframe })}
              >
                {UT.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </Field>
            <Field label="Ligne">
              <Select
                value={settings.ligneMtf}
                onChange={(e) => patch({ ligneMtf: e.target.value as LigneType })}
              >
                {Object.entries(LIGNES_TXT).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Période">
              <NumberInput
                value={settings.periodeMtf}
                onChange={(e) => patch({ periodeMtf: Number(e.target.value) })}
              />
            </Field>
          </div>
        ) : null}
        <CheckRow checked={settings.horaire} onChange={(v) => patch({ horaire: v })}>
          Fenêtre horaire (UTC)
        </CheckRow>
        {settings.horaire ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Début (min)">
              <NumberInput
                value={settings.hDebut}
                onChange={(e) => patch({ hDebut: Number(e.target.value) })}
              />
            </Field>
            <Field label="Fin (min)">
              <NumberInput
                value={settings.hFin}
                onChange={(e) => patch({ hFin: Number(e.target.value) })}
              />
            </Field>
          </div>
        ) : null}
        <CheckRow checked={settings.fRsi} onChange={(v) => patch({ fRsi: v })}>
          RSI au-dessus d’un seuil
        </CheckRow>
        {settings.fRsi ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="UT">
              <Select
                value={settings.utRsi}
                onChange={(e) => patch({ utRsi: e.target.value as Timeframe })}
              >
                {UT.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </Field>
            <Field label="Période">
              <NumberInput
                value={settings.periodeRsi}
                onChange={(e) => patch({ periodeRsi: Number(e.target.value) })}
              />
            </Field>
            <Field label="Seuil">
              <NumberInput
                value={settings.fRsiSeuil}
                onChange={(e) => patch({ fRsiSeuil: Number(e.target.value) })}
              />
            </Field>
          </div>
        ) : null}
        <CheckRow checked={settings.fAdx} onChange={(v) => patch({ fAdx: v })}>
          ADX (marché directionnel)
        </CheckRow>
        {settings.fAdx ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="UT">
              <Select
                value={settings.utAdx}
                onChange={(e) => patch({ utAdx: e.target.value as Timeframe })}
              >
                {UT.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </Field>
            <Field label="Période">
              <NumberInput
                value={settings.periodeAdx}
                onChange={(e) => patch({ periodeAdx: Number(e.target.value) })}
              />
            </Field>
            <Field label="Seuil">
              <NumberInput
                value={settings.fAdxSeuil}
                onChange={(e) => patch({ fAdxSeuil: Number(e.target.value) })}
              />
            </Field>
          </div>
        ) : null}
        <CheckRow checked={settings.fNuage} onChange={(v) => patch({ fNuage: v })}>
          Prix au-dessus du nuage Ichimoku
        </CheckRow>
        <CheckRow checked={settings.fPente} onChange={(v) => patch({ fPente: v })}>
          Pente de la ligne (H4 par défaut)
        </CheckRow>
        <CheckRow checked={settings.fPivot} onChange={(v) => patch({ fPivot: v })}>
          Au-dessus du pivot quotidien
        </CheckRow>
        <CheckRow checked={settings.fResist} onChange={(v) => patch({ fResist: v })}>
          Sous une résistance récente
        </CheckRow>
        <CheckRow checked={settings.frais} onChange={(v) => patch({ frais: v })}>
          Appliquer spread / swap saisis
        </CheckRow>
        {settings.frais ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Spread (%)">
              <NumberInput
                step={0.01}
                value={settings.spreadSaisi}
                onChange={(e) => patch({ spreadSaisi: Number(e.target.value) })}
              />
            </Field>
            <Field label="Swap annuel (%)">
              <NumberInput
                step={0.1}
                value={settings.swapSaisi}
                onChange={(e) => patch({ swapSaisi: Number(e.target.value) })}
              />
            </Field>
          </div>
        ) : null}
      </Blueprint>
    </div>
  );
}
