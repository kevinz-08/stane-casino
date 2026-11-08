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

## Implementación (Fase 2)

Detalles que forman parte del esquema verificable (`hmac-sha256-v1`). Cambiar cualquiera de ellos invalida la verificación de rondas antiguas, así que exige una versión nueva:

- **Codificación.** Claves y mensajes en UTF-8; `cursor` empieza en 0; cada bloque HMAC aporta 32 bytes que se consumen en orden; un `uint32` son 4 bytes consecutivos big-endian.
- **Entero sin sesgo.** `nextInt(n)` descarta los `uint32 ≥ ⌊2³²/n⌋·n` y devuelve `x mod n`.
- **Zapato.** Orden canónico por mazo: palos S, H, D, C y rangos A, 2…9, T, J, Q, K. 6 mazos (312 cartas) y **barajado nuevo en cada ronda** (un nonce = un zapato). Fisher–Yates hacia delante: para i = 0…n−2, j = i + nextInt(n − i), intercambiar i y j. Se calcula de forma perezosa, solo hasta la última carta repartida; la carta en la posición i es la misma que con el barajado completo.
- **Orden de reparto.** Jugador, crupier (vista), jugador, crupier (tapada); después, las cartas pedidas, de split o de doblar, y las del crupier.
- **Reglas versionadas.** Cada ronda guarda `rulesVersion` (`bj-v1`). Las reglas nunca se editan en el sitio.
- **SHA-256/HMAC en TypeScript puro** (`packages/game-engine/src/crypto`). El mismo verificador funciona en el servidor y en el navegador. Lo fijan los vectores NIST/RFC 4231 y los vectores de `test-vectors/fairness-v1.json`, generados y comprobados en CI por `scripts/verify-fairness.mjs`, que solo usa `node:crypto` y no comparte código con el motor.

## Consideraciones

- El `serverSeed` activo se guarda **cifrado con AES-256-GCM** (`SERVER_SEED_ENCRYPTION_KEY`), con el id del par como dato autenticado, y nunca se envía al cliente. Al revelarlo se guarda en claro.
- Cambiar `clientSeed` fuerza rotación del par (evita ajustar la semilla al ver resultados).
- **No se puede rotar con una ronda abierta**: revelar el seed revelaría la carta tapada y las siguientes del zapato (`409 ROUND_IN_PROGRESS`).
- Las tragamonedas usan el mismo flujo; el RTP se valida con un simulador (Fase 4), no con confianza.
- Esto demuestra _equidad verificable_, no sustituye una certificación de laboratorio; es una demostración de portafolio con fichas virtuales.

## Alternativas consideradas

- `crypto.randomBytes` por ronda sin compromiso: seguro, pero no verificable ni reproducible.
- Semilla única global: filtra información y no es verificable por jugador.
- Servicios externos de aleatoriedad (VRF/beacons): fuera del stack y de alcance.

## Consecuencias

- **(+)** Verificabilidad por el jugador, reproducibilidad para tests y soporte.
- **(−)** Hay que custodiar bien `serverSeed` y mantener el orden de consumo del flujo estable: cambiar cómo un juego consume números rompe la verificación de rondas antiguas (versionar las reglas de cada juego).
