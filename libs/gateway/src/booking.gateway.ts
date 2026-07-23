import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class BookingGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string | number, string>();

  handleConnection(client: Socket) {
    const userId = client.handshake.auth.userId;
    if (userId) {
      this.userSockets.set(userId, client.id);
      console.log(`User ${userId} connected`);
    }
  }

  handleDisconnect(client: Socket) {
    this.userSockets.forEach((socketId, uId) => {
      if (socketId === client.id) {
        this.userSockets.delete(uId);
        console.log(`User ${uId} disconnected`);
      }
    });
  }

  notifyUser(userId: string | number, booking: any): boolean {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('new_booking', booking);
      return true; // user is online
    }
    return false; // user is offline
  }

  dismissNotification(userId: string | number) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('booking_taken');
    }
  }
}
