import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../lib/logger.js';
import { authenticateWsUpgrade, WsAuthResult } from './auth.js';
import { AdminClient, webSocketBridge } from './bridge.js';
import { SessionEventCoalescer } from './coalesce.js';
import { clientMessageSchema } from '@examguard/shared';
import { createWsEnvelope, safeSendJson } from './protocol.js';

export function createWebSocketServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024, // 64 KB message limit
  });

  // 1. Handle HTTP upgrade to WebSocket on /ws
  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    if (url.pathname !== '/ws') {
      return; // Hand off or ignore non-/ws paths
    }

    try {
      const authResult = await authenticateWsUpgrade(req);

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, authResult);
      });
    } catch (err: any) {
      const isUnauth = err?.message === 'UNAUTHENTICATED';
      const statusCode = isUnauth ? 401 : 403;
      const statusText = isUnauth ? 'Unauthorized' : 'Forbidden';

      logger.warn(
        { reason: err?.message, origin: req.headers.origin },
        `WebSocket handshake rejected: ${statusCode} ${statusText}`
      );

      socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    }
  });

  // 2. Client connection lifecycle
  wss.on('connection', (ws: WebSocket, _req: http.IncomingMessage, authResult: WsAuthResult) => {
    const coalescer = new SessionEventCoalescer(ws, 1000);
    const adminClient: AdminClient = {
      ws,
      adminUserId: authResult.userId,
      sessionToken: authResult.session.tokenHash,
      isAlive: true,
      subscriptions: new Set(),
      coalescer,
    };

    webSocketBridge.addClient(adminClient);

    ws.on('pong', () => {
      adminClient.isAlive = true;
    });

    ws.on('message', (data: Buffer | string) => {
      try {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        const json = JSON.parse(text);
        const parsed = clientMessageSchema.safeParse(json);

        if (!parsed.success) {
          logger.warn({ err: parsed.error.format() }, 'Invalid client WebSocket message received');
          return;
        }

        const msg = parsed.data;
        if (msg.action === 'subscribe') {
          adminClient.subscriptions.add(msg.channel);
          logger.debug(
            { adminUserId: adminClient.adminUserId, channel: msg.channel },
            'Admin client subscribed to channel'
          );
        } else if (msg.action === 'ping') {
          safeSendJson(
            ws,
            createWsEnvelope('pong', { timestamp: new Date().toISOString() })
          );
        }
      } catch (err: any) {
        logger.warn({ err: err?.message }, 'Malformed WebSocket frame received');
      }
    });

    ws.on('error', (err) => {
      logger.warn({ err: err.message }, 'WebSocket client error');
      webSocketBridge.removeClient(adminClient);
    });

    ws.on('close', () => {
      webSocketBridge.removeClient(adminClient);
    });
  });

  // 3. Heartbeat interval every 25 seconds
  const heartbeatInterval = setInterval(() => {
    for (const client of webSocketBridge.getClients()) {
      if (!client.isAlive) {
        logger.info({ adminUserId: client.adminUserId }, 'Terminating unresponsive WebSocket client');
        client.ws.terminate();
        webSocketBridge.removeClient(client);
        continue;
      }

      client.isAlive = false;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }, 25000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return wss;
}
