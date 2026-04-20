"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NotebookPen } from "lucide-react";
import {
  finalizeLoginAction,
  recordAuthFailureAction,
} from "@/lib/auth/actions";
import { getBrowserSupabase } from "@/lib/auth/client";
import { normalizeNextPath } from "@/lib/auth/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const supabase = getBrowserSupabase();
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      await recordAuthFailureAction("auth.login.failed", authError.message);
      setError(authError.message);
      setPending(false);
      return;
    }

    const syncError = await finalizeLoginAction();
    if (syncError) {
      console.error("[login] finalizeLoginAction:", syncError);
    }

    const nextPath = normalizeNextPath(searchParams.get("next"), "/notes");
    window.location.replace(nextPath);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand mark */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
            <NotebookPen className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium">Notes</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/sign-up" className="underline underline-offset-4 text-foreground">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
