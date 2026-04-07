import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttendanceController } from './controllers/attendance.controller';
import { LeaveController } from './controllers/leave.controller';
import { AttendanceService } from './services/attendance.service';
import { LeaveService } from './services/leave.service';
import { TravelService } from './services/travel.service';
import { FaceClientService } from './services/face-client.service';
import { GeofenceService } from './services/geofence.service';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceController, LeaveController],
  providers: [
    AttendanceService,
    LeaveService,
    TravelService,
    FaceClientService,
    GeofenceService,
  ],
  exports: [AttendanceService, LeaveService, TravelService],
})
export class AttendanceModule {}
