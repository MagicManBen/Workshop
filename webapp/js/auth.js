// Authentication: email/password login using the anon client. A valid session
// promotes the user to the `authenticated` role, which RLS grants full access
// to the workshop schema and image bucket.
import { supabase } from "./supabase.js";

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onAuthChange(cb) {
  supabase.auth.onAuthStateChange((_event, session) => cb(session));
}
