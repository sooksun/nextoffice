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
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    }

    const user = await this.authService.validateToken(token);

    if (!user) {
      throw new UnauthorizedException('Token ไม่ถูกต้องหรือหมดอายุ');
    }

    request.user = user;
    return true;
  }

  /** Accept the JWT from the Authorization header (Bearer) or the httpOnly `token` cookie. */
  private extractToken(request: any): string | null {
    const authHeader: string | undefined = request.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    const cookieHeader: string | undefined = request.headers?.cookie;
    if (cookieHeader) {
      const match = cookieHeader
        .split(';')
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith('token='));
      if (match) return decodeURIComponent(match.slice('token='.length));
    }
    return null;
  }
}
