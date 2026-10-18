import { Entity, PrimaryGeneratedColumn, Column, OneToMany, Check } from 'typeorm';
import { NotaProyecto } from './nota-proyecto.entity';


@Entity('proyecto')
@Check(`numero_proyecto BETWEEN 1 AND 3`)
export class Proyecto {

  @PrimaryGeneratedColumn()
  id_proyecto: number;

  @Column()
  numero_proyecto: number;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column('decimal', { precision: 5, scale: 2 })
  ponderacion: number;

  @OneToMany(() => NotaProyecto, (nota) => nota.proyecto)
  notas: NotaProyecto[];
}