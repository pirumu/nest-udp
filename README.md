<p align="center">
  <a href="https://nestjs.com/" target="blank">
    <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
  </a>
</p>

<h1 align="center">@pirumu/nest-udp</h1>

<p align="center">
  A NestJS microservice transport layer for UDP communication.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@pirumu/nest-udp"><img src="https://img.shields.io/npm/v/@pirumu/nest-udp.svg" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/package/@pirumu/nest-udp"><img src="https://img.shields.io/npm/l/@pirumu/nest-udp.svg" alt="Package License" /></a>
  <a href="https://www.npmjs.com/package/@pirumu/nest-udp"><img src="https://img.shields.io/npm/dm/@pirumu/nest-udp.svg" alt="NPM Downloads" /></a>
</p>

## Features

- **Full NestJS Integration** - Seamless microservices architecture support
- **UDP Client & Server** - Complete implementation for both sides using Node.js dgram module
- **Dual Pattern Support** - Message patterns (request-response) and event patterns (fire-and-forget)
- **Highly Customizable** - Flexible socket options and custom implementations
- **TypeScript First** - Full type safety and IntelliSense support

## Requirements

- **Node.js**: v20.0.0 or higher
- **NestJS**: v11.0.0 or higher

## Installation

```bash
npm install @pirumu/nest-udp
```

```bash
yarn add @pirumu/nest-udp
```

```bash
pnpm add @pirumu/nest-udp
```

## Quick Start

### 1. Server Setup

Create a UDP microservice server using Node.js dgram:

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { ServerUdp } from '@pirumu/nest-udp';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      strategy: new ServerUdp({
        host: '0.0.0.0',
        port: 41234,
        transport: 'udp4',
      }),
    },
  );

  await app.listen();
}
bootstrap();
```

### 2. Define Controllers

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload, Ctx } from '@nestjs/microservices';
import { UdpContext } from '@pirumu/nest-udp';

@Controller()
export class AppController {
  // Request-Response pattern
  @MessagePattern('calculate')
  calculate(@Payload() data: { a: number; b: number }) {
    return { result: data.a + data.b };
  }

  // Fire-and-forget pattern
  @EventPattern('user.created')
  handleUserCreated(@Payload() user: any, @Ctx() context: UdpContext) {
    console.log('New user:', user);
  }
}
```

### 3. Client Setup

Register the UDP client in your module:

```typescript
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { ClientUdp } from '@pirumu/nest-udp';

@Module({
  imports: [
    ClientsModule.register({
      clients: [
        {
          name: 'UDP_SERVICE',
          customClass: ClientUdp,
          options: {
            host: 'localhost',
            port: 41234,
            transport: 'udp4',
          },
        },
      ],
    }),
  ],
})
export class AppModule {}
```

### 4. Use the Client

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { ClientUdp } from '@pirumu/nest-udp';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class AppService {
  constructor(
    @Inject('UDP_SERVICE') private readonly client: ClientUdp
  ) {}

  async calculate(a: number, b: number) {
    // Request-response (waits for reply)
    return lastValueFrom(
      this.client.send('calculate', { a, b })
    );
  }

  notifyUserCreated(user: any) {
    // Fire-and-forget (no reply expected)
    this.client.emit('user.created', user).subscribe();
  }
}
```

## API Reference

### ServerUdp Options

Built on top of Node.js `dgram` module (available since Node.js v20).

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `host` | `string` | `'0.0.0.0'` | Server bind address |
| `port` | `number` | `3000` | Server listening port |
| `transport` | `'udp4' \| 'udp6'` | `'udp4'` | UDP protocol version |
| `socketOptions` | `dgram.SocketOptions` | `{}` | Node.js dgram socket options |
| `bindOptions` | `dgram.BindOptions` | `{}` | Node.js dgram bind options |

### ClientUdp Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `host` | `string` | `'localhost'` | Target server address |
| `port` | `number` | `3000` | Target server port |
| `type` | `'udp4' \| 'udp6'` | `'udp4'` | UDP protocol version |
| `socketClass` | `Type<UdpSocket>` | `JsonUdpSocket` | Custom socket implementation |
| `socketOptions` | `dgram.SocketOptions` | `{}` | Node.js dgram socket options |
| `bindOptions` | `dgram.BindOptions` | `{}` | Node.js dgram bind options |

### ClientUdp Methods

#### **send(pattern, data): Observable**

Send a message and expect a response (request-response pattern).

```typescript
client.send('getUserById', { id: 123 })
  .subscribe(user => console.log(user));
```

#### **emit(pattern, data): Observable**

Emit an event without expecting a response (fire-and-forget pattern).

```typescript
client.emit('order.placed', { orderId: 456 })
  .subscribe(() => console.log('Event emitted'));
```

#### **connect(): Promise\<void\>**

Manually establish connection. Called automatically by `send()` and `emit()`.

```typescript
await client.connect();
```

#### **close(): void**

Close the UDP connection and cleanup resources.

```typescript
client.close();
```

## Advanced Usage

### Custom Socket Class

Implement your own socket class:

```typescript
import { UdpSocket } from '@pirumu/nest-udp';
import * as dgram from 'node:dgram';

class MsgPackUdpSocket extends UdpSocket {
  sendMessage(message: any, host: string, port: number): void {
    const buffer = msgpack.encode(message);
    this.udpSocket.send(buffer, port, host);
  }
}

// Use in client configuration
ClientsModule.register({
  clients: [{
    name: 'UDP_SERVICE',
    customClass: ClientUdp,
    options: {
      socketClass: MsgPackUdpSocket,
      // ... other options
    },
  }],
})
```

### Error Handling with RxJS

Leverage RxJS operators for robust error handling:

```typescript
import { catchError, retry, timeout } from 'rxjs/operators';
import { of } from 'rxjs';

client.send('unreliable-service', { data: 'test' })
  .pipe(
    timeout(5000),
    retry(3),
    catchError(error => {
      console.error('Request failed:', error);
      return of({ error: 'Service unavailable' });
    })
  )
  .subscribe(result => console.log(result));
```

### Working with Context

Access UDP-specific context information including dgram RemoteInfo:

```typescript
@MessagePattern('echo')
handleEcho(@Payload() data: any, @Ctx() context: UdpContext) {
  const remoteInfo = context.getRemoteInfo();
  console.log(`From: ${remoteInfo.address}:${remoteInfo.port}`);
  console.log(`Family: ${remoteInfo.family}`);
  console.log(`Size: ${remoteInfo.size} bytes`);
  return data;
}
```

### Native dgram Socket Access

Access the underlying dgram socket for advanced use cases:

```typescript
import * as dgram from 'node:dgram';

@Injectable()
export class AppService {
  constructor(
    @Inject('UDP_SERVICE') private readonly client: ClientUdp
  ) {}

  async onModuleInit() {
    await this.client.connect();
    
    // Access native dgram socket
    const socket = this.client.unwrap<dgram.Socket>();
    
    // Use native dgram APIs
    socket.setMulticastTTL(128);
    socket.setBroadcast(true);
  }
}
```


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is [MIT licensed](LICENSE).

## Support

- **Issues**: [GitHub Issues](https://github.com/pirumu/nest-udp/issues)

---

<p align="center">Made with love by Pirumu</p>
