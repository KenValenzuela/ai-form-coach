"use client";

import { useState } from "react";
import { EXERCISES } from "@/lib/data";
import { uid, today } from "@/lib/utils";

interface SetEntry { id: string; weight: number; reps: number; rpe: number; }
interface ExerciseEntry { id: string; name: string; sets: SetEntry[]; }
interface Session { id: string; date: string; exercises: ExerciseEntry[]; note: string; }

const DEMO_SESSIONS: Session[] = [
  {
    id: "s1", date: "Apr 21, 2026", note: "Heavy day — PR attempt on squat",
    exercises: [
      { id: "e1", name: "Back Squat", sets: [
        { id: uid(), weight: 185, reps: 5, rpe: 7 },
        { id: uid(), weight: 205, reps: 3, rpe: 8 },
        { id: uid(), weight: 225, reps: 1, rpe: 9.5 },
      ]},
      { id: "e2", name: "Romanian Deadlift", sets: [
        { id: uid(), weight: 135, reps: 8, rpe: 7 },
        { id: uid(), weight: 135, reps: 8, rpe: 7.5 },
      ]},
    ],
  },
  {
    id: "s2", date: "Apr 19, 2026", note: "Form work session",
    exercises: [
      { id: "e3", name: "Back Squat", sets: [
        { id: uid(), weight: 135, reps: 5, rpe: 5 },
        { id: uid(), weight: 155, reps: 5, rpe: 6 },
        { id: uid(), weight: 175, reps: 5, rpe: 7 },
      ]},
    ],
  },
];

function calcVolume(session: Session) {
  return session.exercises.reduce((tot, ex) => tot + ex.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0);
}

export default function TrackerSection() {
  const [sessions, setSessions] = useState<Session[]>(DEMO_SESSIONS);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const currentSession = sessions.find((s) => s.id === activeSession);

  const newSession = () => {
    const s: Session = { id: uid(), date: today(), note: "", exercises: [] };
    setSessions((prev) => [s, ...prev]);
    setActiveSession(s.id);
    setShowAdd(true);
  };

  return (
    <section className="section" id="tracker" style={{ background: "var(--navy)" }}>
      <div className="container">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <button className="btn-primary" onClick={newSession}>+ New Session</button>
        </div>

        <div className="tracker-stats" style={{ display: "flex", gap: 24, marginBottom: 28, flexWrap: "wrap" }}>
          {[
            ["Total Sessions", sessions.length.toString()],
            ["Total Volume", `${(sessions.reduce((t, s) => t + calcVolume(s), 0) / 1000).toFixed(1)}k lbs`],
            ["Exercises Logged", sessions.reduce((t, s) => t + s.exercises.length, 0).toString()],
          ].map(([label, val]) => (
            <div key={label} style={{ flex: 1, minWidth: 140, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "var(--r)", padding: "18px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.38)", letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#FAFAFA", marginTop: 6 }}>{val}</div>
            </div>
          ))}
        </div>

        <div className="tracker-grid" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
          <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "var(--r)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.6)" }}>Sessions</div>
            </div>
            <div style={{ overflowY: "auto", maxHeight: 420 }}>
              {sessions.map((s) => (
                <button key={s.id} onClick={() => { setActiveSession(s.id); setShowAdd(false); }}
                  style={{ width: "100%", textAlign: "left", background: activeSession === s.id ? "rgba(123,104,238,.2)" : "none", border: "none", borderLeft: activeSession === s.id ? "3px solid var(--lav)" : "3px solid transparent", borderBottom: "1px solid rgba(255,255,255,.07)", padding: "14px 18px", cursor: "pointer", transition: "background .15s" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA" }}>{s.date}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 3 }}>
                    {s.exercises.length} exercise{s.exercises.length !== 1 ? "s" : ""} · {(calcVolume(s) / 1000).toFixed(1)}k lbs
                  </div>
                  {s.note && <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", marginTop: 4, fontStyle: "italic" }}>{s.note.slice(0, 40)}{s.note.length > 40 ? "…" : ""}</div>}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "var(--r)", overflow: "hidden" }}>
            {currentSession ? (
              <SessionDetail
                session={currentSession} showAdd={showAdd} setShowAdd={setShowAdd}
                onChange={(updated) => setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))}
              />
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.3)", fontSize: 15 }}>
                Select or create a session
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SessionDetail({ session, showAdd, setShowAdd, onChange }: {
  session: Session;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  onChange: (s: Session) => void;
}) {
  const [newEx, setNewEx] = useState(EXERCISES[0]);

  const addExercise = () => {
    onChange({ ...session, exercises: [...session.exercises, { id: uid(), name: newEx, sets: [] }] });
    setShowAdd(false);
  };

  const addSet = (exId: string) => {
    onChange({ ...session, exercises: session.exercises.map((ex) => ex.id === exId ? { ...ex, sets: [...ex.sets, { id: uid(), weight: 0, reps: 0, rpe: 7 }] } : ex) });
  };

  const updateSet = (exId: string, setId: string, field: keyof SetEntry, value: number) => {
    onChange({ ...session, exercises: session.exercises.map((ex) => ex.id === exId ? { ...ex, sets: ex.sets.map((s) => s.id === setId ? { ...s, [field]: value } : s) } : ex) });
  };

  const removeSet = (exId: string, setId: string) => {
    onChange({ ...session, exercises: session.exercises.map((ex) => ex.id === exId ? { ...ex, sets: ex.sets.filter((s) => s.id !== setId) } : ex) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#FAFAFA" }}>{session.date}</div>
          {session.note && <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 2, fontStyle: "italic" }}>{session.note}</div>}
        </div>
        <button className="btn-primary" style={{ fontSize: 13, padding: "7px 16px" }} onClick={() => setShowAdd(true)}>+ Exercise</button>
      </div>

      <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {session.exercises.length === 0 && !showAdd && (
          <div style={{ color: "rgba(255,255,255,.3)", textAlign: "center", marginTop: 40, fontSize: 14 }}>No exercises yet — add one above</div>
        )}
        {showAdd && (
          <div style={{ background: "rgba(123,104,238,.12)", border: "1.5px solid rgba(123,104,238,.3)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.6)", marginBottom: 10 }}>Add Exercise</div>
            <div className="ex-add-grid" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
              <select value={newEx} onChange={(e) => setNewEx(e.target.value)} style={{ background: "rgba(255,255,255,.08)", color: "#FAFAFA", border: "1.5px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none" }}>
                {EXERCISES.map((ex) => <option key={ex} style={{ color: "var(--navy)" }}>{ex}</option>)}
              </select>
              <button className="btn-primary" style={{ fontSize: 13, padding: "8px 18px" }} onClick={addExercise}>Add</button>
            </div>
          </div>
        )}
        {session.exercises.map((ex) => (
          <div key={ex.id} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#FAFAFA" }}>{ex.name}</div>
              <button style={{ background: "none", border: "none", color: "var(--lav)", fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => addSet(ex.id)}>+ Set</button>
            </div>
            <div style={{ padding: "10px 16px" }}>
              {ex.sets.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.3)", textAlign: "center", padding: "8px 0" }}>No sets yet</div>
              ) : (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 32px", gap: 8, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.3)", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 6 }}>
                    <span>#</span><span>Weight</span><span>Reps</span><span>RPE</span><span></span>
                  </div>
                  {ex.sets.map((s, i) => (
                    <div key={s.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 32px", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,.4)", textAlign: "center" }}>{i + 1}</span>
                      {(["weight", "reps", "rpe"] as const).map((field) => (
                        <input key={field} type="number" value={s[field] || ""} min={0}
                          onChange={(e) => updateSet(ex.id, s.id, field, +e.target.value)}
                          style={{ background: "rgba(255,255,255,.08)", border: "1.5px solid rgba(255,255,255,.12)", borderRadius: 6, padding: "5px 8px", fontSize: 13, color: "#FAFAFA", outline: "none", textAlign: "center", width: "100%" }} />
                      ))}
                      <button onClick={() => removeSet(ex.id, s.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,.25)", cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
