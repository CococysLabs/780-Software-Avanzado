import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EstudianteModule } from './estudiante/estudiante.module';
import { ConfigModule } from '@nestjs/config';
import { PracticaModule } from './practica/practica.module';
import { ProyectoModule } from './proyecto/proyecto.module';

@Module({


  imports: [ConfigModule.forRoot({ isGlobal: true }), EstudianteModule, TypeOrmModule.forRootAsync({
    useFactory: () => ({
      type: 'postgres',
      host: process.env.DB_HOST_USER,
      port: +(process.env.DB_PORT || 5432),
      username: process.env.DB_USER,
      password: process.env.DB_PW,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      synchronize: true,
      ssl: {
        rejectUnauthorized: false,
      },
    }),
  }), PracticaModule, ProyectoModule,],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
