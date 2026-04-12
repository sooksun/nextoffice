import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LoansService } from './loans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('loans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('loans')
export class LoansController {
  constructor(private readonly svc: LoansService) {}

  @Get()
  @ApiOperation({ summary: 'List document loans for current organization' })
  @ApiQuery({ name: 'status', required: false })
  findAll(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.svc.findAll(Number(user.organizationId), status);
  }

  @Get('overdue')
  @ApiOperation({ summary: 'List overdue loans' })
  findOverdue(@CurrentUser() user: any) {
    return this.svc.findOverdue(Number(user.organizationId));
  }

  @Post()
  @ApiOperation({ summary: 'Borrow a document' })
  create(
    @CurrentUser() user: any,
    @Body() dto: {
      registryId: number;
      borrowerUserId: number;
      dueDate: string;
      purpose?: string;
      remarks?: string;
    },
  ) {
    return this.svc.create(Number(user.organizationId), dto);
  }

  @Post(':id/return')
  @ApiOperation({ summary: 'Return a borrowed document' })
  returnDocument(@Param('id', ParseIntPipe) id: number) {
    return this.svc.returnDocument(id);
  }
}
