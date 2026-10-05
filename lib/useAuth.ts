"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, authConfigured } from "./supabase";

// "loading": still working out whether this browser has an account.
// "signed-out": brand new visitor. "needs-username": has a hidden account
// but no name/username yet. "ready": has both.
export type AuthStatus = "loading" | "signed-out" | "needs-username" | "ready";

export type ClaimResult = "ok" | "username-taken" | "name-taken" | "error";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>(authConfigured ? "loading" : "signed-out");

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("hc_profiles")
      .select("username, name")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.warn("Could not load profile", error);
      setStatus((prev) => (prev === "ready" ? prev : "needs-username"));
      return;
    }
    // Never downgrade: a claim in flight can finish before this lookup does.
    setUsername((prev) => data?.username ?? prev);
    setName((prev) => data?.name ?? prev);
    setStatus((prev) => (data ? "ready" : prev === "ready" ? prev : "needs-username"));
  }, []);

  useEffect(() => {
    if (!authConfigured) return;
    // The Supabase listener fires INITIAL_SESSION on subscribe, so this one
    // subscription covers first load, OAuth return and later sign in/out.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setUsername(null);
        setName(null);
        setStatus("signed-out");
        return;
      }
      // Deferred: calling Supabase inside this callback can deadlock it.
      setTimeout(() => void loadProfile(next.user.id), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  const claimUsername = useCallback(
    async (chosenUsername: string, chosenName: string): Promise<ClaimResult> => {
      // No signup: the first claim quietly creates an anonymous account
      // (no email or password) that this browser keeps. A name that turns
      // out to be taken leaves that account in place for the next try.
      let userId = session?.user.id;
      if (!userId) {
        const anon = await supabase.auth.signInAnonymously();
        if (anon.error || !anon.data.user) return "error";
        userId = anon.data.user.id;
      }
      const { error } = await supabase
        .from("hc_profiles")
        .insert({ id: userId, username: chosenUsername, name: chosenName.trim() });
      if (error) {
        if (error.code !== "23505") return "error";
        // Two unique rules: the username column and the lower(name) index.
        return error.message.includes("hc_profiles_name_key") ? "name-taken" : "username-taken";
      }
      setUsername(chosenUsername);
      setName(chosenName.trim());
      setStatus("ready");
      return "ok";
    },
    [session]
  );

  return {
    status,
    userId: session?.user.id ?? null,
    username,
    name,
    claimUsername,
  };
}
