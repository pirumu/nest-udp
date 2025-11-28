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
- **Improved UDP Reliability** - REQ/ACK/RES pattern with automatic retries and chunk reassembly
- **Compression Support** - Built-in gzip, optional snappy, lz4, zstd compression
- **Large Payload Handling** - Automatic chunking and reassembly for messages exceeding MTU
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
| `socketClass` | `Type<UdpSocket>` | `JsonUdpSocket` | Socket implementation (JsonUdpSocket, ReliableUdpSocket, or custom) |
| `socketOptions` | `dgram.SocketOptions` | `{}` | Node.js dgram socket options |
| `bindOptions` | `dgram.BindOptions` | `{}` | Node.js dgram bind options |
| `reliableOptions` | `ReliableUdpSocketOptions` | - | ReliableUdpSocket configuration (when using ReliableUdpSocket) |

### ClientUdp Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `host` | `string` | `'localhost'` | Target server address |
| `port` | `number` | `3000` | Target server port |
| `type` | `'udp4' \| 'udp6'` | `'udp4'` | UDP protocol version |
| `socketClass` | `Type<UdpSocket>` | `JsonUdpSocket` | Socket implementation (JsonUdpSocket, ReliableUdpSocket, or custom) |
| `socketOptions` | `dgram.SocketOptions` | `{}` | Node.js dgram socket options |
| `bindOptions` | `dgram.BindOptions` | `{}` | Node.js dgram bind options |
| `reliableOptions` | `ReliableUdpSocketOptions` | - | ReliableUdpSocket configuration (when using ReliableUdpSocket) |


### ReliableUdpSocketOptions

Configuration for `ReliableUdpSocket`. Used when `socketClass: ReliableUdpSocket`.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `maxMessageSize` | `number` | `1400` | Maximum message size before chunking |
| `maxRetries` | `number` | `3` | Maximum retry attempts per message/chunk |
| `retryInterval` | `number` | `100` | Milliseconds between retry attempts |
| `enableChecksum` | `boolean` | `true` | Enable SHA-256 checksum validation |
| `requestTimeout` | `number` | `5000` | Request timeout in milliseconds |
| `chunkSize` | `number` | `1200` | Size of each chunk in bytes |
| `reassemblyTimeout` | `number` | `30000` | Timeout for chunk reassembly |
| `compression` | `CompressionConfig` | - | Compression configuration |
| `messageIdOptions` | `object` | - | Snowflake ID generator options |

### CompressionConfig

Compression configuration for `ReliableUdpSocket`.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable compression |
| `codec` | `CompressionCodecType` | `GZIP` | Compression codec to use |
| `level` | `number` | `6` | Compression level (codec-specific) |
| `minSize` | `number` | `256` | Minimum size in bytes to compress |
| `minReduction` | `number` | `10` | Minimum reduction percentage to use compression |

**Available Compression Codecs:**

Built-in:
- `CompressionCodecType.NONE` - No compression
- `CompressionCodecType.GZIP` - Built-in gzip compression

Requires npm packages:
- `CompressionCodecType.SNAPPY` - Fast, moderate compression (needs `snappy`)
- `CompressionCodecType.LZ4` - Very fast, moderate compression (needs `lz4`)
- `CompressionCodecType.ZSTD` - Best compression, fast (needs `@mongodb-js/zstd`)

```bash
pnpm add snappy lz4 @mongodb-js/zstd
```

## Socket Implementations

> [!WARNING]
> **UDP Protocol Limitations**
>
> UDP is inherently unreliable and has strict payload size limits:
> - **Theoretical maximum**: 65,507 bytes
> - **Practical safe limit**: ~1,400 bytes (network MTU dependent)
>
> Payloads exceeding MTU get fragmented. If ANY fragment is lost, the ENTIRE message is lost silently.
>
> **Common symptoms:**
> - Requests hang with no response
> - Intermittent failures (works sometimes, fails other times)
> - Works on localhost but fails over network

> [!IMPORTANT]
> **When to Use TCP Instead**
>
> Use NestJS TCP transport if you need:
> - Large messages
> - 100% guaranteed message delivery
> - Connection-oriented communication

### JsonUdpSocket (Default)

The default socket implementation uses JSON serialization. Suitable for small messages (< 1.4KB) with basic UDP reliability.

### ReliableUdpSocket

Provides improved reliability through REQ/ACK/RES pattern with automatic retries, chunking, and compression.

> [!NOTE]
> ReliableUdpSocket improves UDP reliability but **cannot make UDP 100% reliable**. Packets can still be lost, duplicated, or arrive out of order due to UDP protocol limitations.

#### Configuration

```typescript
import { ReliableUdpSocket, CompressionCodecType } from '@pirumu/nest-udp';

// Server
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    strategy: new ServerUdp({
      host: '0.0.0.0',
      port: 41235,
      type: 'udp4',
      socketClass: ReliableUdpSocket,
      reliableOptions: {
        // Message and retry configuration
        maxMessageSize: 1400,
        maxRetries: 3,
        retryInterval: 100,
        enableChecksum: true,

        // Compression configuration
        compression: {
          enabled: true,
          codec: CompressionCodecType.GZIP,
          level: 6,
          minSize: 256,
          minReduction: 10,
        },

        // Chunking configuration
        chunkSize: 1200,
        reassemblyTimeout: 30000,

        // Request tracking
        requestTimeout: 5000,
      },
    }),
  },
);

// Client
ClientsModule.register([{
  name: 'UDP_SERVICE',
  customClass: ClientUdp,
  options: {
    host: 'localhost',
    port: 41235,
    type: 'udp4',
    socketClass: ReliableUdpSocket,
    reliableOptions: {
      maxMessageSize: 1400,
      maxRetries: 3,
      retryInterval: 100,
      enableChecksum: true,

      compression: {
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      },

      chunkSize: 1200,
      reassemblyTimeout: 30000,
      requestTimeout: 5000,
    },
  },
}])
```

See [ReliableUdpSocketOptions](#reliableudpsocketoptions) in API Reference for all configuration options.

#### Features

**Improved Reliability:**
- REQ/ACK/RES pattern improves delivery success rate
- Automatic retries with configurable attempts and intervals
- SHA-256 checksum validation for data integrity
- Request tracking with timeout handling

**Large Payloads:**
- Automatic chunking for messages exceeding `maxMessageSize`
- Each chunk uses REQ/ACK pattern for improved delivery
- Automatic reassembly with timeout protection
- Base64 encoding for binary-safe chunk transmission

**Compression:**
- Multiple codec support (gzip, snappy, lz4, zstd)
- Smart compression (only if size reduction meets threshold)
- Configurable compression level and minimum size
- Transparent compression/decompression
- Reduces message size by 60-90% for typical JSON data

**Performance:**
- Snowflake ID generation for unique message IDs
- Efficient bit-packed message envelopes
- Configurable buffer sizes for high-throughput scenarios

> [!TIP]
> **Examples**
>
> - `examples/reliable-server.ts` - Complete server example
> - `examples/reliable-client.ts` - Complete client example


## Advanced Usage

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
### Custom Socket Class

Implement your own socket class for custom serialization:

```typescript
import { UdpSocket } from '@pirumu/nest-udp';
import * as dgram from 'node:dgram';

class MsgPackUdpSocket extends UdpSocket {
  protected handleSend(message: any, host?: string, port?: number, callback?: (err?: any) => void): void {
    const buffer = msgpack.encode(message);
    this.socket.send(buffer, port!, host!, callback);
  }

  protected handleData(data: Buffer, rinfo: dgram.RemoteInfo): void {
    const message = msgpack.decode(data);
    this.socket.emit('data', message, rinfo);
  }
}

// Use in configuration
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


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is [MIT licensed](LICENSE).

## Support

- **Issues**: [GitHub Issues](https://github.com/pirumu/nest-udp/issues)

---

<p align="center">Made with love by Pirumu</p>
