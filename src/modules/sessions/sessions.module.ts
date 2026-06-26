import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from './entities/user-session.entity';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { TokensModule } from '../../tokens/tokens.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSession]),
    forwardRef(() => TokensModule),
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
