import { Module } from '@nestjs/common';
import { LobbyGateway } from './lobby.gateway';
import { LobbyService } from './lobby.service';

// Tables registry and real-time presence.
// TODO(fase-3): Redis adapter for horizontal scaling
@Module({
  providers: [LobbyGateway, LobbyService],
  exports: [LobbyService],
})
export class LobbyModule {}
