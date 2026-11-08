# ADR-004: Autenticación y sesiones

- **Estado**: aceptado
- **Fecha**: 2026-11-07

## Contexto

La API necesita identificar al jugador en cada petición HTTP (y, desde la Fase 3, en el handshake de WebSocket) sin consultar la base de datos cada vez. Las sesiones deben poder revocarse (logout, robo de token). La web (`:3000`) y la API (`:4000`) están en orígenes distintos.

## Decisión

1. **Access token JWT** (HS256, 15 min por defecto) con `sub` y `role`. Va en `Authorization: Bearer` y la web lo guarda **solo en memoria**, nunca en `localStorage`.
2. **Refresh token opaco** (`<id>.<secreto>` de 32 bytes aleatorios), en una cookie `httpOnly`, `SameSite=Lax` y `Path=/auth`, así que solo viaja a `/auth/*`. La BD guarda únicamente `SHA-256(secreto)`.
3. **Rotación con detección de reutilización.** Cada `POST /auth/refresh` revoca el token presentado y emite otro de la misma familia (`familyId` = una sesión). Presentar un token ya rotado revoca la familia entera y obliga a entrar de nuevo. Una ventana de gracia corta (`REFRESH_REUSE_GRACE_SECONDS`, 10 s) tolera dos pestañas refrescando a la vez con la misma cookie; la web además agrupa los refrescos concurrentes en una sola petición.
4. **Contraseñas con scrypt** (`node:crypto`, sin addons nativos; N = 2¹⁵, r = 8, p = 1). Los parámetros se guardan junto al hash, así que el coste puede subirse sin invalidar los hashes existentes. En el login, si el e-mail no existe se verifica contra un hash señuelo, para que el tiempo de respuesta no revele qué cuentas existen.
5. **Guards globales**: rate limit → `JwtAuthGuard` (todo requiere token salvo `@Public()`) → `RolesGuard` (`@Roles('ADMIN')`). Las rutas de credenciales (`login`, `register`) tienen un límite propio más estricto por IP.

## Alternativas consideradas

| Alternativa                             | Por qué no                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sesión de servidor con cookie (sin JWT) | Una consulta a la BD (o a Redis) por petición, y el handshake de WebSocket entre instancias es más incómodo.                 |
| Refresh JWT de larga duración           | No se puede revocar sin una lista negra, que es justo el estado que el token opaco ya tiene.                                 |
| Access token en `localStorage`          | Cualquier XSS lo roba. En memoria se pierde al recargar, pero la cookie de refresco lo recupera.                             |
| bcrypt / argon2                         | argon2 es la mejor opción, pero exige un addon nativo; scrypt es memory-hard y viene con Node. Se puede migrar más adelante. |
| Passport                                | Añade una capa de abstracción que no hace falta para un único método (email + contraseña).                                   |

## Consecuencias

- **(+)** Las peticiones autenticadas no tocan la BD para validar la sesión; las sesiones se revocan de forma inmediata en el refresco.
- **(+)** Un refresh token robado y usado deja rastro: la siguiente rotación del dueño legítimo revoca la sesión.
- **(−)** Un access token robado vale hasta que caduca (≤ 15 min); un cambio de rol tarda lo mismo en aplicarse.
- **(−)** Con la web y la API en sitios distintos en producción hará falta `REFRESH_COOKIE_SAMESITE=none` + `REFRESH_COOKIE_SECURE=true` (la configuración lo valida al arrancar) y protección CSRF adicional en `/auth/refresh`.
