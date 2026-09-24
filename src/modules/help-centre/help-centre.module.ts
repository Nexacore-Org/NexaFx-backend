import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HelpCentreController } from './help-centre.controller';
import { HelpCentreService } from './help-centre.service';
import { HelpArticle } from './entities/help-article.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HelpArticle])],
  controllers: [HelpCentreController],
  providers: [HelpCentreService],
  exports: [HelpCentreService],
})
export class HelpCentreModule {}