import { Module } from '@nestjs/common';
import { ProyectoService } from './proyecto.service';
import { ProyectoController } from './proyecto.controller';
import { TypeOrmModule } from '@nestjs/typeorm/dist/typeorm.module';
import { NotaProyecto } from './entities/nota-proyecto.entity';
import { Proyecto } from './entities/proyecto.entity';

@Module({
  controllers: [ProyectoController],
  providers: [ProyectoService],
  imports: [TypeOrmModule.forFeature([Proyecto, NotaProyecto]),],
})
export class ProyectoModule {}
