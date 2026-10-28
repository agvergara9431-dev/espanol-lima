// Public settings. The anon key is meant to be public; access is enforced by RLS in Supabase.
// Emails are not stored here: who may enter lives only in the database (allowed_users) and in the Worker secret.
export const CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  WORKER_URL: "",
  TRIP: "2026-12-15",
  START: "2026-10-27",
  WEEKS: 7,
  NAMES: { learner: "Claire", owner: "Augusto" },
};
