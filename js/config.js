// Public settings. The anon key is meant to be public; access is enforced by RLS in Supabase.
// Emails are not stored here: who may enter lives only in the database (allowed_users) and in the Worker secret.
export const CONFIG = {
  SUPABASE_URL: "https://zesmxymaxnpcyrswaksf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inplc214eW1heG5wY3lyc3dha3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNjQzMDQsImV4cCI6MjEwODc0MDMwNH0.MXdZCFTG0U22ijBUT7TktXqz4sa-hEUHu90zsmSbEb8",
  WORKER_URL: "https://espanol-lima.claude-messages.workers.dev",
  TRIP: "2026-12-15",
  START: "2026-10-27",
  WEEKS: 7,
  NAMES: { learner: "Claire", owner: "Augusto" },
};
