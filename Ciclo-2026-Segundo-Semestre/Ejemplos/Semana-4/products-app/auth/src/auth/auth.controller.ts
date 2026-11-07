import { Controller } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { LoginUserDto, RegisterUserDto } from './dto';


@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) { }


  @MessagePattern('auth.register.user')
  registerUser(@Payload() registerDto: RegisterUserDto) {
    return this.authService.registerUser(registerDto);
  }

  @MessagePattern('auth.login.user')
  loginUser(@Payload() loginDto: LoginUserDto) {
    return this.authService.loginUser(loginDto);
  }

  @MessagePattern('auth.verify.user')
  verifyUser(@Payload() token: string) {
    return this.authService.verifyUser(token);
  }
}
