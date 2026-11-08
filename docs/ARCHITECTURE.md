# Arquitectura

Casino de fichas virtuales diseñado como lo haría un casino real: el servidor decide, todo queda registrado y todo es auditable.

## Principios

1. **Servidor autoritativo.** El cliente envía intenciones (`apostar 100`, `pedir carta`) y recibe resultados. Nunca calcula resultados ni saldos que el servidor vaya a aceptar.
2. **Motor determinista y puro.** `packages/game-engine` no hace I/O, no lee el reloj y no usa `Math.random`. Mismo estado + misma acción + misma secuencia del `Rng` ⇒ mismo resultado. Eso permite tests de propiedades, simuladores de RTP y reproducción de rondas.
3. **Ledger inmutable de doble entrada.** El saldo nunca se edita: se registran asientos que suman cero. Cada operación es idempotente (`idempotencyKey`). Ver [ADR-002](ADRs/ADR-002-ledger-doble-entrada.md).
4. **Rondas como eventos.** Una ronda es una lista ordenada y _append-only_ de `RoundEvent`. Reproducirla reconstruye el estado exacto (auditoría, soporte, disputas).
5. **Provably fair.** El jugador recibe el hash del `serverSeed` antes de jugar y puede verificar cada ronda después de la rotación. Ver [ADR-003](ADRs/ADR-003-rng-provably-fair.md).
6. **Monolito modular.** Un módulo por dominio, dependencias explícitas, sin acceso directo a tablas de otro módulo. Ver [ADR-001](ADRs/ADR-001-monolito-modular.md).
7. **Solo fichas virtuales.** Sin dinero real, pagos ni KYC.

## Componentes

```mermaid
flowchart LR
  subgraph Cliente
    WEB["apps/web<br/>Next.js + Zustand<br/>(PixiJS en slots)"]
  end

  subgraph API["apps/api (NestJS, monolito modular)"]
    direction TB
    AUTH[auth]
    USERS[users]
    LOBBY["lobby / tables<br/>(gateway Socket.IO)"]
    BJ[blackjack]
    POKER[poker]
    SLOTS[slots]
    FAIR[fairness]
    ROUNDS[rounds]
    WALLET["wallet<br/>(ledger)"]
    RG[responsible-gaming]
    ADMIN[admin]
    HEALTH[health]
  end

  ENGINE["packages/game-engine<br/>(TS puro, determinista)"]
  SHARED["packages/shared<br/>(tipos, DTOs, eventos WS)"]
  PG[("PostgreSQL<br/>Prisma")]
  REDIS[("Redis<br/>pub/sub + BullMQ")]

  WEB -- "HTTP (intenciones)" --> AUTH
  WEB -- "HTTP" --> BJ
  WEB -- "HTTP" --> SLOTS
  WEB <-- "WebSocket" --> LOBBY

  LOBBY --> POKER
  BJ --> ENGINE
  POKER --> ENGINE
  SLOTS --> ENGINE

  BJ --> FAIR
  POKER --> FAIR
  SLOTS --> FAIR
  BJ --> WALLET
  POKER --> WALLET
  SLOTS --> WALLET
  BJ --> ROUNDS
  POKER --> ROUNDS
  SLOTS --> ROUNDS
  BJ --> RG
  POKER --> RG
  SLOTS --> RG
  AUTH --> USERS
  ADMIN --> WALLET
  ADMIN --> ROUNDS
  ADMIN --> RG

  WALLET --> PG
  ROUNDS --> PG
  FAIR --> PG
  USERS --> PG
  RG --> PG
  LOBBY --> REDIS
  RG --> REDIS

  API -. importa .-> SHARED
  WEB -. importa .-> SHARED
```

## Flujo de una apuesta (blackjack, esquema)

```mermaid
sequenceDiagram
  participant C as Cliente
  participant G as blackjack (API)
  participant RG as responsible-gaming
  participant F as fairness
  participant W as wallet
  participant E as game-engine
  participant R as rounds

  C->>G: bet(amount, idempotencyKey)
  G->>RG: ¿puede apostar? (límites, autoexclusión)
  G->>F: reservar nonce del par de seeds
  G->>W: debitar apuesta (asiento doble, idempotente)
  G->>E: init(config, Rng(serverSeed, clientSeed, nonce))
  E-->>G: estado + eventos
  G->>R: guardar eventos (append-only)
  G-->>C: resultado (solo lo que el jugador puede ver)
  C->>G: action(hit/stand/...)
  G->>E: applyAction
  E-->>G: estado + eventos
  G->>W: acreditar pago al liquidar
  G->>R: guardar eventos y cerrar ronda
```

Todo el paso `debitar → registrar → acreditar` ocurre con consistencia garantizada por transacciones de PostgreSQL y claves de idempotencia (detalles en la Fase 1/2).

## Responsabilidades por módulo (`apps/api/src/modules`)

| Módulo               | Responsabilidad                                                                                      | Fase |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ---- |
| `health`             | Liveness (y luego readiness: PostgreSQL y Redis). **Implementado.**                                  | 0    |
| `auth`               | Registro, login, JWT, guards y roles.                                                                | 1    |
| `users`              | Perfil y consulta de usuarios.                                                                       | 1    |
| `wallet`             | Ledger de doble entrada, saldos, transferencias idempotentes. Único módulo que escribe asientos.     | 1    |
| `fairness`           | Pares de seeds: compromiso (hash), rotación, revelado y verificación.                                | 2    |
| `rounds`             | Persistencia append-only de eventos de ronda, reproducción y auditoría.                              | 2    |
| `blackjack`          | Orquesta una ronda: límites → nonce → débito → motor → eventos → pago.                               | 2    |
| `lobby` (+ gateway)  | Registro de mesas, presencia y difusión en tiempo real por Socket.IO.                                | 3    |
| `slots`              | Orquesta giros usando el motor genérico de slots.                                                    | 4    |
| `poker`              | Texas Hold'em cash multijugador: asientos, buy-in vía ledger, turnos con temporizador, botes y rake. | 6    |
| `responsible-gaming` | Límites (depósito de fichas, pérdida, tiempo), pausas y autoexclusión; veto previo a apostar.        | 5\*  |
| `admin`              | Backoffice: consulta de usuarios, auditoría de ledger, inspector de rondas, configuración.           | 5    |

\* La **interfaz de veto** (`canBet`) se define en la Fase 1 y se invoca desde la Fase 2 con una implementación mínima; la funcionalidad completa llega en la Fase 5. Así no hay que retocar todos los juegos después.

### Reglas de dependencia

- `game-engine` no depende de nada del repositorio (ni de Nest, ni de Prisma, ni de `shared`).
- `shared` no tiene dependencias en runtime.
- Los módulos de juego (`blackjack`, `slots`) usan `wallet`, `fairness`, `rounds` y `responsible-gaming` solo a través de sus servicios exportados.
- Solo `wallet` escribe en `LedgerEntry`/`Account`; solo `rounds` escribe en `GameRound`/`RoundEvent`; solo `fairness` escribe en `SeedPair`.
- Un módulo nunca hace `prisma.<tabla de otro módulo>`: si necesita datos de otro, llama a su servicio. Esto es lo que hace posible extraer servicios más adelante.

## Modelo de datos núcleo (`apps/api/prisma/schema.prisma`)

`User` → `Account` (saldo cacheado) → `LedgerEntry` (inmutable, `idempotencyKey` único) · `GameRound` → `RoundEvent` (único por `roundId+seq`) · `SeedPair` (seeds y `nextNonce`; `GameRound` único por `seedPairId+nonce`).

Los importes son `BigInt` (fichas enteras). En JSON viajan como cadenas.

## Tiempo real

Socket.IO desde NestJS (`lobby.gateway.ts`). Los nombres de evento viven en `packages/shared` (`WS_EVENTS`). Para escalar horizontalmente se usará el adaptador de Redis (Fase 3). El estado autoritativo de una mesa vive en el servidor; los clientes reciben instantáneas y eventos.

## Calidad y entorno

- Tests: Vitest en cada workspace; fast-check para propiedades del motor (p. ej. conservación de fichas, rango del RNG, reproducibilidad).
- Lint/formato: ESLint 9 (config plana compartida) y Prettier; Husky + lint-staged en pre-commit.
- CI: GitHub Actions (`.github/workflows/ci.yml`): format, lint, build y test.
- Local: `docker-compose.yml` con PostgreSQL 17 y Redis 7.
