# ADR-002: Ledger de doble entrada, inmutable e idempotente

- **Estado**: aceptado
- **Fecha**: 2026-11-07

## Contexto

El saldo de fichas es el dato más sensible del sistema. Los fallos típicos son: saldos negativos por concurrencia, apuestas duplicadas por reintentos de red y saldos imposibles de explicar. Se necesita poder **auditar y reconciliar** cualquier saldo.

## Decisión

1. **Doble entrada.** Toda operación genera dos o más asientos (`LedgerEntry`) con la misma `transactionId`; la suma de `DEBIT` es igual a la suma de `CREDIT`. Una apuesta mueve fichas de la cuenta del jugador a la cuenta `HOUSE`; un pago, al revés. Las fichas no se crean ni destruyen salvo en cuentas de sistema explícitas (concesión inicial / ajustes).
2. **Inmutable.** Los asientos solo se insertan. Los errores se corrigen con un asiento compensatorio, nunca con `UPDATE`/`DELETE`. (Fase 1: permisos de BD o trigger que lo impida.)
3. **Importes `BigInt` > 0**; el signo lo da `direction`. Nunca floats.
4. **Idempotencia.** Cada asiento tiene `idempotencyKey` **único**. El llamador proporciona una clave de operación (`opKey`, p. ej. `bet:<roundId>`) y cada pata se deriva de ella (`<opKey>:debit`, `<opKey>:credit`). Repetir la operación devuelve el resultado original sin duplicar asientos.
5. **Saldo cacheado.** `Account.balance` es una caché que se actualiza **en la misma transacción** que los asientos; el ledger es la fuente de verdad. Un job de reconciliación compara ambos.
6. **Concurrencia.** Las escrituras sobre una cuenta se serializan (`SELECT ... FOR UPDATE` sobre la cuenta, o actualización condicional) y se rechaza cualquier movimiento que deje el saldo del jugador por debajo de cero (`CHECK (balance >= 0)` para cuentas de jugador).
7. Los asientos referencian la ronda (`roundId`) para que cada ficha movida sea trazable a un evento.

## Alternativas consideradas

- **Solo columna `balance`**: simple pero sin trazabilidad ni reconciliación.
- **Event sourcing completo del saldo**: más potente, más complejo; la caché + ledger cubre el caso.
- **Tabla `LedgerTransaction` separada**: modelo más limpio, pero se pidió un esquema inicial mínimo; `transactionId` + `idempotencyKey` por pata da lo esencial. Se puede promover a tabla en el futuro.

## Consecuencias

- **(+)** Auditoría completa, reintentos seguros y fácil explicación de cualquier saldo.
- **(−)** Cada operación escribe varias filas y necesita transacción; coste asumible a esta escala.
- **(−)** Hay que testear concurrencia e idempotencia con rigor (Fase 1: tests de propiedades y de carrera con PostgreSQL real).
