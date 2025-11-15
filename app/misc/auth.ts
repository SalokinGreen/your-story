import { supabase } from "./supabase";

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export interface SignUpParams {
  email: string;
  password: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export async function signUp({ email, password }: SignUpParams) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { user: null, error: error.message };
  }

  return { user: data.user, error: null };
}

export async function signIn({ email, password }: SignInParams) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { user: null, session: null, error: error.message };
  }

  return { user: data.user, session: data.session, error: null };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    return { user: null, error: error.message };
  }

  return { user, error: null };
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    return { session: null, error: error.message };
  }

  return { session, error: null };
}
