# Achei Você — localização por consentimento

> Ideia e princípios do projeto: [docs/IDEIA.md](docs/IDEIA.md)

PWA (Cloudflare Pages) + Supabase. Cada pessoa **escolhe** compartilhar a **zona** do local (não GPS) com um grupo, por tempo limitado.

## Como funciona
- Posição = zona (ex.: "Entrada"), escolhida manualmente ou via beacon Bluetooth **do local** (seletor do navegador, com ação do usuário).
- Wi-Fi: navegadores não expõem SSID/BSSID; use zona manual/QR (`zones.qr_code`). App nativo poderia ler Wi-Fi com permissão explícita.
- Nada de varredura de aparelhos de terceiros, MAC ou rastreio em segundo plano.

## LGPD embutida
Consentimento versionado e revogável · RLS (só membros do grupo veem) · expiração máx. 4h · `delete_my_data()` · fluxo agregado com k≥3 (`zone_counts`) · CSP e headers · política modelo em `web/privacidade.html` (**revisar com advogado/DPO**).

## Deploy
1. Supabase: aplique `supabase/migrations/001_init.sql`; ative *Anonymous sign-ins*; agende `purge_expired()` (15 min) e `purge_old_groups()` (diário) com pg_cron.
2. Edite `web/config.js` (URL e chave publishable).
2b. Aplique também `supabase/migrations/002_qr_admin.sql` (QR de zona, criar grupo, fluxo só para o dono).
3. Cloudflare Pages: pasta de saída `web`, sem build. Ex.: `npx wrangler pages deploy web`.
4. Crie local/zonas/grupo (ver `supabase/seed.sql`).

## Limites conhecidos
Web Bluetooth só em Chrome/Android; iOS Safari não suporta. Painel em `/admin.html` (login por link no e-mail). Leitura de QR usa BarcodeDetector (Chrome/Android).
