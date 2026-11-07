import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
  Check,
} from 'typeorm';

import { Practica } from './practica.entity';
import { Estudiante } from 'src/estudiante/entities/estudiante.entity';

@Entity('nota_practica' )
@Unique(['estudiante', 'practica'])
@Check(`nota BETWEEN 0 AND 100`)
export class NotaPractica {

  @PrimaryGeneratedColumn()
  id_nota_practica: number;

  @Column('decimal', { precision: 5, scale: 2 })
  nota: number;

  @ManyToOne(() => Estudiante, (estudiante) => estudiante.notasPracticas, {
    onDelete: 'CASCADE',
  })
  estudiante: Estudiante;

  @ManyToOne(() => Practica, (practica) => practica.notas, {
    onDelete: 'CASCADE',
  })
  practica: Practica;
}