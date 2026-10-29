"use client";

import { useState } from "react";
import { recommend, type Needs } from "@/lib/recommend";
import type { Guide } from "@/lib/schema";

const TOGGLES: { key: keyof Needs; label: string }[] = [
  { key: "production", label: "Real customers, not just a prototype" },
  { key: "ownBranding", label: "Users must see my app name on the consent screen" },
  { key: "customScopes", label: "I need scopes beyond the defaults" },
  { key: "dedicatedQuota", label: "I need my own rate-limit quota" },
];

export function Recommender({ guide }: { guide: Pick<Guide, "appName" | "composioManaged" | "approval" | "difficulty"> }) {
  const [needs, setNeeds] = useState<Needs>({ production: false, ownBranding: false, customScopes: false, dedicatedQuota: false });
  const rec = recommend(guide, needs);
  return (
    <section className="panel recommend" aria-labelledby="rec-h" data-testid="recommender">
      <h2 id="rec-h">Managed OAuth or your own app?</h2>
      <p className="muted small">
        A managed OAuth app (for example Composio&apos;s) lets users connect without you registering anything. Your own app
        gives you your branding, scopes and quota, at the cost of the setup below.
      </p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small muted">Tick what applies to you:</legend>
        <div className="toggles">
          {TOGGLES.map((t) => (
            <label key={t.key}>
              <input
                type="checkbox"
                checked={needs[t.key]}
                onChange={(e) => setNeeds((n) => ({ ...n, [t.key]: e.target.checked }))}
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <p aria-live="polite" data-testid="rec-headline" data-choice={rec.choice}>
        <strong>{rec.headline}</strong>
      </p>
      {rec.reasons.length ? (
        <ul className="claims small">
          {rec.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
