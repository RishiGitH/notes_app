export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
];

export function GET() {
  const checks = REQUIRED_VARS.map((key) => {
    const val = process.env[key];
    if (!val) return { key, status: "MISSING" };
    // Check for accidental surrounding quotes
    if (val.startsWith('"') || val.startsWith("'"))
      return { key, status: "HAS_QUOTES", first4: val.slice(0, 4) };
    return { key, status: "ok", first4: val.slice(0, 4) + "..." };
  });

  const bad = checks.filter((c) => c.status !== "ok");
  if (bad.length > 0) {
    console.error("[health] env var problems:", JSON.stringify(bad));
  }

  return Response.json({ ok: true, env: checks });
}
