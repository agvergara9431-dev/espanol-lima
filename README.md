# Español para Lima

App para que Claire aprenda español antes del viaje a Lima (15 de diciembre de 2026).
Link: https://agvergara9431-dev.github.io/espanol-lima/

- **Frontend:** HTML, CSS y JS sin framework, publicado con GitHub Pages desde `main`.
- **Datos y login:** Supabase (Frankfurt), con link mágico por email. Solo entran los dos emails de la tabla `allowed_users`.
- **Diálogo y correcciones:** Cloudflare Worker (`worker/`) que llama a `claude-haiku-5-5`.

## Agregar una semana

Cada semana es un archivo: `content/semana-N.json`. Las semanas 2 a 7 ya existen, con `week`, `title`, `stamp` y `start`. Para activar una, completa su archivo con las mismas secciones que `semana-1.json`:

| Clave | Qué es |
|---|---|
| `items` | Frases: `{ "id": "w2-01", "es": "...", "en": "...", "nl": "..." }`. Los ids deben ser únicos (prefijo `wN-`). |
| `lessons` | 7 paradas de la ruta, una por día: `{ "id": "w2-l1", "title": "...", "items": ["w2-01", ...] }`. Una parada con `items: []` es un repaso de toda la semana. |
| `scenarios` | Diálogos: `icon` (`taxi`, `plate`, `basket` o `heart`), `title`, `who`, `desc` (en neerlandés), `persona` y `opener` (en español). |
| `missions` | 7 misiones, una por día: `{ "dialog": "<clave de scenarios>", "phrase": "frase para WhatsApp" }`. |

Después: `git add content && git commit -m "Add week N" && git push`. GitHub Pages publica en 1 o 2 minutos, y el Worker lee los personajes nuevos en 10 minutos como máximo.

Las semanas avanzan según los días que Claire completa (un día cuenta cuando termina la lección de ese día), no por calendario. Si llega a una semana que todavía no tiene contenido, la app le muestra "Week N komt eraan" y repasa lo que ya sabe.

## Probar

```
npm install
npx playwright install chromium
npx playwright test          # tamaño iPhone, con datos simulados (solo funciona en localhost)
```

`tests/real.spec.js` corre el mismo flujo contra Supabase real. Solo se ejecuta con `REAL_TEST=1`, `SB_SERVICE_KEY`, `LEARNER_EMAIL` y `OWNER_EMAIL` en el entorno, y al terminar borra todos los datos.

## Secretos

Ningún secreto está en git:
- **Worker:** `ANTHROPIC_API_KEY` y `ALLOWED_EMAILS` se cargan con `npx wrangler secret put`.
- **Supabase:** la clave `service_role` nunca se usa en el frontend. La clave anon es pública por diseño, porque RLS protege los datos.

## Correo con código (opcional)

El plan gratuito de Supabase no permite cambiar la plantilla del correo sin un servicio de correo propio (SMTP). Si configuras uno (Supabase → Authentication → SMTP), activa la plantilla de `supabase/templates/magic_link.html` en `supabase/config.toml` y súbela con `npx supabase config push --project-ref zesmxymaxnpcyrswaksf`. El correo traerá un código de 8 dígitos, y la pantalla de login ya acepta ese código en la misma caja del link.
