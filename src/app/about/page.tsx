import type { Metadata } from "next";
import { EvidenceLegend } from "@/components/Badges";

export const metadata: Metadata = { title: "How it works" };

export default function About() {
  return (
    <article>
      <h1>How OAuth Compass works</h1>
      <section className="panel">
        <h2>The problem</h2>
        <p>
          When your AI agent acts in a user&apos;s Gmail or Slack, it does so through an <strong>OAuth app</strong> registered
          with that provider. A managed app (for example Composio&apos;s) lets you start immediately, but production usually
          means registering your own app, for your branding, scopes and quota. Some providers then require review: Google
          for restricted Gmail scopes, Slack for its Marketplace. Those reviews can take weeks and are hard to predict.
        </p>
      </section>
      <section className="panel">
        <h2>What a guide tells you</h2>
        <ul className="claims">
          <li>Difficulty: easy (self-serve), moderate (review for some cases), hard (formal verification) or gated (partner access).</li>
          <li>Your hands-on effort, kept separate from the provider&apos;s approval wait.</li>
          <li>Prerequisites, ordered steps, what triggers review, and common blockers.</li>
          <li>Which steps an agent can do for you and which need you.</li>
          <li>What is still unknown.</li>
        </ul>
      </section>
      <section className="panel">
        <h2>How live generation works</h2>
        <ol className="claims">
          <li>An agent finds and reads the provider&apos;s official developer docs. With Gemini, the server runs the searches and downloads the pages itself, with safeguards against fetching internal addresses, and Gemini reads only what was downloaded. With Claude, Claude&apos;s own web search and fetch tools do this. Either way, the record of what was searched and read comes from the system, not from the model&apos;s claims.</li>
          <li>It submits a structured guide in which every claim carries an evidence label and source IDs.</li>
          <li>
            Code then checks every citation against the pages the agent actually retrieved. Sources it never retrieved are
            dropped. &ldquo;Sourced&rdquo; claims left without a source become inferences. Approval waits that aren&apos;t
            backed by a fetched provider page become &ldquo;unknown&rdquo;. The agent can never mark anything &ldquo;tested&rdquo;.
          </li>
          <li>The guide is saved under a shareable URL and shows its research trace and every correction made.</li>
        </ol>
      </section>
      <section className="panel">
        <h2>Evidence labels</h2>
        <EvidenceLegend />
      </section>
      <section className="panel">
        <h2>Limits</h2>
        <ul className="claims">
          <li>No guide here was produced by actually registering an app with a provider. Nothing is labelled &ldquo;tested&rdquo;.</li>
          <li>Provider policies change; check the source dates.</li>
          <li>Whether Composio offers managed auth for a given app is usually &ldquo;unknown&rdquo;, because its public docs don&apos;t list it.</li>
        </ul>
      </section>
    </article>
  );
}
