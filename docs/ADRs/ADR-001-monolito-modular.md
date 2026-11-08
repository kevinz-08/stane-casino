# ADR-001: Monolito modular

- **Estado**: aceptado
- **Fecha**: 2026-11-07

## Contexto

El proyecto es de portafolio, lo desarrolla una sola persona y debe mostrar diseño de sistema realista de un casino (wallet, rondas, juegos en tiempo real, juego responsable). Hay una exigencia de **consistencia fuerte** entre la billetera, el registro de rondas y los límites del jugador. Se quiere poder separar servicios en el futuro.

## Decisión

Una única aplicación NestJS desplegable (`apps/api`) organizada en **módulos por dominio**, con reglas de dependencia explícitas:

- Cada módulo expone un servicio público; nadie accede a las tablas de otro módulo.
- La lógica de juego vive fuera de NestJS, en `packages/game-engine` (TypeScript puro).
- Los contratos compartidos con el cliente viven en `packages/shared`.
- Un único PostgreSQL, un único Redis. Sin colas entre módulos mientras una llamada directa baste.

## Alternativas consideradas

| Alternativa                    | Por qué no (ahora)                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Microservicios desde el inicio | Transacciones distribuidas para apostar+pagar, más infraestructura y observabilidad, sin beneficio a esta escala. |
| Monolito sin fronteras         | Acoplamiento difícil de revertir; pierde el valor didáctico y la opción de extraer servicios.                     |
| Serverless / funciones         | Los WebSockets con estado de mesa y las transacciones largas encajan mal.                                         |

## Consecuencias

- **(+)** Una transacción de base de datos puede cubrir débito, evento y pago; despliegue y depuración simples.
- **(+)** Los límites de módulo permiten extraer `wallet` o los juegos a servicios propios más adelante, sustituyendo llamadas a servicio por llamadas de red/cola.
- **(−)** Las fronteras dependen de disciplina (revisión de código, y más adelante una regla de lint de imports entre módulos).
- **(−)** Un fallo no controlado afecta a todo el proceso; se mitiga con tests, health checks y despliegue gradual.

## Candidatos naturales a extraer primero

1. Mesas en tiempo real (`lobby`): escalado distinto (conexiones persistentes).
2. Simulación/RTP (BullMQ workers): carga intensiva en CPU.
3. `wallet`: solo si se necesitara aislar el ledger.
