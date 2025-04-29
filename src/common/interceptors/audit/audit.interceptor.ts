/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

// biome-ignore lint/style/useImportType: <explanation>
import {
	Injectable,
	NestInterceptor,
	ExecutionContext,
	CallHandler,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import type { AuditLogService } from "src/logs/audit-log/audit-log.service";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
	constructor(private readonly auditLogService: AuditLogService) {}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const request = context.switchToHttp().getRequest();
		const { method, originalUrl, ip, user } = request;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const userId = user?.id || null;

		return next.handle().pipe(
			tap(() => {
				void this.auditLogService.create({
					path: originalUrl,
					method,
					userId,
					ipAddress: ip,
				});
			}),
		);
	}
}
