# Casino (fichas virtuales)

Casino online de portafolio que imita el diseño de sistema de un casino real, **sin dinero real, sin pasarelas de pago y sin KYC**. Todo se juega con fichas virtuales.

- **Juegos**: Blackjack y 2–3 tragamonedas.
- **Servidor autoritativo**: el cliente solo envía _intenciones_ y recibe _resultados_.
- **Provably fair**: RNG derivado de HMAC-SHA256 con `serverSeed`, `clientSeed` y `nonce`.
- **Billetera con ledger de doble entrada**, inmutable e idempotente.
- **Rondas como eventos reproducibles** y **juego responsable** (límites y autoexclusión).
- **Monolito modular**, preparado para separar servicios más adelante.

> Estado: **scaffold (Fase 0)**. Solo existe la estructura, los contratos y el endpoint `/health`. No hay lógica de negocio. Ver [docs/ROADMAP.md](docs/ROADMAP.md).

## Stack

Turborepo + pnpm · Next.js (App Router) + Tailwind + Zustand · NestJS + Socket.IO · PostgreSQL + Prisma · Redis + BullMQ · Vitest + fast-check · ESLint, Prettier, Husky + lint-staged · Docker Compose.

PixiJS (slots) y BullMQ/ioredis se añadirán en la fase que los necesite, no antes.

## Estructura

```
apps/
  web/            Next.js: lobby, cuenta, mesas, slots
  api/            NestJS: módulos por dominio + gateways WebSocket + prisma/schema.prisma
packages/
  game-engine/    TypeScript puro y determinista (blackjack, slots, rng, fairness)
  shared/         constantes, DTOs y eventos WS compartidos
  config/         tsconfig, ESLint y Prettier base
docs/             ARCHITECTURE.md, ROADMAP.md, ADRs/
```

## Requisitos

- Node.js 22+ (`.nvmrc`)
- pnpm 10+ (`corepack enable`)
- Docker (para PostgreSQL y Redis)

## Puesta en marcha

```bash
pnpm install
cp .env.example .env          # en PowerShell: Copy-Item .env.example .env
docker compose up -d          # PostgreSQL :5432 y Redis :6379
pnpm db:generate              # genera el cliente de Prisma
pnpm build                    # compila paquetes y apps (necesario antes de dev la primera vez)
pnpm dev                      # web en :3000, api en :4000
```

Comprobación rápida: `curl http://localhost:4000/health` → `{"status":"ok",...}`.

Para activar los hooks de Husky el directorio debe ser un repositorio git (`git init`) y volver a ejecutar `pnpm install`.

## Scripts (raíz)

| Script                              | Descripción                                           |
| ----------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                          | Arranca web y api (y recompila los paquetes) en watch |
| `pnpm build`                        | Compila todo en orden de dependencias (Turborepo)     |
| `pnpm lint`                         | ESLint en todos los workspaces                        |
| `pnpm test`                         | Vitest en todos los workspaces                        |
| `pnpm typecheck`                    | `tsc --noEmit` en todos los workspaces                |
| `pnpm format` / `pnpm format:check` | Prettier                                              |
| `pnpm db:generate`                  | `prisma generate` (api)                               |
| `pnpm infra:up` / `pnpm infra:down` | Levanta / baja PostgreSQL y Redis                     |

Un workspace concreto: `pnpm --filter @casino/api <script>`.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Roadmap por fases](docs/ROADMAP.md)
- ADRs: [001 monolito modular](docs/ADRs/ADR-001-monolito-modular.md) · [002 ledger de doble entrada](docs/ADRs/ADR-002-ledger-doble-entrada.md) · [003 RNG y provably fair](docs/ADRs/ADR-003-rng-provably-fair.md)
