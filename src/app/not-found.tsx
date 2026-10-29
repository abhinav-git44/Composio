import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel">
      <h1>Guide not found</h1>
      <p className="muted">
        This guide doesn&apos;t exist, or it was generated on a deployment without durable storage and has since been cleared.
      </p>
      <p>
        <Link className="btn btn-primary" href="/">
          Browse or generate a guide
        </Link>
      </p>
    </div>
  );
}
