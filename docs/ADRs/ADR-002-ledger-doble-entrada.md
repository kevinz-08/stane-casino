# ADR-002: Ledger de doble entrada, inmutable e idempotente

- **Estado**: aceptado
- **Fecha**: 2026-11-07

## Contexto

El saldo de fichas es el dato más sensible del sistema. Los fallos típicos son: saldos negativos por concurrencia, apuestas duplicadas por reintentos de red y saldos imposibles de explicar. Se necesita poder **auditar y reconciliar** cualquier saldo.

## Decisión

1. **Doble entrada.** Toda operación genera dos o más asientos (`LedgerEntry`) con la misma `transactionId`; la suma de `DEBIT` es igual a la suma de `CREDIT`. Una apuesta mueve fichas de la cuenta del jugador a la cuenta `HOUSE`; un pago, al revés. Las fichas no se crean ni destruyen salvo en cuentas de sistema explícitas (concesión inicial / ajustes).
2. **Inmutable.** Los asientos solo se insertan. Los errores se corrigen con un asiento compensatorio, nunca con `UPDATE`/`DELETE`. Lo impiden triggers de PostgreSQL sobre `LedgerEntry` y `LedgerTransaction` (`UPDATE`, `DELETE` y `TRUNCATE`).
3. **Importes `BigInt` > 0**; el signo lo da `direction`. Nunca floats.
4. **Idempotencia.** Cada operación es una fila de `LedgerTransaction` con `idempotencyKey` **único** elegida por el llamador (p. ej. `bet:<roundId>`) y una huella (`requestHash`) del contenido. Repetir la operación con la misma clave devuelve el resultado original (incluido el `balanceAfter` guardado en cada asiento) sin duplicar nada; reutilizar la clave con otro contenido falla con `409 IDEMPOTENCY_KEY_REUSED`. Una operación fallida (p. ej. sin saldo) no deja rastro, así que su clave puede reintentarse.
5. **Saldo cacheado.** `Account.balance` es una caché que se actualiza **en la misma transacción** que los asientos; el ledger es la fuente de verdad. Un job de reconciliación compara ambos.
6. **Concurrencia.** Cada transferencia es una transacción `READ COMMITTED` que: (1) inserta la fila de `LedgerTransaction` (las peticiones duplicadas concurrentes se bloquean en el índice único y, al confirmar la primera, devuelven su resultado); (2) bloquea las cuentas con `SELECT ... FOR UPDATE` **en orden ascendente de id**, lo que descarta interbloqueos; (3) comprueba el saldo bloqueado; (4) actualiza los saldos cacheados e inserta las patas. `CHECK (type <> 'PLAYER_WALLET' OR balance >= 0)` actúa de red de seguridad.
7. **Cuadre garantizado por la BD.** Un _constraint trigger_ diferido comprueba al hacer `COMMIT` que cada transacción tiene al menos dos patas y Σ DEBIT = Σ CREDIT. Desde el punto de vista de la cuenta, `DEBIT` saca fichas y `CREDIT` las mete.
8. **Cuentas de sistema.** `HOUSE` (contrapartida de apuestas y pagos) y `FAUCET` (emisor de las fichas de bienvenida; su saldo negativo es el total de fichas emitidas) se crean en la migración con ids fijos y pueden quedar en negativo.
9. Los asientos referencian la ronda (`roundId`) para que cada ficha movida sea trazable a un evento.

## Alternativas consideradas

- **Solo columna `balance`**: simple pero sin trazabilidad ni reconciliación.
- **Event sourcing completo del saldo**: más potente, más complejo; la caché + ledger cubre el caso.
- **Clave de idempotencia por pata** (`<opKey>:debit`, `<opKey>:credit`, propuesta inicial): no permite detectar que una clave se reutiliza con otro contenido ni devolver la respuesta original sin reconstruirla. En la Fase 1 se promovió a la tabla `LedgerTransaction`.
- **`SERIALIZABLE` con reintentos**: correcto, pero bajo carga (200 débitos sobre la misma cuenta) produce muchos abortos; el bloqueo explícito y ordenado es más predecible.

## Consecuencias

- **(+)** Auditoría completa, reintentos seguros y fácil explicación de cualquier saldo.
- **(−)** Cada operación escribe varias filas y necesita transacción; coste asumible a esta escala.
- **(−)** La cuenta `HOUSE` es un punto caliente: toda apuesta la bloquea y las apuestas se serializan entre sí. Basta para esta escala; si hiciera falta, se puede repartir en varias cuentas de casa.
- **(−)** Hay que testear concurrencia e idempotencia con rigor. Están cubiertas en `apps/api/test/*.int.test.ts` contra PostgreSQL real, también en CI.
