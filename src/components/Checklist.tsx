"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Per-viewer progress through the prerequisites. Stored in this browser only. */
export function Checklist({ storageKey, items }: { storageKey: string; items: { id: string; content: ReactNode }[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from browser storage after mount
      if (raw) setDone(JSON.parse(raw));
    } catch {
      /* storage unavailable */
    }
  }, [storageKey]);

  const toggle = (id: string, v: boolean) => {
    setDone((d) => {
      const next = { ...d, [id]: v };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  const count = items.filter((i) => done[i.id]).length;
  return (
    <>
      <p className="small muted" aria-live="polite" data-testid="checklist-count">
        {count} of {items.length} ready
      </p>
      <ul className="checklist">
        {items.map((i) => (
          <li key={i.id}>
            <label>
              <input type="checkbox" checked={!!done[i.id]} onChange={(e) => toggle(i.id, e.target.checked)} />
              <span>{i.content}</span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}
