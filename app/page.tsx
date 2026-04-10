"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/react";
import { LoginForm } from "@/components/login-form";
import { SignupForm } from "@/components/signup-form";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FloatingNavButton } from "@/components/floating-nav-button";
import { hapticLight } from "@/lib/haptics";

export default function Home() {
  const router = useRouter();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") {
      localStorage.removeItem("stdb_token");
      window.history.replaceState({}, "", "/");
      return;
    }

    if (isLoaded && isSignedIn) {
      getToken().then((token) => {
        if (token) localStorage.setItem("stdb_token", token);
        router.replace("/dashboard");
      });
    }
  }, [isLoaded, isSignedIn, router, getToken]);

  if (!isLoaded) return null;
  if (isSignedIn) return null; // Will redirect

  const handleSuccess = () => router.replace("/dashboard");
  const openSignup = () => { hapticLight(); setShowSignup(true); };
  const closeSignup = () => { hapticLight(); setShowSignup(false); };

  return (
    <>
      <LoginForm onSuccess={handleSuccess} onSignup={openSignup} />

      <Sheet open={showSignup} onOpenChange={(open) => { if (!open) closeSignup(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0" showCloseButton={false}>
          <SignupForm onSuccess={handleSuccess} />
        </SheetContent>
      </Sheet>

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
