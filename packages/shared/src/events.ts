/**
 * WebSocket event names shared by the Socket.IO gateway (api) and the client (web).
 * The client only sends intents (`client:*`); the server answers with results (`server:*`).
 */
export const WS_EVENTS = {
  client: {
    // TODO(phase-3): join/leave table, place bet, game actions
    joinTable: 'client:table.join',
    leaveTable: 'client:table.leave',
  },
  server: {
    // TODO(phase-3): table state snapshots and round events
    tableState: 'server:table.state',
    roundEvent: 'server:round.event',
    error: 'server:error',
  },
} as const;
