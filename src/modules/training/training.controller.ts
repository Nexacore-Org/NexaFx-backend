import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import { TrainingService } from './training.service';

@ApiTags('Admin Training')
@ApiBearerAuth()
@Controller('admin/training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Post('/assign')
  @Roles(UserRole.ADMIN)
  assignModule(@Body() body: { moduleId: string; userIds: string[] }) {
    return this.trainingService.assignModule(body.moduleId, body.userIds);
  }

  @Get('/modules')
  @Roles(UserRole.ADMIN)
  listModules() {
    // Would return all training modules — wired up via module repo in production
    return this.trainingService['moduleRepo'].find({
      order: { createdAt: 'DESC' },
    });
  }

  @Post('/modules')
  @Roles(UserRole.ADMIN)
  createModule(
    @Body()
    body: {
      title: string;
      description: string;
      durationMinutes: number;
      isRequired?: boolean;
      validityMonths?: number;
      targetRoles?: string[];
    },
  ) {
    return this.trainingService['moduleRepo'].save(
      this.trainingService['moduleRepo'].create(body),
    );
  }

  @Get('/records/:userId')
  @Roles(UserRole.ADMIN)
  getUserRecords(@Param('userId') userId: string) {
    return this.trainingService.getTrainingStatus(userId);
  }

  @Get('/compliance')
  @Roles(UserRole.ADMIN)
  getComplianceReport() {
    return this.trainingService.getComplianceReport();
  }

  @Post('/records/:id/complete')
  @Roles(UserRole.ADMIN)
  completeRecord(@Param('id') id: string, @Body('score') score?: number) {
    return this.trainingService.completeRecord(id, score);
  }
}
