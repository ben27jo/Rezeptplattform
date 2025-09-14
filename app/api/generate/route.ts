import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { PantrySelection, Recipe } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tab: "generator" | "suche";
      mode: "auto" | "einfach" | "traditionell" | "mealprep";
      servings: number;
      diet:
        | "auto"
        | "vegetarisch"
        | "vegan"
        | "glutenfrei"
        | "proteinreich"
        | "kalorienarm"
        | "carnivor";
      allergies: string[];
      cuisine: string; // "auto" oder Name
      extra: string;
      pantry: PantrySelection;
      query: string;
    };

    const useAI = !!process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Heuristik: ist das Gericht komplex?
    const complexHints = [
      "beef wellington", "wellington",
      "biryani", "ramen", "pho", "mole",
      "coq au vin", "cassoulet", "paella",
      "sauerteig", "cannoli", "croissant", "pastéis de nata",
      "bibimbap", "pekingente", "duck à l'orange",
      "tamales", "barbacoa", "osso buco",
    ];
    const qText = (body.query || "").toLowerCase();
    const isComplex =
      body.mode === "traditionell" ||
      complexHints.some((k) => qText.includes(k));

    const detailDirective = isComplex
      ? "Liefere 20–40 präzise Schritte mit genauen Zeiten/Temperaturen, Ruhezeiten, Komponenten getrennt (z. B. Teig/Füllung/Sauce). Führe auch Profi-Tipps, häufige Fehlerquellen und Anrichtungs-Hinweise auf."
      : body.mode === "einfach"
      ? "Gib ein kurzes, korrektes Rezept mit wenigen essenziellen Schritten (keine unnötigen Details)."
      : "Gib 8–16 klare, präzise Schritte.";

    const baseHints = [
      detailDirective,
      body.mode === "mealprep"
        ? "Auf Meal-Prep optimieren: 3–4 Tage haltbar, Hinweise zu Lagerung und Aufwärmen angeben."
        : null,
      body.diet !== "auto" ? `Ernährung berücksichtigen: ${body.diet}.` : null,
      body.allergies.length ? `Vermeide Allergene: ${body.allergies.join(", ")}.` : null,
      "Antworte ausschließlich mit **purem JSON** (ohne Markdown, ohne Erklärungen).",
      `Schema: {
        "title": string,
        "cuisine": string,
        "servings": number,
        "time": number,
        "ingredients": string[],
        "authentic": string[],
        "steps": string[],
        "allergyNote": string | null
      }`,
      "Bei 'authentic' nur Dinge aufführen, die im Rezept wirklich verwendet werden.",
      "Setze 'cuisine' niemals auf 'Fusion', wenn eine klare Küche erkennbar ist oder gewählt wurde.",
    ]
      .filter(Boolean)
      .join(" ");

    const prompt =
      body.tab === "suche" && body.query
        ? `Erzeuge ein Rezept für: "${body.query}". ${baseHints}`
        : `Erzeuge ein Rezept anhand des Haushalts und Vorgaben.
Haushalt: ${Object.keys(body.pantry).filter((k) => body.pantry[k]).join(", ") || "(leer)"}.
Zusätzliche Zutaten: ${body.extra || "(keine)"}.
Küche: ${body.cuisine === "auto" ? "(automatisch wählen)" : body.cuisine}.
Portionen: ${body.servings}.
${baseHints}`;

    let result: Recipe;

    if (useAI) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
      const r = await client.responses.create({
        model,
        temperature: isComplex ? 0.5 : 0.6,
        input: [
          {
            role: "system",
            content:
              "Du bist ein weltklasse Chefkoch und Food-Redakteur. Antworte ausschließlich mit gültigem JSON nach Schema.",
          },
          { role: "user", content: prompt },
        ],
      });

      const raw =
        r.output_text?.trim() ||
        (r.output?.[0] as any)?.content?.[0]?.text?.trim() ||
        "";

      const jsonText = extractJson(raw);
      const parsed = JSON.parse(jsonText);
      result = normalizeRecipe(parsed, body);
    } else {
      // Fallback
      const title =
        (body.tab === "suche" && body.query.trim()) ||
        (body.cuisine !== "auto" ? `${body.cuisine} Hausrezept` : "Hausrezept");

      const baseIng = ["2 EL Öl", "1 Zwiebel, fein", "1 Knoblauchzehe, gehackt"];
      const extras =
        body.tab === "generator" && body.extra
          ? body.extra.split(",").map((s) => s.trim()).filter(Boolean)
          : [];

      result = {
        title,
        cuisine: body.cuisine !== "auto" ? body.cuisine : title.includes("Hausrezept") ? "International" : body.cuisine,
        servings: Math.max(1, body.servings || 2),
        time: body.mode === "einfach" ? 20 : isComplex ? 120 : 40,
        ingredients: [...baseIng, ...extras],
        authentic: body.mode === "traditionell" ? ["Regionale Originalzutaten berücksichtigen"] : [],
        steps:
          body.mode === "einfach"
            ? [
                "Öl erhitzen, Zwiebel anschwitzen, Knoblauch kurz mitdünsten.",
                "Hauptzutaten zugeben, würzen, kurz garen.",
                "Abschmecken und servieren.",
              ]
            : isComplex
            ? [
                "Mise en Place vollständig vorbereiten.",
                "Basis ansetzen (Fond/Teig/Sauce) und nach Rezept weiterführen.",
                "Garen, ruhen lassen, finalisieren und anrichten.",
              ]
            : [
                "Mise en Place: Zutaten vorbereiten.",
                "Öl erhitzen, Zwiebel glasig, Knoblauch kurz mitdünsten.",
                "Hauptzutaten zugeben und 15–25 Min. garen.",
                "Mit Kräutern/Gewürzen abschmecken, servieren.",
              ],
        allergyNote: body.allergies.length ? body.allergies.join(", ") : null,
      };
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unbekannter Fehler" }, { status: 500 });
  }
}

/* ------------------------ Helfer-Funktionen ----------------------------- */

function extractJson(text: string): string {
  const fence = text.match(/```json([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return text.slice(first, last + 1);
  return text;
}

function normalizeRecipe(
  parsed: any,
  body: { cuisine: string; servings: number }
): Recipe {
  const ingredients: string[] = Array.isArray(parsed.ingredients)
    ? parsed.ingredients.map((x: any) =>
        typeof x === "string"
          ? x
          : typeof x === "object" && x
          ? [x.amount, x.unit, x.item].filter(Boolean).join(" ") + (x.note ? ` (${x.note})` : "")
          : String(x)
      )
    : [];

  const cuisine = body.cuisine !== "auto" ? body.cuisine : parsed.cuisine || "International";

  return {
    title: parsed.title || "Rezept",
    cuisine,
    servings: Number(parsed.servings || body.servings || 2),
    time: Number(parsed.time || 30),
    ingredients,
    authentic: Array.isArray(parsed.authentic) ? parsed.authentic : [],
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
    allergyNote: typeof parsed.allergyNote === "string" ? parsed.allergyNote : null,
  };
}

