# AGENTS.md

# CONTEXT GENERAL

Eres un asistente experto en desarrollo full-stack con Next.js (App Router) y TypeScript.

Trabajas sobre un proyecto de aplicaciones web tipo multi-app (juegos + herramientas), con backend en API routes y lógica híbrida cliente/servidor.

---

# STACK TÉCNICO REAL

- Next.js 16.2.x (App Router)
- React 19
- TypeScript
- MUI (Material UI) + Emotion
- Node.js 22
- SQLite (better-sqlite3)
- TailwindCSS (uso parcial / legacy en algunas partes)

---

# ARQUITECTURA DEL PROYECTO

## Estructura base

- app/api/ → Backend (API routes Next.js)
- app/components/ → UI reutilizable global
- app/hooks/ → hooks de lógica cliente (estado, fetch, game logic)
- app/lib/ → lógica compartida (server + utilidades)
- app/page.tsx → entry point principal (dashboard/login)
- app/**/page.tsx → páginas por feature o juego

---

# DOMINIO DEL PROYECTO

Este proyecto contiene múltiples aplicaciones independientes ("games" o módulos):

Cada módulo debe seguir esta estructura:

- useGameX.ts → estado + lógica de negocio
- components/ → UI pura y reutilizable
- page.tsx → composición y render final

---

# BASE PATH

El proyecto usa basePath:

/bookmarks

---

# AUTENTICACIÓN

Autenticación basada en Nextcloud OCS API.

- El login se valida mediante OCS/user
- No existe next-auth ni sistema de sesión interno complejo

REGLA CRÍTICA:
No modificar autenticación ni flujo de usuario sin instrucción explícita.

---

# REGLAS OPERATIVAS (OBLIGATORIAS)

## FORMATO DE RESPUESTA

SUMMARY:
1-3 líneas máximo explicando el cambio

DIFF:
--- a/<file>
+++ b/<file>
@@
(unified diff válido compatible con git apply)

---

## RESTRICCIONES

- No escribir archivos completos
- No explicar antes del diff
- No añadir texto fuera de SUMMARY + DIFF
- No múltiples formatos de salida
- Solo unified diff válido
- Cambios mínimos y localizados
- Mantener estructura existente

---

## VALIDACIÓN OBLIGATORIA

- Los diffs deben ser aplicables con git apply
- Rutas reales del repositorio
- No introducir imports rotos
- No eliminar dependencias sin confirmar uso
- No mezclar cambios no relacionados

---

## CAMBIOS ESTRUCTURALES

- Refactors grandes solo si se solicitan explícitamente
- No mover archivos entre carpetas sin instrucción
- No reestructurar arquitectura global por iniciativa propia

---

## CAMBIOS PERMITIDOS

- Editar archivos existentes
- Añadir nuevos archivos si es necesario o solicitado
- Refactor local dentro de un módulo

---

## CAMBIOS PROHIBIDOS

- /app/api/api/scores
- /app/api/word
- /app/api/audio

- Sistema de autenticación
- Contratos globales de datos
- Cambios arquitectónicos globales no solicitados

---

# PRINCIPIOS DE TRABAJO

- Priorizar claridad sobre abstracción
- Separar lógica de UI cuando sea posible
- Evitar duplicación de lógica entre módulos
- Mantener coherencia con estructura de hooks + components + pages