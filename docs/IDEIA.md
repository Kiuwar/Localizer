# Ideia do projeto — Localizer ("Achei Você")

## Em uma frase
Um app web (PWA) que ajuda pessoas a se encontrarem dentro de um local (evento, shopping, feira, hospital), **só com a permissão de cada uma**, mostrando a **zona** em que estão, e não a posição exata.

## Problema
Em lugares grandes e lotados, o sinal de celular e o GPS falham dentro de prédios, e as pessoas perdem tempo se procurando. As soluções de rastreio existentes costumam coletar dados demais e sem transparência.

## Princípios (inegociáveis)
1. **Consentimento primeiro:** ninguém é localizado sem aceitar e sem saber quem vê.
2. **Mínimo necessário:** só a zona do local, nunca GPS, endereço MAC ou rastreio em segundo plano.
3. **Temporário:** compartilhamento de 30 min a 4 h, depois some sozinho.
4. **Controle do titular:** parar, revogar e apagar tudo a qualquer momento (LGPD, art. 18).
5. **Sem varredura de terceiros:** o app nunca detecta aparelhos de outras pessoas por Wi-Fi ou Bluetooth.

## Como funciona
- O organizador cadastra o **local** e as **zonas** (ex.: Entrada, Praça de alimentação), opcionalmente com beacons Bluetooth fixos ou QR codes.
- A pessoa aceita os termos, entra num **grupo** por código e escolhe a zona (manual ou via beacon do local).
- Os membros do grupo veem, em tempo real, quem está em qual zona.
- O organizador pode ver o **fluxo agregado e anônimo** por zona (só aparece com 3 ou mais pessoas).

## Públicos e usos
- **Famílias e amigos** em eventos e parques.
- **Organizadores de eventos**: mapa de lotação sem identificar ninguém.
- **Hospitais e feiras**: acompanhantes e equipes se encontrando.
- **Rastreio de ativos** (tags em equipamentos, não em pessoas).

## Modelo de negócio (hipótese)
Assinatura mensal por local/evento, no formato dos catálogos digitais por assinatura. **A validar** com clientes reais.

## Fora do escopo
Localizar pessoas que não aderiram, vigilância de funcionários ou de terceiros, venda ou cruzamento de dados de localização.

## Stack
Cloudflare Pages (hospedagem) + Supabase (Auth anônima, Postgres com RLS, Realtime). Detalhes em `README.md` e `supabase/migrations/001_init.sql`.

## Próximos passos
- Painel do organizador (cadastro de locais, zonas, grupos e QR codes).
- Leitor de QR por zona no app.
- Versão nativa para leitura de Wi-Fi com permissão explícita.
- Revisão jurídica da política de privacidade e definição da regra para menores (art. 14).
