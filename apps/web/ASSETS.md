# Assets y licencias (web)

Todo el arte y el sonido de la mesa de blackjack es **propio del proyecto**: no hay imágenes, fuentes de iconos ni audio de terceros que redistribuir.

| Elemento                                         | Origen                                                                          | Dónde                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------- |
| Cartas (caras, índices, pips, figuras, reverso)  | SVG propio                                                                      | `src/components/cards/`                  |
| Fichas                                           | SVG propio                                                                      | `src/components/chips/`                  |
| Crupier "Marco"                                  | SVG propio, animado por capas con Motion                                        | `src/features/blackjack/dealer.tsx`      |
| Tapete, madera, zapato, bandeja de fichas        | CSS/SVG propio; textura de fieltro generada en un canvas en tiempo de ejecución | `src/features/blackjack/table-parts.tsx` |
| Sonidos (repartir, girar, fichas, ganar, perder) | Sintetizados con Web Audio API                                                  | `src/lib/sound.ts`                       |
| Tipografías Playfair Display e Inter             | Google Fonts, licencia SIL Open Font License 1.1, servidas por `next/font`      | `src/app/layout.tsx`                     |

## Librerías

| Paquete                  | Licencia   | Uso                                                     |
| ------------------------ | ---------- | ------------------------------------------------------- |
| `motion`                 | MIT        | Animaciones (reparto, giro, fichas, gestos del crupier) |
| `canvas-confetti`        | ISC        | Confeti en un blackjack                                 |
| `@playwright/test` (dev) | Apache-2.0 | Tests end-to-end                                        |

## Si se quieren assets externos más adelante

Los packs CC0 de Kenney (Playing Cards, Boardgame, Casino Audio) y Open Peeps (CC0) encajarían sin cambios de arquitectura: basta con sustituir `CardFace`/`CardBack`, `Chip`, `playSound` o `Dealer`. Cualquier asset nuevo debe añadirse a esta tabla con su origen y licencia, comprobada en la página de descarga.
