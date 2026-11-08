# ADR-005: UI de juego dirigida por eventos

- **Estado**: aceptado
- **Fecha**: 2026-11-08

## Contexto

La mesa de blackjack de la Fase 2 pintaba el estado final de cada respuesta. Si el crupier robaba tres cartas y se pasaba, el jugador veía el resultado de golpe, sin el "momento" del reparto. Se quería una mesa con vida: cartas que salen del zapato, una carta tapada que se gira, fichas que se mueven y un crupier que reacciona. Todo ello sin romper el principio de servidor autoritativo ni filtrar información oculta.

## Decisión

1. **La API devuelve el delta de eventos.** `POST /blackjack/rounds` y `POST /blackjack/rounds/:id/actions` incluyen `events`: solo los eventos que produjo esa petición, con la carta tapada redactada como siempre. El estado sigue viajando en `view`.
2. **El cliente reproduce esos eventos como una línea de tiempo** (`apps/web/src/features/blackjack`):
   - `scene.ts`: una "escena" visual que avanza evento a evento (`applyEvent`) o se construye directamente desde la vista del servidor (`sceneFromView`).
   - `timeline.ts`: cuánto dura cada evento en pantalla, qué suena y cómo reacciona el crupier. Es una función pura.
   - `use-event-player.ts`: la cola con temporizadores, que se puede saltar y tiene velocidad configurable.
3. **La vista del servidor manda.** Cuando la cola se vacía, la escena animada se compara con `sceneFromView(view)`. Si difieren en cualquier cosa visible, se sustituye por la del servidor. La animación decide _cuándo_ se ve algo, nunca _qué_.
4. **La información oculta no llega al DOM.** Una carta boca abajo no guarda su valor en la escena, aunque la misma respuesta la revele después. Su cara solo se renderiza desde `HOLE_CARD_REVEALED`.
5. **Sin animación cuando no aporta.** Al recargar o reconectar, y con la velocidad "Sin animación" (elección explícita del jugador), la escena final se pinta al instante. Con `prefers-reduced-motion` **se mantiene la secuencia** carta a carta, pero sin desplazamientos (`<MotionConfig reducedMotion="user">`): reducir el movimiento no es lo mismo que destripar la ronda de golpe.
6. **Ritmo pausado** (`pacing.ts`, compartido por las cartas y la línea de tiempo). Cada carta sale boca abajo del zapato, aterriza y solo entonces se gira. La carta tapada se revela tras una pausa de suspense. Los totales y el sello "¡Te pasas!" solo se actualizan cuando la carta ya se ve. Una mano en la velocidad normal dura ~5–8 s; "Rápida" la reduce al 45 %.
7. **El saldo de la cabecera se actualiza al terminar la animación**, para que no adelante el resultado.
8. **Arte propio y sin descargas.** Cartas, fichas, tapete, zapato y crupier son SVG del proyecto, y los sonidos se sintetizan con Web Audio. Sin licencias de terceros que vigilar; ver `apps/web/ASSETS.md`.

## Alternativas consideradas

| Alternativa                                                   | Por qué no                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Animar diferencias entre dos vistas (estado anterior → nuevo) | Pierde el orden de los hechos (qué carta salió antes) y es frágil con los splits                                            |
| WebSocket con eventos uno a uno desde el servidor             | Llega en la Fase 3 para las mesas multijugador; para un juego individual por HTTP no aporta nada y complica la idempotencia |
| Mesa en 3D (three.js)                                         | +2–3 semanas, más peso y riesgo en móvil; los packs CC0 no traen la animación de repartir                                   |
| Assets de terceros (Kenney, Open Peeps)                       | Válidos (CC0), pero exigían descargar binarios. Se pueden incorporar después sin tocar la arquitectura                      |

## Consecuencias

- **(+)** La mesa tiene ritmo (reparto, peek, revelado, pagos) y el crupier reacciona a lo que ocurre. Todo sigue siendo reproducible y verificable.
- **(+)** Hay un test que, en 3000 rondas simuladas, comprueba que la escena construida desde eventos redactados coincide con la vista del servidor tras cada respuesta. Un test E2E lo confirma en el navegador real con 20 rondas.
- **(−)** Hay que mantener `applyEvent` alineado con el reducer del motor. Lo vigila el test anterior: cualquier desajuste lo hace fallar.
- **(−)** Cada tipo de evento nuevo (p. ej. en el póker) necesita su paso en `timeline.ts`.
