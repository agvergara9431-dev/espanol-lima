-- Spanish voice chosen in the settings, per user (a voice name; missing on another device means automatic).
alter table public.user_prefs add column if not exists voice text check (voice is null or length(voice) <= 120);
