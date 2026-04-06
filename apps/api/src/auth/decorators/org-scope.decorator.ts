import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const OrgScope = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return {
      userId: user.id,
      organizationId: user.organizationId,
      orgType: user.orgType,
    };
  },
);
