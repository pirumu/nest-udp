import { Controller, Post, Body, Inject } from '@nestjs/common';
import { ClientProxy, Ctx, MessagePattern } from '@nestjs/microservices';
import { UdpContext } from '@pirumu/nest-udp';

@Controller()
export class ReliableSocketController {
  constructor(
    @Inject('RELIABLE_CLIENT') private readonly client: ClientProxy,
  ) {}

  @Post('/reliable/echo')
  async testEcho(@Body() data: any) {
    return this.client.send('reliable.echo', data).toPromise();
  }

  @Post('/reliable/large-data')
  async testLargeData(@Body() data: any) {
    return this.client.send('reliable.largeData', data).toPromise();
  }

  @Post('/reliable/compressed')
  async testCompressed(@Body() data: any) {
    return this.client.send('reliable.compressed', data).toPromise();
  }

  @MessagePattern('reliable.echo')
  handleEcho(@Body() data: any, @Ctx() context: UdpContext) {
    return { received: data, timestamp: Date.now() };
  }

  @MessagePattern('reliable.largeData')
  handleLargeData(@Body() data: any) {
    return { received: true, size: JSON.stringify(data).length };
  }

  @MessagePattern('reliable.compressed')
  handleCompressed(@Body() data: any) {
    return { received: true, dataLength: data.payload?.length || 0 };
  }
}
