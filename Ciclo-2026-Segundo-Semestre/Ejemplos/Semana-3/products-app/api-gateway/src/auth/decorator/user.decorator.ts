
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {

        const request = ctx.switchToHttp().getRequest();
        if (!request.user) {
            throw new Error('User not found in request. Make sure to use AuthGuard.');
        }

        return request.user;

    },
);
