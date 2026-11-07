import { Body, Controller, Get, Inject, Post, Req, UseGuards, } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { NATS_SERVICE } from 'src/config';
import { LoginUserDto, RegisterUserDto } from './dto';
import { AuthGuard } from './guard/auth.guard';
import { User } from './decorator/user.decorator';
import type { CurrentUser } from './interfaces/current-user.interface';
import { Token } from './decorator/token.decorator';



@Controller('auth')
export class AuthController {


  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
  ) { }

  @Post('register')
  registerUser(@Body() registerDto: RegisterUserDto) {

    return this.client.send('auth.register.user', registerDto);

  }

  @Post('login')
  loginUser(@Body() loginDto: LoginUserDto) {
    return this.client.send('auth.login.user', loginDto);
  }

  @UseGuards(AuthGuard)
  @Get('verify')
  verifyUser(@User() user: CurrentUser, @Token() token: string) {
    return {
      user,
      token,
    };
  }
}
