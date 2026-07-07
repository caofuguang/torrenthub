// WebSocket 推送中心
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WSMessage } from '@shared/types';

let wss: WebSocketServer;

export function initWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connected', payload: { time: Date.now() } }));
  });
  return wss;
}

export function broadcast(message: WSMessage): void {
  if (!wss) return;
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function getClients(): number {
  return wss?.clients.size || 0;
}
