import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
  Check,
} from 'typeorm';

import { Proyecto } from './proyecto.entity';
import { Estudiante } from 'src/estudiante/entities/estudiante.entity';

@Entity()
@Unique(['estudiante', 'proyecto'])
@Check(`nota BETWEEN 0 AND 100`)
export class NotaProyecto {

  @PrimaryGeneratedColumn()
  id_nota_proyecto: number;

  @Column('decimal', { precision: 5, scale: 2 })
  nota: number;

  @ManyToOne(() => Estudiante, (estudiante) => estudiante.notasProyectos, {
    onDelete: 'CASCADE',
  })
  estudiante: Estudiante;

  @ManyToOne(() => Proyecto, (proyecto) => proyecto.notas, {
    onDelete: 'CASCADE',
  })
  proyecto: Proyecto;
}