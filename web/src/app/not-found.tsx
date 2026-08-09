import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 32,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 6,
          border: "3px solid oklch(0.72 0.18 50)",
          display: "grid",
          placeItems: "center",
          opacity: 0.85,
        }}
      >
        <div style={{ width: 16, height: 16, background: "oklch(0.72 0.18 50)", borderRadius: 2 }} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-code)",
          fontSize: "11px",
          letterSpacing: "0.14em",
          color: "oklch(0.6 0.008 90)",
        }}
      >
        404 · NOT FOUND
      </div>
      <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 650, letterSpacing: "-0.01em" }}>
        This page doesn&apos;t exist
      </h1>
      <p style={{ margin: 0, maxWidth: 380, fontSize: "13.5px", lineHeight: 1.6, color: "oklch(0.66 0.008 90)" }}>
        The address may be mistyped, or the page may have moved.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 6,
          padding: "8px 18px",
          borderRadius: 5,
          border: "1px solid oklch(0.46 0.11 50)",
          background: "oklch(0.29 0.05 50)",
          color: "oklch(0.88 0.1 50)",
          fontSize: "12.5px",
          fontWeight: 550,
        }}
      >
        Back to dashboard
      </Link>
    </main>
  );
}
