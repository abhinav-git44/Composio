"use client";

import { useState } from "react";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers/contexts without the async clipboard API.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function GuideActions({ title, markdown }: { title: string; markdown: string }) {
  const [msg, setMsg] = useState("");
  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(""), 2500);
  };
  const url = () => window.location.href.split("#")[0];

  return (
    <div className="actions no-print" aria-label="Guide actions">
      <button type="button" className="btn btn-sm" onClick={async () => flash((await copyText(url())) ? "Link copied" : "Copy failed")}>
        Copy link
      </button>
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => {
          if (navigator.share) {
            try {
              await navigator.share({ title, url: url() });
              return;
            } catch (e) {
              if ((e as Error).name === "AbortError") return;
            }
          }
          flash((await copyText(url())) ? "Link copied (sharing not supported here)" : "Copy failed");
        }}
      >
        Share
      </button>
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => flash((await copyText(markdown.replace("{{URL}}", url()))) ? "Markdown copied" : "Copy failed")}
      >
        Copy as Markdown
      </button>
      <button type="button" className="btn btn-sm" onClick={() => window.print()}>
        Print / PDF
      </button>
      <span className="toast" role="status" aria-live="polite">
        {msg}
      </span>
    </div>
  );
}
