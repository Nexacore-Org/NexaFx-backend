/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
// eslint-disable-next-line prettier/prettier
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
// eslint-disable-next-line prettier/prettier
import { APP_INTERCEPTOR } from "@nestjs/core";

// Entities
import { Transaction } from "./transactions/entities/transaction.entity";
import { Currency } from "./currencies/entities/currency.entity";

// Modules
import { UserModule } from "./user/user.module";
import { AuthModule } from "./auth/auth.module";
import { LogsModule } from "./logs/logs.module";

// Controllers
import { TransactionsController } from "./transactions/transactions.controller";

// Services
import { TransactionsService } from "./transactions/transactions.service";

// Interceptors
import { AuditInterceptor } from "./common/interceptors/audit/audit.interceptor";

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		TypeOrmModule.forFeature([Transaction, Currency]),
		UserModule,
		AuthModule,
		LogsModule,
	],
	controllers: [TransactionsController],
	providers: [
		TransactionsService,
		{
			provide: APP_INTERCEPTOR,
			useClass: AuditInterceptor,
		},
	],
})
export class AppModule {}
