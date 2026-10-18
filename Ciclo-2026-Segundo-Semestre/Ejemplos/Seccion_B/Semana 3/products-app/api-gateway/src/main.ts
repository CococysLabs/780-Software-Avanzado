import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { envs } from './config/envs';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('MAIN-API-GATEWAY')


  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api-gateway')
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );
  await app.listen(envs.port);

  logger.log(`API-Gateway running on port ${envs.port}`)
}
bootstrap();
