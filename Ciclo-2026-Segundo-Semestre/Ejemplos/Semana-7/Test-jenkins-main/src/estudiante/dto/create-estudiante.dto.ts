import { IsEmail, IsString, MinLength } from "class-validator";

export class CreateEstudianteDto {

    @IsString()
    @MinLength(5)
    carnet: string;

    @IsString()
    @MinLength(3)
    nombres: string;

    @IsString()
    @MinLength(3)
    apellidos: string;

    @IsString()
    @IsEmail()
    email: string;

}
