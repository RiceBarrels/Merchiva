"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { SignupForm } from "@/components/signup-form";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FloatingNavButton } from "@/components/floating-nav-button";
import { hapticLight } from "@/lib/haptics";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") {
      localStorage.removeItem("stdb_token");
      window.history.replaceState({}, "", "/");
      setNeedsLogin(true);
      setChecking(false);
      return;
    }

    const token = localStorage.getItem("stdb_token");
    if (token) {
      router.replace("/dashboard");
    } else {
      setNeedsLogin(true);
      setChecking(false);
    }
  }, [router]);

  if (checking && !needsLogin) return null;
  if (!needsLogin) return null;

  const handleSuccess = () => router.replace("/dashboard");
  const openSignup = () => { hapticLight(); setShowSignup(true); };
  const closeSignup = () => { hapticLight(); setShowSignup(false); };

  return (
    <>
      <LoginForm onSuccess={handleSuccess} onSignup={openSignup} />

      {/* Signup — slides in from the right using Sheet */}
      <Sheet open={showSignup} onOpenChange={(open) => { if (!open) closeSignup(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0" showCloseButton={false}>
          <SignupForm onSuccess={handleSuccess} />
        </SheetContent>
      </Sheet>

      {/* Floating back button + title pill — shown above the Sheet when signup is open */}
      {showSignup && (
        <FloatingNavButton
          mode="back"
          title="Create account"
          onBack={closeSignup}
          zIndex={200}
        />
      )}
    </>
  );
}
