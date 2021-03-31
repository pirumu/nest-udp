# nest-udp

[Docs](https://github.com/nattogo/nest-udp/README.MD) |
[MIT Licensed](LICENSE.md)

A UDP microservice strategy implementation(with node dgram) for NestJS.

## Usage example


```typescript

const hybridAppConfig = {
    host: '127.0.0.1',
    port: 6545
};
const app = await NestFactory.create(AppModule);
app.connectMicroservice({
    strategy: new UdpServer({
    bindOptions: {
        address: hybridAppConfig.host,
        port: hybridAppConfig.port
    },
    socketOptions: {
        type: SocketType.UDP4
    }
    })
});
await app.startAllMicroservices();
await app.listen(hybridAppConfig.port, hybridAppConfig.host);
```

Decorate your controllers with the `@UdpGateway` and `@IncomingMessage` decorators:

```typescript
@UdpGateway()
@Controller()
export class UDPController {
  @IncomingMessage()
  public async message(@Payload() data, @Ctx() ctx: UdpContext) {
    console.log("incoming message");
    return data;
  }
}
```

