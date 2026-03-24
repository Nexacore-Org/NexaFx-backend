import { Between } from 'typeorm';
import * as fastCsv from 'fast-csv';
import ExcelJS from 'exceljs';
// ...existing imports and code...

// Add the following methods to ReceiptsService:

/**
 * Export transactions as CSV for a given user and month
 */
async exportTransactionsCSV(userId: string, month: string, res: any): Promise<void> {
  if (!this.validateMonthFormat(month)) {
    throw new BadRequestException('Invalid month format. Use YYYY-MM');
  }
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

  const transactions = await this.transactionRepository.find({
    where: {
      userId,
      createdAt: Between(startDate, endDate),
    },
    order: { createdAt: 'ASC' },
  });

  if (!transactions.length) {
    throw new NotFoundException('No transactions found for the specified period');
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="transactions-${month}.csv"`);

  const csvStream = fastCsv.format({ headers: true });
  csvStream.pipe(res);
  transactions.forEach((tx) => {
    csvStream.write({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      rate: tx.rate,
      status: tx.status,
      txHash: tx.txHash,
      fee: tx.feeAmount,
      createdAt: tx.createdAt.toISOString(),
    });
  });
  csvStream.end();
}

/**
 * Export transactions as Excel for a given user and month
 */
async exportTransactionsExcel(userId: string, month: string, res: any): Promise<void> {
  if (!this.validateMonthFormat(month)) {
    throw new BadRequestException('Invalid month format. Use YYYY-MM');
  }
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

  const transactions = await this.transactionRepository.find({
    where: {
      userId,
      createdAt: Between(startDate, endDate),
    },
    order: { createdAt: 'ASC' },
  });

  if (!transactions.length) {
    throw new NotFoundException('No transactions found for the specified period');
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Transactions');
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 36 },
    { header: 'Type', key: 'type', width: 10 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Rate', key: 'rate', width: 10 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'TxHash', key: 'txHash', width: 44 },
    { header: 'Fee', key: 'fee', width: 10 },
    { header: 'Created At', key: 'createdAt', width: 24 },
  ];
  transactions.forEach((tx) => {
    worksheet.addRow({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      rate: tx.rate,
      status: tx.status,
      txHash: tx.txHash,
      fee: tx.feeAmount,
      createdAt: tx.createdAt.toISOString(),
    });
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="transactions-${month}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}
