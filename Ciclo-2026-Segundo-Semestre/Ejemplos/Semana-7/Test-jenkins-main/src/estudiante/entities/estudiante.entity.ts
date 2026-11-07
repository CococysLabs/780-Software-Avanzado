import { NotaPractica } from 'src/practica/entities/nota-practica.entity';
import { NotaProyecto } from 'src/proyecto/entities/nota-proyecto.entity';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';


@Entity('estudiante')
export class Estudiante {

  @PrimaryGeneratedColumn()
  id_estudiante: number;

  @Column({ unique: true })
  carnet: string;

  @Column()
  nombres: string;

  @Column()
  apellidos: string;

  @Column({ unique: true })
  email: string;

  @OneToMany(() => NotaPractica, (nota) => nota.estudiante)
  notasPracticas: NotaPractica[];

  @OneToMany(() => NotaProyecto, (nota) => nota.estudiante)
  notasProyectos: NotaProyecto[];
}