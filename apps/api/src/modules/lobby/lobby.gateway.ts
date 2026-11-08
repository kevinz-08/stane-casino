import { WebSocketGateway } from '@nestjs/websockets';
import { LobbyService } from './lobby.service';

// Socket.IO gateway: the client sends intents, the server broadcasts results.
// TODO(fase-3): auth handshake, join/leave table, broadcast WS_EVENTS.server.* from @casino/shared
@WebSocketGateway({ cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' } })
export class LobbyGateway {
  constructor(private readonly lobbyService: LobbyService) {}
}
