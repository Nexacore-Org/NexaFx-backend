import { Controller, Get, Param, Res } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { StatementService } from './statement.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Statements')
@ApiBearerAuth('access-token')
@Controller({ path: 'statements', version: '2' })
export class StatementsController {
  constructor(private readonly statementService: StatementService) {}

  @Get()
  @ApiOperation({
    summary: 'List all generated statements',
    description: 'Returns all account statements for the authenticated user, grouped by currency.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of statements',
  })
  async listStatements(@CurrentUser() user: { userId: string }) {
    return this.statementService.listStatements(user.userId);
  }

  @Get(':year/:month/:currency')
  @ApiOperation({
    summary: 'Get statement for specific period',
    description:
      'Returns the statement for the given year/month/currency. ' +
      'Generates on-demand if not yet generated.',
  })
  @ApiParam({ name: 'year', type: Number, example: 2024 })
  @ApiParam({ name: 'month', type: Number, example: 1 })
  @ApiParam({ name: 'currency', type: String, example: 'XLM' })
  @ApiResponse({
    status: 200,
    description: 'Statement detail with transactions',
  })
  async getStatement(
    @CurrentUser() user: { userId: string },
    @Param('year') year: number,
    @Param('month') month: number,
    @Param('currency') currency: string,
  ) {
    return this.statementService.getStatementDetail(
      user.userId,
      year,
      month,
      currency.toUpperCase(),
    );
  }

  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Download statement PDF',
    description: 'Returns the statement as a text-based PDF document.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Statement UUID' })
  @ApiResponse({
    status: 200,
    description: 'PDF file',
  })
  async downloadPDF(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const statements = await this.statementService.listStatements(user.userId);
    const statement = statements.find((s) => s.id === id);

    if (!statement) {
      return res.status(404).json({ message: 'Statement not found' });
    }

    const detail = await this.statementService.getStatementDetail(
      user.userId,
      statement.year,
      statement.month,
      statement.currency,
    );

    const content = this.statementService.generatePDFContent(detail);

    res.set({
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="statement-${statement.year}-${statement.month}-${statement.currency}.txt"`,
    });
    res.send(content);
  }

  @Get(':id/csv')
  @ApiOperation({
    summary: 'Download statement CSV',
    description: 'Returns the statement as a CSV file.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Statement UUID' })
  @ApiResponse({
    status: 200,
    description: 'CSV file',
  })
  async downloadCSV(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const statements = await this.statementService.listStatements(user.userId);
    const statement = statements.find((s) => s.id === id);

    if (!statement) {
      return res.status(404).json({ message: 'Statement not found' });
    }

    const detail = await this.statementService.getStatementDetail(
      user.userId,
      statement.year,
      statement.month,
      statement.currency,
    );

    const content = this.statementService.generateCSVContent(detail);

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="statement-${statement.year}-${statement.month}-${statement.currency}.csv"`,
    });
    res.send(content);
  }
}
