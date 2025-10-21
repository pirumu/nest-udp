import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DisconnectedClientController } from '../src/disconnected-client.controller';
import { UDP_TRANSPORT } from '@pirumu/nest-udp';

describe('Disconnected client', () => {
  let server: App;
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DisconnectedClientController],
    }).compile();

    app = module.createNestApplication();
    server = app.getHttpAdapter().getInstance();

    await app.init();
  });

  it(`UDP`, () => {
    return request(server)
      .post('/')
      .send({
        transport: UDP_TRANSPORT,
      })
      .expect(408);
  });

  afterEach(async () => {
    await app.close();
  });
});
