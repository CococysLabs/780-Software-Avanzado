import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CreateEstudianteDto } from './dto/create-estudiante.dto';
import { UpdateEstudianteDto } from './dto/update-estudiante.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Estudiante } from './entities/estudiante.entity';
import { DeepPartial, Repository } from 'typeorm';
import { Readable } from 'stream';
import csv from 'csv-parser';


@Injectable()
export class EstudianteService {

  private readonly logger = new Logger(EstudianteService.name);



  constructor(
    @InjectRepository(Estudiante)
    private readonly estudianteRepository: Repository<Estudiante>,
  ) { }

  async create(createEstudianteDto: CreateEstudianteDto) {
    try {

      const { nombres, carnet, apellidos, email } = createEstudianteDto;

      const estudiante = this.estudianteRepository.create({
        nombres,
        carnet,
        apellidos,
        email,
      });

      return await this.estudianteRepository.save(estudiante);

    } catch (error) {
      this.handleError(error);
    }
  }


  async cargarDesdeCSV(file: Express.Multer.File) {
    try {
      const estudiantes: DeepPartial<Estudiante>[] = [];

      const stream = Readable.from(file.buffer);

      await new Promise((resolve, reject) => {
        stream
          .pipe(csv())
          .on('data', (row) => {
            estudiantes.push({
              carnet: row.carnet,
              nombres: row.nombres,
              apellidos: row.apellidos,
              email: row.email,
            });
          })
          .on('end', resolve)
          .on('error', reject);
      });

      return await this.estudianteRepository.save(estudiantes);

    } catch (error) {
      this.handleError(error);
    }
  }

  findAll() {
    return this.estudianteRepository.find();
  }

  async findOne(id: string) {



    if (!id) {
      this.logger.error('Ocurrió un error');
      throw new BadRequestException('Carnet es requerido');
    }

    const estudiante = await this.estudianteRepository.findOneBy({
      carnet: id,
    });

    if (!estudiante) {
      
      this.logger.warn('Esto es una advertencia');
      throw new NotFoundException(`No existe estudiante con carnet ${id}`);
    }

    this.logger.log('Obteniendo usuarios');
    
    

    return estudiante;
  }

  async update(carnet: string, updateEstudianteDto: UpdateEstudianteDto) {
    const estudiante = await this.findOne(carnet);

    const updatedEstudiante = Object.assign(estudiante, updateEstudianteDto);

    return await this.estudianteRepository.save(updatedEstudiante);
  }

  remove(id: number) {
    return `This action removes a #${id} estudiante`;
  }

  private handleError(error: any): never {
    if (error.code === '23505')
      throw new BadRequestException(error.detail)
    console.log(error)
    throw new InternalServerErrorException('Check logs');


  }
}
