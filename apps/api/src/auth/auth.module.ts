import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { PairingService } from './services/pairing.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PairingService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, PairingService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
