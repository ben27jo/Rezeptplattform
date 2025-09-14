'use client';
import { useMemo, useState, useEffect } from 'react';
import { PANTRY, PANTRY_GROUPS, PantryItem } from '../lib/pantry';
import { CUISINES } from '../lib/cuisines';
import type { RecipeRequest, GeneratedRecipe } from '../lib/types';

type Diet = 'Keine Vorgabe'|'Vegetarisch'|'Vegan'|'Pescetarisch'|'Glutenfrei'|'Laktosefrei';
const DIETS: Diet[] = ['Keine Vorgabe','Vegetarisch','Vegan','Pescetarisch','Glutenfrei','Laktosefrei'];

const ALLERGENS = ['Gluten','Laktose','Eier','Soja','Erdnüsse','Nüsse','Sesam','Fisch','Schalentiere','Sellerie','Senf','Lupinen','Weichtiere','Sulfite'];

function dedupe<T>(arr:T[]) { return Array.from(new Set(arr)); }

export default function Generator() {
  const [query, setQuery] = useState<string>('');
  const [cuisine, setCuisine] = useState<string>('Alle Küchen (Auto)');
  const [diet, setDiet] = useState<Diet>('Keine Vorgabe');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [portions, setPortions] = useState<number>(3);
  const [pantrySearch, setPantrySearch] = useState('');
  const [selectedPantry, setSelectedPantry] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('pantry')||'[]'); } catch { return []; }
  });
  const [extra, setExtra] = useState<string>('');
  const [mode, setMode] = useState<'einfach'|'traditionell'|'vorkochen'|undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedRecipe|null>(null);
  const [error, setError] = useState<string|undefined>(undefined);

  useEffect(()=>{
    localStorage.setItem('pantry', JSON.stringify(selectedPantry));
  },[selectedPantry]);

  // Auto-Anpassung Allergene bei Diet
  useEffect(()=>{
    if (diet === 'Vegan') {
      setAllergies(dedupe([...allergies,'Eier','Laktose','Fisch','Schalentiere']));
    } else if (diet === 'Vegetarisch') {
      setAllergies(dedupe([...allergies,'Fisch','Schalentiere']));
    }
  },[diet]);

  // Pantry gefiltert
  const filteredPantry: Record<string,PantryItem[]> = useMemo(()=>{
    const q = pantrySearch.trim().toLowerCase();
    const groups: Record<string,PantryItem[]> = {};
    PANTRY_GROUPS.forEach(g=>groups[g]=[]);
    for (const item of PANTRY) {
      const hay = [item.name, ...(item.aliases||[])].join(' ').toLowerCase();
      if (!q || hay.includes(q)) {
        groups[item.group].push(item);
      }
    }
    return groups;
  },[pantrySearch]);

  function togglePantry(id:string){
    setSelectedPantry(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev,id]);
  }

  function resetSettings(){
    // Allergien & Diet & Küche zurücksetzen, Pantry bleibt
    setDiet('Keine Vorgabe');
    setAllergies([]);
    setCuisine('Alle Küchen (Auto)');
    setMode(undefined);
  }

  async function generateRecipe(){
    try{
      setLoading(true);
      setError(undefined);
      setResult(null);
      const payload: RecipeRequest = {
        query: query || undefined,
        cuisine: cuisine === 'Alle Küchen (Auto)' ? undefined : cuisine,
        portions,
        diet,
        allergies,
        pantryIds: selectedPantry,
        extraIngredients: extra || undefined,
        mode
      };
      const r = await fetch('/api/generate',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Fehler bei der Generierung');
      setResult(data as GeneratedRecipe);
    }catch(e:any){
      setError(e.message || 'Unerwarteter Fehler');
    }finally{
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">AI‑Rezeptplattform</h1>
        <span className="badge">Generator</span>
      </header>

      <div className="card space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Gericht / Idee (optional)</label>
            <input className="input" placeholder="z. B. Capuns, Semmelknödel, Paella" value={query} onChange={e=>setQuery(e.target.value)} />
          </div>
          <div>
            <label className="label">Ernährung</label>
            <select className="input" value={diet} onChange={e=>setDiet(e.target.value as Diet)}>
              {DIETS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Portionen</label>
            <input className="input" type="number" min={1} max={12} value={portions} onChange={e=>setPortions(Math.max(1, Number(e.target.value||1)))} />
          </div>
          <div>
            <label className="label">Küche für Generator</label>
            <select className="input" value={cuisine} onChange={e=>setCuisine(e.target.value)}>
              {CUISINES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-x-2">
            <label className="label block mb-1">Zubereitungsmodus</label>
            <label className="mr-4"><input className="checkbox mr-2" type="checkbox" checked={mode==='einfach'} onChange={()=>setMode(mode==='einfach'?undefined:'einfach')} />Einfache Zubereitung</label>
            <label className="mr-4"><input className="checkbox mr-2" type="checkbox" checked={mode==='traditionell'} onChange={()=>setMode(mode==='traditionell'?undefined:'traditionell')} />Traditionelle Zubereitung</label>
            <label className="mr-4"><input className="checkbox mr-2" type="checkbox" checked={mode==='vorkochen'} onChange={()=>setMode(mode==='vorkochen'?undefined:'vorkochen')} />Rezept zum Vorkochen</label>
            <p className="text-xs text-slate-500 mt-1">Bei „Einfach“ oder „Traditionell“ ist immer nur einer aktiv.</p>
          </div>
          <div>
            <label className="label">Zusätzliche Zutaten (Komma getrennt)</label>
            <input className="input" placeholder="frei; Komma-Zeichen; weitere Zutaten" value={extra} onChange={e=>setExtra(e.target.value)} />
          </div>
          <div>
            <label className="label">Allergie‑Filter</label>
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map(a=>(
                <label key={a} className="badge cursor-pointer">
                  <input className="mr-1 checkbox" type="checkbox"
                    checked={allergies.includes(a)}
                    onChange={()=> setAllergies(prev => prev.includes(a)? prev.filter(x=>x!==a): [...prev,a]) } />
                  {a}
                </label>
              ))}
            </div>
          </div>
        </div>

        <hr />

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <div className="flex-1">
              <label className="label">Deine Zutaten</label>
              <input className="input" placeholder="Grundnahrungsmittel suchen…" value={pantrySearch} onChange={e=>setPantrySearch(e.target.value)} />
              <p className="text-xs text-slate-500 mt-1">Wird lokal gespeichert, kein Konto nötig.</p>
            </div>
            <button className="btn-ghost" onClick={resetSettings}>Einstellungen zurücksetzen</button>
            <button className="btn" onClick={generateRecipe} disabled={loading}>{loading?'Erstelle…':'Rezept erstellen'}</button>
          </div>

          <div className="grid md:grid-cols-2 gap-3 max-h-96 overflow-auto pr-1">
            {PANTRY_GROUPS.map(g=>(
              <div key={g} className="border border-slate-200 rounded-xl p-3">
                <div className="section-title">{g}</div>
                <div className="flex flex-wrap gap-2">
                  {filteredPantry[g].map(item=>{
                    const checked = selectedPantry.includes(item.id);
                    return (
                      <label key={item.id} className={`badge cursor-pointer ${checked?'!bg-sky-100 !text-sky-800 !border-sky-300':''}`}>
                        <input className="mr-1 checkbox" type="checkbox" checked={checked} onChange={()=>togglePantry(item.id)} />
                        {item.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="card bg-red-50 border-red-200 text-red-800">{error}</div>}
      {result && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold">{result.title}</h2>
            <div className="flex gap-2">
              <span className="badge">{result.cuisine}</span>
              <span className="badge">Portionen: {result.portions}</span>
              <span className="badge">Zeit: ~{result.timeMinutes} Min.</span>
              <span className="badge">Stufe: {result.difficulty}</span>
            </div>
          </div>

          {typeof result.caloriesPerPortion === 'number' && <p className="text-sm mb-2">Kalorien/Portion: ~{result.caloriesPerPortion}</p>}

          {!!(result.allergenNotes?.length) && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              ⚠️ {result.allergenNotes.join(' • ')}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="section-title">Benötigte Zutaten</div>
              <ul className="list-disc pl-5 space-y-1">
                {result.ingredients.map((ing,idx)=>(
                  <li key={idx}>{[ing.amount, ing.unit, ing.item].filter(Boolean).join(' ')}
                    {ing.note?` (${ing.note})`:''}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="section-title">Zubereitung</div>
              <ol className="list-decimal pl-5 space-y-1">
                {result.steps.map((s,idx)=>(<li key={idx}>{s}</li>))}
              </ol>
            </div>
          </div>

          {!!(result.authenticityTips?.length) && (
            <div className="mt-4">
              <div className="section-title">Optionale Tipps / Authentizität</div>
              <ul className="list-disc pl-5 space-y-1">
                {result.authenticityTips.map((t,idx)=>(<li key={idx}>{t}</li>))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
