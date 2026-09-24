import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  RawBodyRequest,
  Headers,
} from '@nestjs/common';
import { CardsService } from './cards.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardControlsDto } from './dto/update-card-controls.dto';
import { CardResponseDto } from './dto/card-response.dto';
import { plainToClass } from 'class-transformer';

@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createCard(@Request() req, @Body() dto: CreateCardDto): Promise<CardResponseDto> {
    const card = await this.cardsService.createCard(req.user.id);
    return plainToClass(CardResponseDto, card);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getCards(@Request() req): Promise<CardResponseDto[]> {
    const cards = await this.cardsService.getCards(req.user.id);
    return cards.map(card => plainToClass(CardResponseDto, card));
  }

  @Get(':id/reveal')
  @UseGuards(JwtAuthGuard)
  async revealCard(
    @Request() req,
    @Param('id') id: string,
  ): Promise<{ ephemeralKey: string }> {
    return this.cardsService.revealCard(id, req.user.id);
  }

  @Patch(':id/freeze')
  @UseGuards(JwtAuthGuard)
  async freezeCard(
    @Request() req,
    @Param('id') id: string,
  ): Promise<CardResponseDto> {
    const card = await this.cardsService.freezeCard(id, req.user.id);
    return plainToClass(CardResponseDto, card);
  }

  @Patch(':id/unfreeze')
  @UseGuards(JwtAuthGuard)
  async unfreezeCard(
    @Request() req,
    @Param('id') id: string,
  ): Promise<CardResponseDto> {
    const card = await this.cardsService.unfreezeCard(id, req.user.id);
    return plainToClass(CardResponseDto, card);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async cancelCard(
    @Request() req,
    @Param('id') id: string,
  ): Promise<void> {
    await this.cardsService.cancelCard(id, req.user.id);
  }

  @Patch(':id/controls')
  @UseGuards(JwtAuthGuard)
  async updateCardControls(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateCardControlsDto,
  ): Promise<CardResponseDto> {
    const card = await this.cardsService.updateCardControls(id, req.user.id, dto);
    return plainToClass(CardResponseDto, card);
  }

  @Get(':id/transactions')
  @UseGuards(JwtAuthGuard)
  async getCardTransactions(
    @Request() req,
    @Param('id') id: string,
  ) {
    return this.cardsService.getCardTransactions(id, req.user.id);
  }

  @Public()
  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Request() req: RawBodyRequest<Request>,
  ): Promise<void> {
    await this.cardsService.handleStripeWebhook(req.rawBody as Buffer, signature);
  }
}
