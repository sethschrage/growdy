# Growdy app

A small client for Growdy, talking directly to Supabase (Auth, REST,
Storage) with no server or API layer of its own. See
[`docs/decisions/0008`](../docs/decisions/0008-app-as-research-tool.md)
for why this exists and how thin it's meant to stay.

## Development

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are both
client-safe values (not secrets) -- access is enforced by Supabase Auth
and each table's row-level security policies, not by keeping these
hidden.
