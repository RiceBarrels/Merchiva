"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { ownerPermissions } from "@/lib/db/team";

export default function SetupPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      // If they already have an org, skip setup
      supabase
        .from("org_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data) {
            router.replace("/dashboard");
          } else {
            setChecking(false);
          }
        });
    });
  }, [router]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    const orgName = businessName.trim() || user.email?.split("@")[0] || "My Business";

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ owner_id: user.id, name: orgName })
      .select("id")
      .single();

    if (orgError || !org) {
      setError(orgError?.message ?? "Failed to create organization.");
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase.from("org_members").insert({
      organization_id: org.id,
      user_id: user.id,
      role: "owner",
      display_name: orgName,
      permissions: ownerPermissions(),
      status: "active",
    });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    await supabase.from("settings").upsert({
      user_id: user.id,
      business_name: orgName,
    });

    router.push("/dashboard");
    router.refresh();
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-stone-900 text-white">
              <Zap className="h-3.5 w-3.5" />
            </div>
            <p className="font-bold text-sm leading-none text-stone-900">BizOps</p>
          </div>
          <div>
            <CardTitle className="text-xl">Set up your business</CardTitle>
            <CardDescription>Enter your business name to get started</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetup} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="business">Business Name</Label>
              <Input
                id="business"
                placeholder="My Coffee Shop"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                autoComplete="organization"
                autoFocus
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
                  Setting up…
                </>
              ) : (
                "Continue to dashboard"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
