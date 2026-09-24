import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organisation } from './entities/organisation.entity';
import { OrganisationMember } from './entities/organisation-member.entity';
import { OrganisationsService } from './organisations.service';
import { OrganisationsController } from './organisations.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organisation, OrganisationMember]),
    UsersModule,
  ],
  controllers: [OrganisationsController],
  providers: [OrganisationsService],
  exports: [OrganisationsService],
})
export class OrganisationsModule {}
