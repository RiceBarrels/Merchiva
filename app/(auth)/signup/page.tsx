"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, Loader2 } from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { business_name: businessName },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If email confirmation is disabled in Supabase, user is logged in immediately
    if (data.session) {
      const userId = data.user!.id;
      const orgName = businessName || email.split("@")[0];

      // Create initial settings row
      await supabase.from("settings").upsert({
        user_id: userId,
        business_name: businessName,
      });

      // Create organization + owner membership
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({ owner_id: userId, name: orgName })
        .select("id")
        .single();

      if (!orgError && org) {
        await supabase.from("org_members").insert({
          organization_id: org.id,
          user_id: userId,
          role: "owner",
          display_name: businessName || email.split("@")[0],
          permissions: {
            dashboard: { view: true },
            inventory: { view: true, edit: true },
            sales: { view: true },
            staffing: { view: true, edit: true },
            products: { view: true, edit: true },
            settings: { view: true },
          },
          status: "active",
        });

        // Check for pending invitation (edge case: owner signed up via invite link)
        const { data: invitation } = await supabase
          .from("org_invitations")
          .select("*")
          .eq("email", email.toLowerCase())
          .is("accepted_at", null)
          .gt("expires_at", new Date().toISOString())
          .limit(1)
          .single();

        if (invitation) {
          await supabase
            .from("org_invitations")
            .update({ accepted_at: new Date().toISOString() })
            .eq("id", invitation.id);
        }
      }

      router.push("/dashboard");
      router.refresh();
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="w-full max-w-sm shadow-lg text-center">
        <CardContent className="pt-8 pb-8 space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 mx-auto">
            <Zap className="h-6 w-6 text-emerald-600" />
          </div>
          <h2 className="font-bold text-lg">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <Link href="/login" className="text-sm font-medium underline underline-offset-4 text-muted-foreground">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-base leading-none">BizOps</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">AI Business Manager</p>
          </div>
        </div>
        <div>
          <CardTitle className="text-xl">Create account</CardTitle>
          <CardDescription>Start managing your business with AI</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="business">Business Name</Label>
            <Input
              id="business"
              placeholder="My Coffee Shop"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              autoComplete="organization"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
