
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Token = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {

        const request = ctx.switchToHttp().getRequest();
        if (!request.token) {
            throw new Error('Token not found in request.');
        }

        return request.token;

    },
);
