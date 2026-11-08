# ADR-003: RNG determinista y provably fair

- **Estado**: aceptado
- **Fecha**: 2026-11-07

## Contexto

Los resultados deben ser (a) imposibles de predecir por el jugador antes de apostar, (b) imposibles de manipular por la casa después de apostar, y (c) reproducibles para auditoría y tests. El motor debe ser determinista y no usar `Math.random`.

## Decisión

Esquema _provably fair_ basado en HMAC-SHA256:

1. **Compromiso.** El servidor genera un `serverSeed` aleatorio (CSPRNG) y publica su `serverSeedHash = SHA-256(serverSeed)` **antes** de que el jugador apueste. El `serverSeed` permanece secreto mientras el par esté `ACTIVE`.
2. **Aporte del jugador.** El jugador fija/cambia su `clientSeed`.
3. **Nonce.** Cada ronda consume un `nonce` incremental del par (`SeedPair.nextNonce`); `(seedPairId, nonce)` es único en `GameRound`.
4. **Flujo de bytes.** Los números se obtienen de `HMAC_SHA256(key = serverSeed, msg = "${clientSeed}:${nonce}:${cursor}")`, con `cursor` creciente para pedir más bytes.
5. **Mapeo sin sesgo.** Bytes → entero en `[0, n)` con rechazo (rejection sampling), no con módulo. Barajado de mazos con Fisher–Yates dirigido por este flujo.
6. **Rotación y verificación.** Al rotar, se revela el `serverSeed` anterior; cualquiera puede comprobar el hash y reproducir todas las rondas del par con una función pública de verificación (`packages/game-engine/fairness`).
7. **Interfaz `Rng`.** El motor solo conoce `Rng { nextFloat(); nextInt(max) }`. En producción se inyecta el RNG HMAC; en tests, un RNG fijo o secuencial.

## Consideraciones

- El `serverSeed` activo se guarda cifrado en reposo (TODO fase 2) y nunca se envía al cliente.
- Cambiar `clientSeed` fuerza rotación del par (evita ajustar la semilla al ver resultados).
- Las tragamonedas usan el mismo flujo; el RTP se valida con un simulador (Fase 4), no con confianza.
- Esto demuestra _equidad verificable_, no sustituye una certificación de laboratorio; es una demostración de portafolio con fichas virtuales.

## Alternativas consideradas

- `crypto.randomBytes` por ronda sin compromiso: seguro, pero no verificable ni reproducible.
- Semilla única global: filtra información y no es verificable por jugador.
- Servicios externos de aleatoriedad (VRF/beacons): fuera del stack y de alcance.

## Consecuencias

- **(+)** Verificabilidad por el jugador, reproducibilidad para tests y soporte.
- **(−)** Hay que custodiar bien `serverSeed` y mantener el orden de consumo del flujo estable: cambiar cómo un juego consume números rompe la verificación de rondas antiguas (versionar las reglas de cada juego).
