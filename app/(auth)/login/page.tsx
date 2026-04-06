"use client";

import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  const router = useRouter();
  return <LoginForm onSuccess={() => router.push("/dashboard")} />;
}
