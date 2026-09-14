-- Lets the chat's own SQL use trigram similarity (e.g. similarity(nickname,
-- 'gamey') > 0.3) to tolerate a misspelling, rather than depending on the
-- model reliably correcting its own spelling before it searches (0016).

create extension if not exists pg_trgm with schema extensions;
