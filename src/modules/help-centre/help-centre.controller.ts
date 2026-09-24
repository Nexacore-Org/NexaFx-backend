import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HelpCentreService } from './help-centre.service';
import { CreateHelpArticleDto, UpdateHelpArticleDto } from './dto/help-article.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

@ApiTags('Help Centre')
@Controller('v2/help-centre')
export class HelpCentreController {
  constructor(private readonly service: HelpCentreService) {}

  // ---- Public surface --------------------------------------------------

  @Get('articles')
  @Public()
  @ApiOperation({ summary: 'List published help articles' })
  @ApiResponse({ status: 200, description: 'Published articles' })
  listPublished(@Query('category') category?: string) {
    return this.service.listPublished(category);
  }

  @Get('articles/:slug')
  @Public()
  @ApiOperation({ summary: 'Fetch a published help article by slug' })
  @ApiResponse({ status: 200, description: 'Article with view count incremented' })
  @ApiResponse({ status: 404, description: 'Article not found or unpublished' })
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  // ---- Admin surface ---------------------------------------------------

  @Get('admin/articles')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: list all help articles (drafts included)' })
  @ApiResponse({ status: 200, description: 'All articles, newest first' })
  listAll() {
    return this.service.listAll();
  }

  @Post('admin/articles')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: create a help article (draft by default)' })
  @ApiResponse({ status: 201, description: 'Created article' })
  create(@Body() dto: CreateHelpArticleDto) {
    return this.service.create(dto);
  }

  @Patch('admin/articles/:id')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Admin: update an article, including publish/unpublish',
  })
  @ApiResponse({ status: 200, description: 'Updated article' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  update(@Param('id') id: string, @Body() dto: UpdateHelpArticleDto) {
    return this.service.update(id, dto);
  }
}