/* app/page.tsx */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PantrySelection, Recipe } from "@/lib/types";
import { cn, cuisines, buildShareUrl, normalizeIngredients } from "@/lib/utils";
import { pantryGroups } from "@/lib/pantry";

/* ----------------------------- UI: Modal ------------------------------ */

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
            aria-label="Modal schließen"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ----------------------------- Seite --------------------------------- */

export default function HomePage() {
  // Tabs
  const [activeTab, setActiveTab] = useState<"generator" | "suche" | "share">(
    "generator"
  );

  // ************ FIX 1: Allergien sauber koppeln (auto vs. manuell) ************
  type Diet =
    | "auto"
    | "vegetarisch"
    | "vegan"
    | "glutenfrei"
    | "proteinreich"
    | "kalorienarm"
    | "carnivor";
  const [diet, setDiet] = useState<Diet>("auto");

  const ALLERGENS = [
    "Gluten",
    "Laktose",
    "Eier",
    "Soja",
    "Erdnüsse",
    "Schalenfrüchte",
    "Fisch",
    "Krebstiere",
    "Sesam",
    "Senf",
    "Sellerie",
  ] as const;
  type AllergenKey = typeof ALLERGENS[number];

  // manuelle & automatische Allergien getrennt halten
  const [manualAllergies, setManualAllergies] = useState<Set<AllergenKey>>(new Set());
  const [autoAllergies, setAutoAllergies] = useState<Set<AllergenKey>>(new Set());

  // Portionen
  const [servings, setServings] = useState<number>(3);

  // Küche (ein Select / mit Liste)
  const [selectedCuisine, setSelectedCuisine] = useState<string>("auto");
  const cuisineOptions = useMemo(() => ["auto", ...cuisines], []);

  // Zubereitungsmodus
  const [mode, setMode] = useState<"auto" | "einfach" | "traditionell" | "mealprep">("auto");

  // Generator-spezifisch
  const [pantry, setPantry] = useState<PantrySelection>({});
  const [pantryQuery, setPantryQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [extraText, setExtraText] = useState<string>("");

  // Suche-spezifisch
  const [query, setQuery] = useState<string>("");

  // Ergebnis / Status
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal: Haushalt teilen
  const [shareOpen, setShareOpen] = useState(false);

  /* --------- Pantry: LocalStorage laden / Share-Import übernehmen ---------- */

  const LS_KEY = "pantry";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setPantry(JSON.parse(raw));
    } catch {}
  }, []);

  // share=? aus URL übernehmen und dauerhaft speichern
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const qs = url.searchParams.get("share");
      if (!qs) return;
      const parsed = JSON.parse(decodeURIComponent(qs));
      if (parsed && typeof parsed === "object") {
        setPantry(parsed);
        localStorage.setItem(LS_KEY, JSON.stringify(parsed));
      }
      url.searchParams.delete("share");
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      console.error("Share-Import failed:", e);
    }
  }, []);

  // Pantry speichern
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(pantry));
    } catch {}
  }, [pantry]);

  /* -------------- FIX 1: Allergie-Logik: mit Ernährung koppeln ------------------ */

  function computeAutoAllergies(d: Diet): Set<AllergenKey> {
    const s = new Set<AllergenKey>();
    if (d === "vegan") {
      s.add("Eier");
      s.add("Laktose");
      s.add("Fisch");
      s.add("Krebstiere");
    } else if (d === "vegetarisch") {
      s.add("Fisch");
      s.add("Krebstiere");
    } else if (d === "glutenfrei") {
      s.add("Gluten");
    } // proteinreich/kalorienarm/carnivor/auto → keine Auto-Allergien
    return s;
  }

  // Ernährungswechsel -> autoAllergies neu setzen/entfernen
  useEffect(() => {
    setAutoAllergies(computeAutoAllergies(diet));
  }, [diet]);

  const allAllergies: AllergenKey[] = ALLERGENS as AllergenKey[];

  /* --------------------------- Pantry-Filter ------------------------------ */

  const filteredGroups = useMemo(() => {
    const q = pantryQuery.trim().toLowerCase();
    if (!q) return pantryGroups;
    return pantryGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((x) => x.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [pantryQuery]);

  const toggleGroup = (label: string) =>
    setExpandedGroups((p) => ({ ...p, [label]: !p[label] }));

  /* --------------------------- Aktionen ---------------------------------- */

  function resetSettings() {
    setDiet("auto");
    setAutoAllergies(new Set()); // FIX 1: Auto-Flags leeren
    setManualAllergies(new Set()); // Benutzer-Flags zurücksetzen
    setSelectedCuisine("auto");
    setServings(3);
    setMode("auto");
    setExtraText("");
    setQuery("");
  }

  // ************ FIX 2: Zutatenmengen auf Portionen skalieren ************
  function scaleIngredient(
    ing: any,
    fromServings: number | undefined,
    toServings: number
  ) {
    if (!fromServings || fromServings <= 0 || fromServings === toServings) return ing;
    if (typeof ing === "string") return ing; // Strings unverändert
    const factor = toServings / fromServings;
    const amt =
      typeof ing.amount === "number"
        ? Number((ing.amount * factor).toFixed(2))
        : ing.amount;
    return { ...ing, amount: amt };
  }

  async function callGenerate(body: any) {
    setLoading(true);
    setErrorMsg(null);
    setRecipe(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const txt = await res.text();
      if (!res.ok) {
        throw new Error(`Serverfehler ${res.status} – ${txt.slice(0, 160)}`);
      }
      const data = JSON.parse(txt) as Recipe;

      // FIX 2: Nachladen & skalieren
      const baseServ =
        typeof (data as any).servings === "number" ? (data as any).servings : undefined;
      const scaled =
        Array.isArray((data as any).ingredients)
          ? (data as any).ingredients.map((ing: any) =>
              scaleIngredient(ing, baseServ, servings)
            )
          : (data as any).ingredients;

      setRecipe({
        ...data,
        servings, // Anzeige immer die aktuell gewählte Portionszahl
        ingredients: scaled as any,
      });
    } catch (e: any) {
      setErrorMsg(e?.message || "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  function onGenerate() {
    const pantryItems = Object.fromEntries(
      Object.entries(pantry).filter(([, v]) => v)
    );
    const body = {
      mode,
      servings, // FIX 2: gewünschte Portionen mitsenden
      diet,
      allergies: Array.from(new Set([...Array.from(autoAllergies), ...Array.from(manualAllergies)])),
      cuisine: selectedCuisine,
      extra: extraText,
      pantry: pantryItems,
      query: "",
      tab: "generator",
    };
    callGenerate(body);
  }

  function onSearch() {
    const body = {
      mode,
      servings, // FIX 2: gewünschte Portionen mitsenden
      diet,
      allergies: Array.from(new Set([...Array.from(autoAllergies), ...Array.from(manualAllergies)])),
      cuisine: selectedCuisine,
      extra: "",
      pantry: {},
      query,
      tab: "suche",
    };
    callGenerate(body);
  }

  /* ------------------------------ Render --------------------------------- */

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold">AI-Rezeptplattform</h1>
        <nav className="flex gap-2">
          <button
            className={cn(
              "rounded-full px-3 py-1 text-sm border",
              activeTab === "generator" ? "bg-blue-600 text-white" : "bg-white"
            )}
            onClick={() => setActiveTab("generator")}
          >
            Generator
          </button>
          <button
            className={cn(
              "rounded-full px-3 py-1 text-sm border",
              activeTab === "suche" ? "bg-blue-600 text-white" : "bg-white"
            )}
            onClick={() => setActiveTab("suche")}
          >
            Suche
          </button>
          <button
            className="rounded-full px-3 py-1 text-sm border"
            onClick={() => setShareOpen(true)}
          >
            Haushalt teilen
          </button>
        </nav>
      </header>

      {/* Gemeinsame Steuerung */}
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        {/* Zubereitungsmodus */}
        <div>
          <label className="mb-1 block text-sm font-medium">Zubereitung</label>
          <div className="flex flex-wrap gap-2">
            {(["auto", "einfach", "traditionell", "mealprep"] as const).map((m) => (
              <button
                key={m}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  mode === m ? "bg-slate-900 text-white" : "bg-white"
                )}
                onClick={() => setMode(m)}
              >
                {m === "auto"
                  ? "Auto"
                  : m === "einfach"
                  ? "Einfache Zubereitung"
                  : m === "traditionell"
                  ? "Traditionelle Zubereitung"
                  : "Rezept zum Vorkochen"}
              </button>
            ))}
          </div>
        </div>

        {/* Ernährung */}
        <div>
          <label className="mb-1 block text-sm font-medium">Ernährung</label>
          <select
            className="w-full rounded border px-3 py-2"
            value={diet}
            onChange={(e) => setDiet(e.target.value as Diet)} // FIX 1: Diet setzen -> useEffect setzt Auto-Flags
          >
            <option value="auto">Keine Vorgabe</option>
            <option value="vegetarisch">Vegetarisch</option>
            <option value="vegan">Vegan</option>
            <option value="glutenfrei">Glutenfrei</option>
            <option value="proteinreich">Proteinreich</option>
            <option value="kalorienarm">Kalorienarm</option>
            <option value="carnivor">Carnivor</option>
          </select>
        </div>

        {/* Portionen */}
        <div>
          <label className="mb-1 block text-sm font-medium">Portionen</label>
          <input
            type="number"
            min={1}
            className="w-full rounded border px-3 py-2"
            value={servings}
            onChange={(e) => setServings(Math.max(1, Number(e.target.value || 1)))}
          />
        </div>
      </section>

      {/* Allergie-Filter */}
      <section className="mb-6">
        <label className="mb-2 block text-sm font-medium">Allergie-Filter</label>
        <div className="flex flex-wrap gap-3">
          {allAllergies.map((a) => {
            const isAuto = autoAllergies.has(a);
            const isManual = manualAllergies.has(a);
            const checked = isAuto || isManual;
            return (
              <label key={a} className={cn("flex items-center gap-2 text-sm", isAuto && "opacity-70")}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isAuto} // FIX 1: Auto-Flags nicht manuell toggeln
                  onChange={(e) =>
                    setManualAllergies((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(a);
                      else next.delete(a);
                      return next;
                    })
                  }
                />
                <span>
                  {a}
                  {isAuto ? " (automatisch)" : ""}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {/* Küche + Felder je Tab */}
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Küche</label>
          <select
            className="w-full rounded border px-3 py-2"
            value={selectedCuisine}
            onChange={(e) => setSelectedCuisine(e.target.value)}
          >
            {cuisineOptions.map((c) => (
              <option key={c} value={c}>
                {c === "auto" ? "Alle Küchen (Auto)" : c}
              </option>
            ))}
          </select>
        </div>

        {activeTab === "generator" && (
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">
              Zusätzliche Zutaten (Komma getrennt)
            </label>
            <input
              className="w-full rounded border px-3 py-2"
              placeholder="z. B. Kapern, Zitronenabrieb, Petersilie"
              value={extraText}
              onChange={(e) => setExtraText(e.target.value)}
            />
          </div>
        )}

        {activeTab === "suche" && (
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Gericht</label>
            <input
              className="w-full rounded border px-3 py-2"
              placeholder="z. B. Capuns, Semmelknödel, Paella"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
      </section>

      {/* Pantry nur im Generator */}
      {activeTab === "generator" && (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Deine Zutaten{" "}
              <span className="text-xs text-slate-500">(Dinge, die immer vorhanden sind)</span>
            </h2>
            <div className="text-xs text-slate-500">
              wird lokal gespeichert – kein Konto nötig
            </div>
          </div>

          <input
            className="mb-3 w-full rounded border px-3 py-2"
            placeholder="suche und markiere alle Zutaten, die du immer verfügbar hast"
            value={pantryQuery}
            onChange={(e) => setPantryQuery(e.target.value)}
          />

          {/* Akkordeon-Gruppen */}
          <div className="space-y-2">
            {filteredGroups.map((group) => {
              const open = !!expandedGroups[group.label];
              return (
                <div key={group.label} className="rounded-lg border">
                  <button
                    className="flex w-full items-center justify-between px-3 py-2"
                    onClick={() => toggleGroup(group.label)}
                  >
                    <span className="font-medium">{group.label}</span>
                    <span className="text-slate-500">{open ? "−" : "+"}</span>
                  </button>
                  {open && (
                    <div className="border-t px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {group.items.map((item) => {
                          const active = !!pantry[item];
                          return (
                            <button
                              key={item}
                              onClick={() =>
                                setPantry((old) => ({ ...old, [item]: !old[item] }))
                              }
                              className={cn(
                                "rounded-full border px-3 py-1 text-sm",
                                active
                                  ? "border-blue-600 bg-blue-50 text-blue-700"
                                  : "border-slate-300 bg-white"
                              )}
                            >
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Aktionen */}
      <section className="mb-8 flex flex-wrap items-center gap-3">
        {activeTab === "generator" ? (
          <button
            className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
            onClick={onGenerate}
            disabled={loading}
          >
            {loading ? "Erstelle Rezept …" : "Rezept erstellen"}
          </button>
        ) : activeTab === "suche" ? (
          <button
            className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
            onClick={onSearch}
            disabled={loading}
          >
            {loading ? "Suche Rezept …" : "Suche starten"}
          </button>
        ) : null}

        <button
          className="rounded border px-4 py-2"
          onClick={resetSettings}
          title="Setzt Einstellungen zurück – Pantry bleibt erhalten"
          disabled={loading}
        >
          Einstellungen zurücksetzen
        </button>

        <button
          className="rounded border px-4 py-2"
          onClick={() => setShareOpen(true)}
          disabled={loading}
          title="Nur markierte Zutaten teilen"
        >
          Haushalt teilen
        </button>
      </section>

      {/* Ergebnis */}
      {errorMsg && (
        <div className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-red-700">
          {errorMsg}
        </div>
      )}

      {recipe && (
        <article className="space-y-4 rounded border p-4">
          <h2 className="text-xl font-semibold">{recipe.title}</h2>
          <div className="text-sm text-slate-600 space-x-3">
            <span>
              <b>Küche:</b>{" "}
              {selectedCuisine !== "auto" ? selectedCuisine : recipe.cuisine || "—"}
            </span>
            <span>
              <b>Portionen:</b> {recipe.servings}
            </span>
            <span>
              <b>Zeit:</b> ~{(recipe as any).time} Min.
            </span>
          </div>

          {(recipe as any).allergyNote && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              ⚠ {(recipe as any).allergyNote}
            </div>
          )}

          <section>
            <h3 className="mb-2 font-medium">Benötigte Zutaten</h3>
            <ul className="ml-5 list-disc space-y-1">
              {normalizeIngredients((recipe as any).ingredients).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </section>

          {(recipe as any).authentic && (recipe as any).authentic.length > 0 && (
            <section>
              <h3 className="mb-2 font-medium">Optional / Authentizität / Information</h3>
              <ul className="ml-5 list-disc space-y-1">
                {(recipe as any).authentic.map((x: string, i: number) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 font-medium">Zubereitung</h3>
            <ol className="ml-5 list-decimal space-y-1">
              {(recipe as any).steps.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </section>
        </article>
      )}

      <footer className="mt-10 text-center text-xs text-slate-500">
        © Joel Harder • All rights reserved • Version v4.8.1
      </footer>

      {/* Modal: Haushalt teilen */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Haushalt teilen">
        <p className="mb-3 text-sm text-slate-600">
          Teile deine markierten Vorräte mit anderen. Der Link speichert die Auswahl beim Öffnen
          automatisch auf dem Gerät der anderen Person.
        </p>
        <SharePanel pantry={pantry} />
      </Modal>
    </main>
  );
}

/* ----------------------------- Share Panel ------------------------------ */

function SharePanel({ pantry }: { pantry: PantrySelection }) {
  const url = useMemo(() => buildShareUrl(pantry), [pantry]);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("Link kopieren:", url);
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">Link</label>
      <input readOnly className="w-full rounded border px-3 py-2" value={url} />
      <div className="mt-3 flex gap-2">
        <button onClick={copy} className="rounded bg-blue-600 px-4 py-2 text-white">
          {copied ? "Kopiert ✓" : "Link kopieren"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Funktioniert lokal (localhost) und online (Vercel) automatisch mit deiner Domain.
      </p>
    </div>
  );
}
