# XVfinance

AI platform for investment managers (split-screen chat + workspace).

## CRITICAL constraints

- **GitHub:** only this repository — https://github.com/fabian20xv/XVfinance
- **Supabase:** only https://krcwpupbdizzjyydzaqp.supabase.co (project ref `krcwpupbdizzjyydzaqp`). Never create, link, migrate, or seed any other Supabase project.

Stack target: Supabase + Node.js. Chat tools run as user JWT (RLS); service-role must never reach the model or client.
