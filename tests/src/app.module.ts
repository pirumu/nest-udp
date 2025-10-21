import { Module, Injectable } from '@nestjs/common';
import { AppController } from './app.controller';
import {
  ClientsModule,
  ClientsModuleOptionsFactory,
  ClientOptions,
  RpcException,
} from '@nestjs/microservices';
import { ClientUdp, UDP_TRANSPORT } from '@pirumu/nest-udp';

class ErrorHandlingProxy extends ClientUdp {
  serializeError(err) {
    return new RpcException(err);
  }
}

@Injectable()
class ConfigService {
  private readonly config = {
    transport: UDP_TRANSPORT,
  };
  get(key: string) {
    return this.config[key];
  }
}

@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
class ConfigModule {}

@Injectable()
class ClientOptionService implements ClientsModuleOptionsFactory {
  constructor(private readonly configService: ConfigService) {}
  createClientOptions(): Promise<ClientOptions> | ClientOptions {
    return {
      transport: this.configService.get('transport'),
      options: {},
    };
  }
}

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        imports: [ConfigModule],
        inject: [ConfigService],
        name: 'CUSTOM_PROXY_CLIENT',
        useFactory: (config: ConfigService) => ({
          customClass: ErrorHandlingProxy,
        }),
      },
    ]),
  ],
  controllers: [AppController],
})
export class AppModule {}
