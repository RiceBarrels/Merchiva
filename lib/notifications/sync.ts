"use client";

// Keeps what the email sender needs about this person in the module, from a
// screen that is theirs (/manager without a PIN operator, /personal; never a
// store tablet): once per connection the WorkOS identity behind the token
// (syncNotificationIdentity, argument-less: the module reads the token itself),
// and the email language whenever it differs from the UI's. Waits until the
// module answers for its notification tables, so an older module never sees
// calls it does not know.

import { useEffect, useRef } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { useI18n } from "@/lib/i18n/context";
import { setNotificationLocale, syncNotificationIdentity } from "@/lib/spacetimedb/actions/notifications";
import { useNotificationPrefs } from "@/lib/spacetimedb/hooks";
import { useNotificationFeed } from "./dots-context";

export function useNotificationSync(enabled: boolean): void {
  const { notifyReady, connectionKey } = useNotificationFeed();
  const [prefs, prefsReady] = useNotificationPrefs();
  const { locale } = useI18n();
  const stdb = useSpacetimeDB();
  const me = stdb?.identity ? stdb.identity.toHexString() : null;

  const identitySentFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !notifyReady || !connectionKey || identitySentFor.current === connectionKey) return;
    identitySentFor.current = connectionKey;
    syncNotificationIdentity();
  }, [enabled, notifyReady, connectionKey]);

  const localeSent = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !notifyReady || !prefsReady || !me || !connectionKey) return;
    const stored = prefs.find((p) => p.userId.toHexString() === me)?.locale ?? "";
    if (stored === locale) return;
    const key = `${connectionKey}:${locale}`;
    if (localeSent.current === key) return;
    localeSent.current = key;
    setNotificationLocale(locale);
  }, [enabled, notifyReady, prefsReady, prefs, me, connectionKey, locale]);
}
