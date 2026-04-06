"use client";

import { useState } from "react";
import { loginCustomer, registerCustomer } from "@/lib/db/customers";
import { useSiteCustomer } from "@/components/site-customer-context";
import { Loader2 } from "lucide-react";

interface Props {
  props: Record<string, unknown>;
  siteId: string;
}

export function CustomerLoginElement({ props, siteId }: Props) {
  const { customer, login, logout } = useSiteCustomer();
  const title = (props.title as string) || "My Account";
  const allowRegister = props.allowRegister !== false;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db",
    borderRadius: "var(--sr-radius, 4px)", fontSize: "0.875rem", boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.25rem",
  };
  const btnStyle: React.CSSProperties = {
    background: "var(--sr-primary, #18181b)", color: "#fff",
    padding: "0.625rem 1.5rem", borderRadius: "var(--sr-radius, 4px)",
    fontWeight: 600, border: "none", cursor: "pointer", fontSize: "0.875rem",
    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
  };

  // Logged-in state
  if (customer) {
    return (
      <div style={{ border: "1px solid #e5e7eb", borderRadius: "var(--sr-radius, 4px)", padding: "1.5rem", maxWidth: "400px", margin: "0 auto" }}>
        <h2 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 700, marginBottom: "0.5rem", fontSize: "1.125rem" }}>
          Welcome back, {customer.name || customer.email.split("@")[0]}!
        </h2>
        <p style={{ fontSize: "0.875rem", color: "var(--sr-secondary)", marginBottom: "1.25rem" }}>{customer.email}</p>
        <button onClick={logout} style={{ ...btnStyle, background: "transparent", color: "var(--sr-text)", border: "1px solid #d1d5db" }}>
          Sign Out
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const c = await loginCustomer(siteId, email, password);
        if (!c) { setError("Incorrect email or password."); return; }
        login(c);
        setSuccess("Signed in successfully!");
      } else {
        if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
        const c = await registerCustomer(siteId, email, password, name || email.split("@")[0], phone || undefined);
        login(c);
        setSuccess("Account created! Welcome aboard.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "var(--sr-radius, 4px)", padding: "2rem", maxWidth: "400px", margin: "0 auto" }}>
      <h2 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 700, marginBottom: "1.5rem", fontSize: "1.25rem" }}>{title}</h2>

      {allowRegister && (
        <div style={{ display: "flex", gap: "0", marginBottom: "1.25rem", border: "1px solid #e5e7eb", borderRadius: "var(--sr-radius, 4px)", overflow: "hidden" }}>
          {(["login", "register"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(null); }}
              style={{ flex: 1, padding: "0.5rem", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.8125rem",
                background: mode === m ? "var(--sr-primary, #18181b)" : "transparent",
                color: mode === m ? "white" : "var(--sr-text)", transition: "background 0.15s" }}>
              {m === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        {mode === "register" && (
          <>
            <div>
              <label style={labelStyle}>Full Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" style={inputStyle} />
            </div>
          </>
        )}
        <div>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required style={inputStyle} autoComplete="email" />
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required style={inputStyle} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </div>

        {error && <div style={{ fontSize: "0.8125rem", color: "#dc2626", background: "#fef2f2", padding: "0.5rem 0.75rem", borderRadius: "3px" }}>{error}</div>}
        {success && <div style={{ fontSize: "0.8125rem", color: "#16a34a", background: "#f0fdf4", padding: "0.5rem 0.75rem", borderRadius: "3px" }}>{success}</div>}

        <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.7 : 1 }}>
          {loading ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : null}
          {mode === "login" ? "Sign In" : "Create Account"}
        </button>

        {allowRegister && (
          <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--sr-secondary)", margin: 0 }}>
            {mode === "login" ? "No account? " : "Already have one? "}
            <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
              style={{ background: "none", border: "none", color: "var(--sr-accent, #3b82f6)", cursor: "pointer", fontWeight: 600, fontSize: "0.8125rem" }}>
              {mode === "login" ? "Register" : "Sign In"}
            </button>
          </p>
        )}
      </form>
    </div>
  );
}
