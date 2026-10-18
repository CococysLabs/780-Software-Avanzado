import { Entity, PrimaryGeneratedColumn, Column, OneToMany, Check } from 'typeorm';
import { NotaPractica } from './nota-practica.entity';


@Entity('practica')
@Check(`numero_practica BETWEEN 1 AND 12`)
export class Practica {

  @PrimaryGeneratedColumn()
  id_practica: number;

  @Column()
  numero_practica: number;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column('decimal', { precision: 5, scale: 2 })
  ponderacion: number;

  @OneToMany(() => NotaPractica, (nota) => nota.practica)
  notas: NotaPractica[];
}