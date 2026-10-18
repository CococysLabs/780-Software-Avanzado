import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { NatsModule } from 'src/transports/nats-module/nats-module.module';

@Module({
  controllers: [AuthController],
  providers: [],
  imports: [NatsModule],
})
export class AuthModule {}
