import { IsNumber, IsString } from "class-validator";

export class CreatePracticaDto {

    @IsNumber()
    numero_practica: number;

    @IsString()
    descripcion: string;

    @IsNumber()
    ponderacion: number;
}
