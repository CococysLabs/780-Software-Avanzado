import { Injectable } from '@nestjs/common';
import { User } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginUserDto, RegisterUserDto } from './dto';
import { RpcException } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { envs } from 'src/config/envs';

@Injectable()
export class AuthService {


    constructor(@InjectRepository(User)
    private readonly userRepository: Repository<User>,
        private readonly jwtService: JwtService
    ) { }


    async signJwt(payload: JwtPayload) {
        return this.jwtService.sign(payload);
    }


    async registerUser(registerUserDto: RegisterUserDto) {

        const { email, name, password } = registerUserDto;
        try {
            const user = await this.userRepository.findOne({
                where: { email }
            });
            if (user) {
                throw new RpcException({
                    statusCode: 400,
                    message: 'User already exists',
                })
            }
            const newUser = this.userRepository.create({
                email: email,
                name: name,
                password: await bcrypt.hash(password, 10),
            });
            await this.userRepository.save(newUser);

            const { password: _, ...result } = newUser;
            return {
                statusCode: 201,
                message: 'User created successfully',
                user: result,
                token: await this.signJwt(result),
            };


        } catch (error) {
            throw new RpcException({
                statusCode: 400,
                message: error.message,
            })
        }

    }


    async loginUser(loginUserDto: LoginUserDto) {

        const { email, password } = loginUserDto;
        try {
            const user = await this.userRepository.findOne({
                where: { email }
            });
            if (!user) {
                throw new RpcException({
                    statusCode: 400,
                    message: 'Email not found',
                })
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                throw new RpcException({
                    statusCode: 400,
                    message: 'Invalid password',
                })
            }
            const { password: _, ...result } = user;
            return {
                statusCode: 200,
                message: 'Login successful',
                user: result,
                token: await this.signJwt(result),
            };

        } catch (error) {
            throw new RpcException({
                statusCode: 400,
                message: error.message,
            })
        }

    }

    async verifyUser(token: string) {

        try {
            const { sub, iat, exp, ...user } = this.jwtService.verify(token, {
                secret: envs.jwtSecret,

            });

            return {
                statusCode: 200,
                message: 'User verified successfully',
                token: await this.signJwt(user),
                user,
            };
        } catch (error) {
            throw new RpcException({
                statusCode: 401,
                message: 'Invalid token',
            })
        }
    }
}
