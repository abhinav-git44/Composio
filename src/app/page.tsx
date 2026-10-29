import { LibraryClient } from "@/components/LibraryClient";
import { EvidenceLegend } from "@/components/Badges";
import { liveMode } from "@/lib/generate";
import { libraryCards } from "@/lib/guides";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { curated, generated } = await libraryCards();
  return (
    <>
      <h1>How long until your users can connect?</h1>
      <p className="lede">
        Before an AI agent can act in someone&apos;s Gmail, Slack or GitHub, you usually need your own OAuth app, and sometimes
        the provider&apos;s approval. Each guide tells you how hard that is, how long you&apos;ll wait, what can block you, and
        what an agent can do for you.
      </p>
      <LibraryClient curated={curated} generated={generated} mode={liveMode()} durable={getStore().durable} />
      <section className="panel" aria-labelledby="legend-h">
        <h2 id="legend-h">How to read the evidence labels</h2>
        <EvidenceLegend />
      </section>
    </>
  );
}
