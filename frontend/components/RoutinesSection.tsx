"use client";

import { useMemo, useState } from "react";
import { PRESET_ROUTINES, EXERCISES } from "@/lib/data";
import type { Routine, RoutineExercise } from "@/lib/data";
import { uid } from "@/lib/utils";

export default function RoutinesSection() {
  const [routines, setRoutines] = useState<Routine[]>(PRESET_ROUTINES);
  const [selected, setSelected] = useState<string>(PRESET_ROUTINES[0].id);
  const [building, setBuilding] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Routine>({ id: "", name: "", tags: [], exercises: [] });

  const filteredRoutines = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return routines;
    return routines.filter((r) => r.name.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q)));
  }, [query, routines]);

  const routine = routines.find((r) => r.id === selected);

  const startNew = () => {
    setDraft({ id: uid(), name: "", tags: [], exercises: [] });
    setBuilding(true);
  };

  const saveDraft = () => {
    if (!draft.name.trim()) return;
    setRoutines((prev) => [draft, ...prev]);
    setSelected(draft.id);
    setBuilding(false);
  };

  const addDraftExercise = () => {
    setDraft((d) => ({
      ...d,
      exercises: [...d.exercises, { id: uid(), name: EXERCISES[0], sets: 3, reps: 8, rest: "2 min", notes: "" }],
    }));
  };

  const updateDraftEx = (id: string, field: keyof RoutineExercise, value: string | number) => {
    setDraft((d) => ({ ...d, exercises: d.exercises.map((ex) => (ex.id === id ? { ...ex, [field]: value } : ex)) }));
  };

  const removeDraftEx = (id: string) => {
    setDraft((d) => ({ ...d, exercises: d.exercises.filter((ex) => ex.id !== id) }));
  };

  return (
    <section className="section" id="routines">
      <div className="container">
        <div className="section-hdr" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 30, lineHeight: 1.1 }}>Routines</h1>
            <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 14 }}>Find routines quickly, build new plans, and jump into your tracker session in one click.</p>
          </div>
          {!building && <button className="btn-primary" onClick={startNew}>+ Build Routine</button>}
        </div>

        {building ? (
          <RoutineBuilder
            draft={draft} setDraft={setDraft} onSave={saveDraft}
            onCancel={() => setBuilding(false)}
            addExercise={addDraftExercise} updateEx={updateDraftEx} removeEx={removeDraftEx}
          />
        ) : (
          <div className="routines-grid" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".06em", textTransform: "uppercase" }}>
                My Routines ({routines.length})
              </div>
              <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
                <label className="label" htmlFor="routine-search">Search</label>
                <input
                  id="routine-search"
                  type="text"
                  placeholder="Name or tag"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search routines by name or tag"
                />
              </div>
              {filteredRoutines.map((r) => (
                <button key={r.id} onClick={() => setSelected(r.id)} aria-current={selected === r.id ? "true" : undefined} style={{ width: "100%", textAlign: "left", background: selected === r.id ? "var(--lav-d)" : "none", border: "none", borderLeft: selected === r.id ? "3px solid var(--lav)" : "3px solid transparent", borderBottom: "1px solid var(--border)", padding: "13px 16px", cursor: "pointer", transition: "background .15s" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>{r.name}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    {r.tags.map((t) => <span key={t} className="tag tag-lav">{t}</span>)}
                  </div>
                </button>
              ))}
              {filteredRoutines.length === 0 && (
                <div style={{ padding: 16, color: "var(--muted)", fontSize: 13 }}>No routines match “{query}”.</div>
              )}
            </div>

            {routine && (
              <div className="card" style={{ overflow: "hidden" }}>
                <div style={{ padding: "20px 28px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 700 }}>{routine.name}</h3>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {routine.tags.map((t) => <span key={t} className="tag tag-lav">{t}</span>)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-ghost" style={{ fontSize: 13 }}>Export</button>
                    <a className="btn-primary" style={{ fontSize: 13, textDecoration: "none", display: "inline-flex", alignItems: "center" }} href="/tracker">
                      Start in Tracker →
                    </a>
                  </div>
                </div>
                <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {routine.exercises.map((ex, i) => (
                    <div key={ex.id} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 16, padding: "16px 20px", background: "var(--off)", borderRadius: 10, alignItems: "start" }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--lav)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{ex.name}</div>
                        {ex.notes && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{ex.notes}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{ex.sets}×{ex.reps}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Rest: {ex.rest}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function RoutineBuilder({ draft, setDraft, onSave, onCancel, addExercise, updateEx, removeEx }: {
  draft: Routine;
  setDraft: React.Dispatch<React.SetStateAction<Routine>>;
  onSave: () => void;
  onCancel: () => void;
  addExercise: () => void;
  updateEx: (id: string, field: keyof RoutineExercise, value: string | number) => void;
  removeEx: (id: string) => void;
}) {
  return (
    <div className="card" style={{ overflow: "hidden", animation: "fadeUp .3s ease both" }}>
      <div style={{ padding: "20px 28px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <input type="text" placeholder="Routine name…" value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            style={{ fontSize: 18, fontWeight: 700, border: "none", background: "none", outline: "none", width: "100%", color: "var(--navy)" }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={onCancel} style={{ fontSize: 13 }}>Cancel</button>
          <button className="btn-primary" onClick={onSave} disabled={!draft.name.trim()} style={{ fontSize: 13 }}>Save Routine</button>
        </div>
      </div>
      <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
        {draft.exercises.map((ex, i) => (
          <div key={ex.id} style={{ background: "var(--off)", borderRadius: 10, padding: "14px 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 12, alignItems: "center", marginBottom: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--lav)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{i + 1}</div>
              <select value={ex.name} onChange={(e) => updateEx(ex.id, "name", e.target.value)} style={{ fontWeight: 600, fontSize: 14 }}>
                {EXERCISES.map((e) => <option key={e}>{e}</option>)}
              </select>
              <button onClick={() => removeEx(ex.id)} aria-label={`Remove exercise ${i + 1}`} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 8 }}>
              {(["sets", "reps"] as const).map((field) => (
                <div key={field}>
                  <label className="label">{field}</label>
                  <input type="number" value={ex[field]} min={1} onChange={(e) => updateEx(ex.id, field, +e.target.value)} style={{ textAlign: "center" }} />
                </div>
              ))}
              <div>
                <label className="label">Rest</label>
                <input type="text" value={ex.rest} onChange={(e) => updateEx(ex.id, "rest", e.target.value)} />
              </div>
              <div>
                <label className="label">Notes</label>
                <input type="text" value={ex.notes} placeholder="optional" onChange={(e) => updateEx(ex.id, "notes", e.target.value)} />
              </div>
            </div>
          </div>
        ))}
        <button className="btn-ghost" style={{ width: "100%", padding: "13px" }} onClick={addExercise}>+ Add Exercise</button>
      </div>
    </div>
  );
}
