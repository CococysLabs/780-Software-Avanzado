import { Module } from '@nestjs/common';
import { PracticaService } from './practica.service';
import { PracticaController } from './practica.controller';
import { TypeOrmModule } from '@nestjs/typeorm/dist/typeorm.module';
import { Practica } from './entities/practica.entity';
import { NotaPractica } from './entities/nota-practica.entity';

@Module({
  controllers: [PracticaController],
  providers: [PracticaService],
  imports: [TypeOrmModule.forFeature([Practica, NotaPractica]),],
})
export class PracticaModule {}
