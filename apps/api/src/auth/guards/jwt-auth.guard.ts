import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    }

    const token = authHeader.slice(7);
    const user = await this.authService.validateToken(token);

    if (!user) {
      throw new UnauthorizedException('Token ไม่ถูกต้องหรือหมดอายุ');
    }

    request.user = user;
    return true;
  }
}
