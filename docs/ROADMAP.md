# Roadmap

Estimaciones para **una persona con dedicación parcial** (~15–20 h/semana). "Día" = jornada efectiva de trabajo. Los criterios de aceptación son medibles y sirven como definición de terminado.

## Cambios respecto a la propuesta inicial

| Cambio                                                                                                   | Motivo                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| La **interfaz de veto de juego responsable** (`canBet`) se crea en la Fase 1 y se usa desde la Fase 2    | Si los límites llegan en la Fase 5, hay que reabrir cada juego. Un contrato temprano con implementación mínima cuesta ~1 día y evita retrabajo. |
| **Logs estructurados e id de petición** desde la Fase 0/1; la observabilidad avanzada queda en la Fase 5 | Depurar concurrencia del ledger y WebSockets sin trazas es muy caro.                                                                            |
| La **Fase 5 se parte en 5a** (juego responsable + admin) **y 5b** (observabilidad + deploy)              | Son bloques independientes con riesgos distintos; 5a se puede cerrar aunque el deploy se retrase.                                               |
| El **simulador de RTP** se hace antes de cualquier UI de slots (dentro de la Fase 4)                     | El motor de slots debe demostrarse correcto matemáticamente antes de invertir en gráficos.                                                      |
| La **Fase 1 incluye tests de concurrencia contra PostgreSQL real**                                       | Es el mayor riesgo técnico del proyecto; mocks no lo detectan.                                                                                  |

Dependencias: `0 → 1 → 2 → 3`; `4` depende de `2` (RNG, fairness, rounds) y no de `3`, por lo que **puede hacerse antes o en paralelo a la Fase 3**; `5a` depende de `1–2`; `5b` de todo lo anterior; `6` (poker) depende de `3` y de `canBet`, y puede adelantarse en paralelo a la `4`.

---

## Fase 0 — Fundaciones

**Estado: hecha con este scaffold** (queda verificar el pipeline de CI en GitHub).

- **Objetivo**: base reproducible del monorepo con calidad automatizada.
- **Entregables**: monorepo Turborepo + pnpm; tsconfig/ESLint/Prettier compartidos; Husky + lint-staged; Docker Compose (PostgreSQL + Redis); `/health`; CI; ADRs y documentación; `schema.prisma` inicial.
- **Criterios de aceptación**:
  - `pnpm install && pnpm build && pnpm lint && pnpm test` terminan con código 0 en un clon limpio.
  - `docker compose up -d` deja PostgreSQL y Redis en estado `healthy`.
  - `GET /health` responde `200` con `status: "ok"`.
  - El workflow de CI pasa en una PR vacía.
- **Riesgos**: desajustes de versiones (Next/Nest/TS); ESM/CJS entre paquetes (mitigado compilando paquetes a CommonJS).
- **Estimación**: 2–3 días.

## Fase 1 — Auth + Wallet/Ledger

- **Objetivo**: identidad de usuario y billetera correcta bajo concurrencia y reintentos.
- **Entregables**:
  - Primera migración de Prisma; restricciones SQL (`balance >= 0`, inmutabilidad de `LedgerEntry`).
  - `auth` (registro, login, JWT access+refresh, guards, roles) y `users`.
  - `wallet`: concesión inicial de fichas, transferencias de doble entrada, consulta de saldo e historial, idempotencia, reconciliación `Account.balance` ↔ ledger.
  - Interfaz `canBet` de `responsible-gaming` (implementación mínima: permite todo).
  - Logs estructurados, `ValidationPipe` global, rate limiting básico.
  - Web: registro/login y saldo en cabecera.
- **Criterios de aceptación**:
  - Test de carga: 200 débitos concurrentes sobre una cuenta con saldo para 100 ⇒ exactamente 100 éxitos, saldo final ≥ 0, ledger cuadrado.
  - Misma `idempotencyKey` enviada 50 veces en paralelo ⇒ 1 solo conjunto de asientos y la misma respuesta.
  - Propiedad (fast-check): para cualquier secuencia de operaciones, ΣDEBIT = ΣCREDIT y `balance` = suma de asientos de la cuenta.
  - Intentar `UPDATE`/`DELETE` sobre `LedgerEntry` falla.
  - Cobertura ≥ 90 % en `wallet`.
- **Riesgos**: carreras y bloqueos (deadlocks) por orden de bloqueo de cuentas; seguridad de sesiones. Mitigación: bloquear cuentas en orden determinista; tests con PostgreSQL real en CI.
- **Estimación**: 2–3 semanas.

## Fase 2 — Motor Blackjack single-player + UI + provably fair

- **Objetivo**: primer juego completo de extremo a extremo, verificable por el jugador.
- **Entregables**:
  - `game-engine/rng` (HMAC-SHA256, rejection sampling, Fisher–Yates) y `game-engine/fairness` (compromiso y verificador).
  - `game-engine/blackjack` (reglas, acciones, pagos) implementando `Game`.
  - API: `fairness` (pares de seeds, rotación/revelado), `rounds` (eventos append-only, replay), `blackjack` (orquestación con `wallet` y `canBet`).
  - Web: mesa de blackjack, panel de seeds y verificador de rondas.
- **Criterios de aceptación**:
  - Reproducir una ronda desde sus eventos produce exactamente el estado final guardado (test sobre 10 000 rondas simuladas).
  - Propiedades: conservación de fichas por ronda (apuesta ± pago = variación de saldo); ninguna secuencia de acciones deja una ronda inconsistente.
  - Vectores de prueba fijos de HMAC verifican con una implementación independiente (script de verificación externo).
  - Distribución de cartas: χ² sobre ≥ 1 M cartas sin desviaciones significativas; sin sesgo de módulo.
  - Una ronda real puede verificarse desde la UI tras rotar el seed.
  - Ventaja de la casa del blackjack simulada con estrategia básica dentro de ±0,3 % del valor teórico para las reglas elegidas.
- **Riesgos**: reglas con casos límite (split, doble, seguro, blackjack del crupier); filtrar información oculta (carta tapada) al cliente; cambios de reglas que invaliden la verificación de rondas antiguas (mitigar versionando las reglas).
- **Estimación**: 3–4 semanas.

## Fase 3 — Mesas en tiempo real

- **Objetivo**: rondas sincronizadas para varios jugadores por WebSocket.
- **Entregables**:
  - `lobby`/`tables` con gateway Socket.IO, autenticación en el handshake, asientos y presencia; adaptador de Redis (pub/sub); estado de mesa y temporizadores.
  - Web: lobby de mesas y mesa genérica con apuestas en ventana de tiempo.
- **Criterios de aceptación**:
  - 100 clientes simulados en una mesa reciben el mismo orden de eventos; p95 de latencia de difusión < 100 ms en local.
  - Con 2 instancias de la API, un cliente conectado a la instancia A recibe los eventos de una mesa gestionada por B (Redis).
  - Una reconexión recupera el estado actual de la mesa sin duplicar apuestas.
  - Las apuestas fuera de ventana se rechazan; ninguna apuesta se debita dos veces.
- **Riesgos**: temporizadores distribuidos y propiedad de la mesa entre instancias; reconexiones y estado inconsistente. Mitigación: una sola instancia "dueña" por mesa (lock en Redis) y snapshots + eventos con número de secuencia.
- **Estimación**: 3–4 semanas.

## Fase 4 — Motor genérico de slots + simulador de RTP + primer juego en PixiJS

- **Objetivo**: slots definidos por datos, con RTP demostrable.
- **Entregables**:
  - `game-engine/slots`: definición declarativa (carretes, líneas/ways, tabla de pagos, comodines, scatter/free spins) y evaluación pura.
  - Simulador de RTP (CLI / worker BullMQ) con informe: RTP, volatilidad, frecuencia de aciertos, intervalos de confianza.
  - `slots` en API (giro = apuesta + RNG + pago + eventos).
  - Web: primer juego con PixiJS (carretes, animación de resultado ya decidido por el servidor).
- **Criterios de aceptación**:
  - Simulación de ≥ 100 M giros: RTP medido dentro de ±0,1 % del RTP teórico calculado analíticamente.
  - El resultado animado en el cliente coincide siempre con el evento del servidor (test E2E).
  - 60 fps estables en la animación en un equipo de gama media.
  - Un segundo juego de slots se añade solo con un nuevo archivo de configuración (sin tocar el motor).
- **Riesgos**: errores sutiles en la tabla de pagos; coste de PixiJS en móviles; tiempo de simulación (mitigar con workers y semillas fijas).
- **Estimación**: 4–5 semanas (incluye 1–2 slots adicionales de configuración).

## Fase 5a — Juego responsable y panel admin

- **Objetivo**: controles de protección del jugador y herramientas de operación.
- **Entregables**:
  - `responsible-gaming` completo: límites de pérdida/apuesta/tiempo (diario/semanal), recordatorios de sesión, pausa y autoexclusión con periodo mínimo irreversible; aplicación en todos los juegos mediante `canBet`.
  - `admin`: búsqueda de usuarios, visor de ledger, inspector/replay de rondas, ajustes de juego, rol `ADMIN` con auditoría de acciones.
  - Web: pantalla de límites y de autoexclusión.
- **Criterios de aceptación**:
  - Un usuario autoexcluido no puede apostar en **ningún** juego, por ninguna ruta (test por juego y por gateway).
  - Un límite reducido aplica inmediatamente; uno aumentado tarda ≥ 24 h (cooling period).
  - Toda acción de admin queda registrada con autor, fecha y motivo.
  - Reconciliación diaria ledger ↔ saldos sin diferencias (informe en el panel).
- **Riesgos**: huecos en la aplicación de límites (rutas WebSocket olvidadas); límites con condiciones de carrera. Mitigación: único punto de decisión (`canBet`) y tests de arquitectura.
- **Estimación**: 2–3 semanas.

## Fase 5b — Observabilidad y despliegue

- **Objetivo**: poder operar y mostrar el sistema en producción.
- **Entregables**: métricas (Prometheus/OpenTelemetry), trazas, dashboards y alertas básicas; readiness con PostgreSQL y Redis; Dockerfiles de producción; despliegue (p. ej. un VPS o PaaS) con migraciones automáticas; backups de PostgreSQL; documentación de runbook.
- **Criterios de aceptación**:
  - Despliegue desde cero reproducible con un solo comando/pipeline en < 15 minutos.
  - Dashboard con latencia p95, errores, rondas por minuto y conexiones WebSocket.
  - Restauración de un backup probada y documentada (RPO ≤ 24 h).
  - Prueba de carga: 500 jugadores simultáneos con p95 < 300 ms en las acciones HTTP de juego.
- **Riesgos**: coste de infraestructura; configuración de secretos; deriva entre entornos.
- **Estimación**: 1–2 semanas.

## Fase 6 — Poker (Texas Hold'em, mesas cash multijugador)

- **Objetivo**: póker de jugador contra jugador en tiempo real, con barajado verificable y sin que la casa pueda ver ni alterar las cartas.
- **Dependencias**: Fase 3 (infraestructura de mesas en tiempo real, Redis, reconexión), Fase 2 (RNG y fairness) y `canBet` de juego responsable. Puede empezar tras la Fase 3, en paralelo a la 4; se coloca al final solo para no retrasar el MVP y el despliegue. Al integrarlo hay que cubrirlo en las pruebas de la Fase 5a.
- **Entregables**:
  - `game-engine/poker`: evaluador de manos de 5 de 7 cartas, máquina de estados de la mano (blinds, preflop/flop/turn/river, showdown), validación de acciones (fold/check/call/bet/raise/all-in), apuestas mínimas y re-raise, **bote principal y botes laterales**, reparto de empates (y ficha impar). Implementa `Game`.
  - Fairness para varios jugadores: barajado por mano con `serverSeed` comprometido + `clientSeed` combinado de todos los asientos + `nonce` de mano; verificable tras la rotación (ver ADR-003, ampliar con un ADR-004 si cambia el esquema).
  - API: módulo `poker` (mesas cash, asientos, buy-in y recarga, sentarse/levantarse, temporizador de turno con _time bank_ y fold automático, desconexión → sit-out) usando `lobby`, `wallet`, `rounds`, `fairness` y `canBet`. El buy-in mueve fichas de la billetera a la mesa mediante asientos del ledger; al levantarse se devuelven.
  - **Rake** opcional en fichas (cuenta `HOUSE`) con tope por mano, configurable por mesa.
  - Eventos por mano guardados en `rounds` (reproducibles); cada jugador solo recibe sus cartas privadas hasta el showdown.
  - Web: lobby de mesas de póker, mesa con asientos, acciones con temporizador, historial de manos y verificador.
  - Mitigación básica de abuso: una cuenta por asiento/mesa, límite de recargas, detección simple de _chip dumping_ entre cuentas (alerta en admin).
- **Criterios de aceptación**:
  - Evaluador de manos validado contra las 2 598 960 manos de 5 cartas (conteo de cada categoría igual al teórico) y contra una implementación de referencia independiente en 100 000 manos de 7 cartas aleatorias.
  - Propiedades (fast-check): conservación de fichas en cada mano (Σ stacks + rake antes = después); los botes laterales suman exactamente el total apostado; nadie gana más de lo que puede cubrir en cada bote.
  - Reproducir una mano desde sus eventos da el mismo resultado; la verificación pública reproduce el orden de la baraja.
  - Simulación de 1 M de manos con bots aleatorios sin estados inválidos ni fichas perdidas.
  - Un jugador nunca recibe cartas ajenas por WebSocket ni por HTTP antes del showdown (test que inspecciona todos los mensajes).
  - Mesa de 6 jugadores con una desconexión y reconexión a mitad de mano recupera su estado sin duplicar acciones; el turno vence y hace fold/check automático en el plazo configurado (±1 s).
  - Cobertura ≥ 90 % en `game-engine/poker`.
- **Riesgos**: complejidad de botes laterales y all-ins; filtración de información oculta; temporizadores y propiedad de la mesa entre instancias; colusión/multicuentas (sin KYC solo se mitiga, no se elimina); el barajado compartido exige explicar bien qué garantiza (que la casa no manipula, no que los jugadores no se alíen). Mitigación: motor puro con tests de propiedades, mensajes filtrados por asiento en un único punto, reutilización del patrón de dueño único de mesa de la Fase 3.
- **Estimación**: 4–6 semanas.
- **Fuera de alcance (backlog)**: torneos (_sit & go_ / multimesa), Omaha y otras variantes, bots con IA, video póker.

---

## Calendario orientativo

| Fase  | Duración    | Acumulado    |
| ----- | ----------- | ------------ |
| 0     | 2–3 días    | ~0,5 semanas |
| 1     | 2–3 semanas | ~3 semanas   |
| 2     | 3–4 semanas | ~7 semanas   |
| 3     | 3–4 semanas | ~11 semanas  |
| 4     | 4–5 semanas | ~16 semanas  |
| 5a/5b | 3–5 semanas | ~21 semanas  |
| 6     | 4–6 semanas | ~27 semanas  |

Un MVP presentable (login, wallet, blackjack verificable) está tras la **Fase 2** (~7 semanas).

## Backlog futuro

- Torneos de fichas (clasificaciones, entradas, premios) con colas BullMQ.
- Bonos con requisitos de apuesta (_wagering_), fichas "bloqueadas" y reglas de liberación.
- Blackjack multijugador en mesa compartida.
- Poker: torneos _sit & go_ y multimesa, Omaha, modo espectador de mesas.
- Más juegos: ruleta, video póker, dados (_crash/dice_) con el mismo esquema provably fair.
- Programa de fidelidad / niveles VIP con fichas virtuales.
- Chat de mesa moderado y lista de amigos.
- Modo espectador de mesas y repeticiones de rondas compartibles.
- Estadísticas personales y exportación de historial.
- Internacionalización (es/en) y accesibilidad (WCAG).
- Extracción de servicios (mesas en tiempo real, simulación) si el tráfico lo justifica.
- Feature flags y configuración dinámica de juegos desde el panel admin.
- Pruebas E2E con Playwright y pruebas de caos para el ledger.
