import { Injectable, Logger } from "@nestjs/common"
import { Repository, Not, IsNull } from "typeorm"
import { Request } from "express"
import UAParser from "ua-parser-js"
import { ActivityLog } from "../entities/activity-log.entity"
import { CreateActivityLogDto } from "../dto/create-activity-log.dto"
import { ActivityLogResponseDto, LogoutResponseDto, SessionListResponseDto } from "../dto/activity-log-response.dto"
import { InjectRepository } from "@nestjs/typeorm"

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name)

  constructor(@InjectRepository(ActivityLog) private readonly activityLogRepository: Repository<ActivityLog>) {}

  /**
   * Create a new activity log entry
   */
  async createActivityLog(createActivityLogDto: CreateActivityLogDto): Promise<ActivityLog> {
    try {
      const activityLog = this.activityLogRepository.create({
        ...createActivityLogDto,
        loggedInAt: new Date(),
        isActive: true,
      })

      const savedLog = await this.activityLogRepository.save(activityLog)

      this.logger.log(
        `Activity log created for user ${createActivityLogDto.userId} from IP ${createActivityLogDto.ipAddress}`,
      )

      return savedLog
    } catch (error) {
      this.logger.error(`Failed to create activity log: ${error.message}`, error.stack)
      throw error
    }
  }

  /**
   * Log user login activity
   */
  async logLoginActivity(
    userId: string,
    request: Request,
    sessionToken?: string,
    metadata?: Record<string, any>,
  ): Promise<ActivityLog> {
    const ipAddress = this.extractIpAddress(request)
    const userAgent = request.headers["user-agent"] || "Unknown"
    const deviceInfo = this.parseUserAgent(userAgent)

    const createActivityLogDto: CreateActivityLogDto = {
      userId,
      ipAddress,
      userAgent,
      deviceType: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      operatingSystem: deviceInfo.os,
      sessionToken,
      activityType: "LOGIN",
      metadata: {
        ...metadata,
        loginTimestamp: new Date().toISOString(),
        headers: {
          "x-forwarded-for": request.headers["x-forwarded-for"],
          "x-real-ip": request.headers["x-real-ip"],
        },
      },
    }

    return this.createActivityLog(createActivityLogDto)
  }

  /**
   * Log user logout activity
   */
  async logLogoutActivity(userId: string, sessionId?: string, request?: Request): Promise<void> {
    try {
      const query = this.activityLogRepository
        .createQueryBuilder()
        .update(ActivityLog)
        .set({
          isActive: false,
          loggedOutAt: new Date(),
          activityType: "LOGOUT",
        })
        .where("userId = :userId", { userId })
        .andWhere("isActive = :isActive", { isActive: true })

      if (sessionId) {
        query.andWhere("id = :sessionId", { sessionId })
      } else if (request) {
        // If no specific session ID, logout current session based on IP and user agent
        const ipAddress = this.extractIpAddress(request)
        const userAgent = request.headers["user-agent"] || "Unknown"
        query.andWhere("ipAddress = :ipAddress", { ipAddress }).andWhere("userAgent = :userAgent", { userAgent })
      }

      await query.execute()

      this.logger.log(`User ${userId} logged out${sessionId ? ` from session ${sessionId}` : ""}`)
    } catch (error) {
      this.logger.error(`Failed to log logout activity: ${error.message}`, error.stack)
      throw error
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string, currentSessionId?: string): Promise<SessionListResponseDto> {
    try {
      const sessions = await this.activityLogRepository.find({
        where: {
          userId,
          isActive: true,
        },
        order: {
          loggedInAt: "DESC",
        },
      })

      const sessionDtos: ActivityLogResponseDto[] = sessions.map((session) => ({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        deviceType: session.deviceType,
        browser: session.browser,
        operatingSystem: session.operatingSystem,
        location: session.location,
        loggedInAt: session.loggedInAt,
        loggedOutAt: session.loggedOutAt,
        isActive: session.isActive,
        activityType: session.activityType,
        isCurrentSession: session.id === currentSessionId,
      }))

      return {
        sessions: sessionDtos,
        totalActiveSessions: sessions.length,
        currentSessionId: currentSessionId || "",
      }
    } catch (error) {
      this.logger.error(`Failed to get user sessions: ${error.message}`, error.stack)
      throw error
    }
  }

  /**
   * Logout from all other sessions except current
   */
  async logoutOtherSessions(userId: string, currentSessionId: string): Promise<LogoutResponseDto> {
    try {
      const result = await this.activityLogRepository
        .createQueryBuilder()
        .update(ActivityLog)
        .set({
          isActive: false,
          loggedOutAt: new Date(),
          activityType: "LOGOUT_OTHER_SESSIONS",
        })
        .where("userId = :userId", { userId })
        .andWhere("isActive = :isActive", { isActive: true })
        .andWhere("id != :currentSessionId", { currentSessionId })
        .execute()

      this.logger.log(`User ${userId} logged out from ${result.affected} other sessions`)

      return {
        message: "Successfully logged out from other devices",
        sessionsTerminated: result.affected || 0,
      }
    } catch (error) {
      this.logger.error(`Failed to logout other sessions: ${error.message}`, error.stack)
      throw error
    }
  }

  /**
   * Logout from all sessions
   */
  async logoutAllSessions(userId: string): Promise<LogoutResponseDto> {
    try {
      const result = await this.activityLogRepository
        .createQueryBuilder()
        .update(ActivityLog)
        .set({
          isActive: false,
          loggedOutAt: new Date(),
          activityType: "LOGOUT_ALL_SESSIONS",
        })
        .where("userId = :userId", { userId })
        .andWhere("isActive = :isActive", { isActive: true })
        .execute()

      this.logger.log(`User ${userId} logged out from all ${result.affected} sessions`)

      return {
        message: "Successfully logged out from all devices",
        sessionsTerminated: result.affected || 0,
      }
    } catch (error) {
      this.logger.error(`Failed to logout all sessions: ${error.message}`, error.stack)
      throw error
    }
  }

  /**
   * Get activity history for a user
   */
  async getUserActivityHistory(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ activities: ActivityLogResponseDto[]; total: number; page: number; limit: number }> {
    try {
      const [activities, total] = await this.activityLogRepository.findAndCount({
        where: { userId },
        order: { loggedInAt: "DESC" },
        skip: (page - 1) * limit,
        take: limit,
      })

      const activityDtos: ActivityLogResponseDto[] = activities.map((activity) => ({
        id: activity.id,
        ipAddress: activity.ipAddress,
        userAgent: activity.userAgent,
        deviceType: activity.deviceType,
        browser: activity.browser,
        operatingSystem: activity.operatingSystem,
        location: activity.location,
        loggedInAt: activity.loggedInAt,
        loggedOutAt: activity.loggedOutAt,
        isActive: activity.isActive,
        activityType: activity.activityType,
        isCurrentSession: false, // Not applicable for history
      }))

      return {
        activities: activityDtos,
        total,
        page,
        limit,
      }
    } catch (error) {
      this.logger.error(`Failed to get user activity history: ${error.message}`, error.stack)
      throw error
    }
  }

  /**
   * Check for suspicious activity
   */
  async checkSuspiciousActivity(userId: string, ipAddress: string): Promise<boolean> {
    try {
      // Check if this IP has been used by this user in the last 30 days
      const recentActivity = await this.activityLogRepository.findOne({
        where: {
          userId,
          ipAddress,
          loggedInAt: Not(IsNull()),
        },
        order: { loggedInAt: "DESC" },
      })

      // If no recent activity from this IP, it might be suspicious
      if (!recentActivity) {
        this.logger.warn(`Suspicious activity detected: User ${userId} logging in from new IP ${ipAddress}`)
        return true
      }

      // Check for multiple rapid login attempts from different IPs
      const recentLogins = await this.activityLogRepository.count({
        where: {
          userId,
          loggedInAt: Not(IsNull()),
          activityType: "LOGIN",
        },
      })

      if (recentLogins > 10) {
        // More than 10 logins in recent history
        this.logger.warn(`Suspicious activity detected: User ${userId} has ${recentLogins} recent login attempts`)
        return true
      }

      return false
    } catch (error) {
      this.logger.error(`Failed to check suspicious activity: ${error.message}`)
      return false
    }
  }

  /**
   * Clean up old inactive sessions
   */
  async cleanupOldSessions(daysOld = 30): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysOld)

      const result = await this.activityLogRepository.delete({
        isActive: false,
        loggedOutAt: Not(IsNull()),
      })

      this.logger.log(`Cleaned up ${result.affected} old inactive sessions`)
      return result.affected || 0
    } catch (error) {
      this.logger.error(`Failed to cleanup old sessions: ${error.message}`, error.stack)
      throw error
    }
  }

  /**
   * Extract IP address from request
   */
  private extractIpAddress(request: Request): string {
    const forwarded = request.headers["x-forwarded-for"] as string
    const realIp = request.headers["x-real-ip"] as string
    const remoteAddress = request.connection?.remoteAddress || request.socket?.remoteAddress

    if (forwarded) {
      return forwarded.split(",")[0].trim()
    }
    if (realIp) {
      return realIp
    }
    return remoteAddress || "Unknown"
  }

  /**
   * Parse user agent to extract device information
   */
  private parseUserAgent(userAgent: string): {
    deviceType: string
    browser: string
    os: string
  } {
    try {
     const parser = new UAParser.UAParser(userAgent)
      const result = parser.getResult()

      return {
        deviceType: result.device.type || "Desktop",
        browser: `${result.browser.name || "Unknown"} ${result.browser.version || ""}`.trim(),
        os: `${result.os.name || "Unknown"} ${result.os.version || ""}`.trim(),
      }
    } catch (error) {
      this.logger.error(`Failed to parse user agent: ${error.message}`)
      return {
        deviceType: "Unknown",
        browser: "Unknown",
        os: "Unknown",
      }
    }
  }

  async logActivity(
  userId: string | null,
  request: Request,
  activityType: string,
  metadata?: Record<string, any>,
): Promise<ActivityLog> {
  const ipAddress = this.extractIpAddress(request);
  const userAgent = request.headers['user-agent'] || 'Unknown';
  const deviceInfo = this.parseUserAgent(userAgent);

  const createActivityLogDto: CreateActivityLogDto = {
    userId: userId || 'anonymous',
    ipAddress,
    userAgent,
    deviceType: deviceInfo.deviceType,
    browser: deviceInfo.browser,
    operatingSystem: deviceInfo.os,
    activityType,
    metadata,
  };

  return this.createActivityLog(createActivityLogDto);
}

}
