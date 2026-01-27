import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { maskPhone, maskName } from '../utils/masking.util';

export interface AuditLogEntry {
  timestamp?: string;
  eventType: string;
  userId?: number;
  role?: string;
  login?: string;
  ip: string;
  userAgent: string;
  success: boolean;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Записать событие в audit_logs
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
          eventType: entry.eventType,
          userId: entry.userId,
          role: entry.role,
          login: entry.login,
          ip: entry.ip,
          userAgent: entry.userAgent,
          success: entry.success,
          metadata: entry.metadata || {},
        },
      });
      
      this.logger.log(
        JSON.stringify({
          ...entry,
          timestamp: entry.timestamp || new Date().toISOString(),
        })
      );
    } catch (error) {
      this.logger.error('Failed to write audit log:', error.message);
    }
  }

  /**
   * Логирование создания заказа
   * ✅ FIX: PII данные маскируются перед записью
   */
  async logOrderCreate(
    orderId: number,
    userId: number,
    role: string,
    login: string,
    ip: string,
    userAgent: string,
    orderData: any
  ): Promise<void> {
    await this.log({
      eventType: 'order.create',
      userId,
      role,
      login,
      ip,
      userAgent,
      success: true,
      metadata: {
        orderId,
        city: orderData.city,
        // ✅ FIX: Маскируем PII данные
        clientName: maskName(orderData.clientName),
        phone: maskPhone(orderData.phone),
      },
    });
  }

  /**
   * Логирование обновления заказа
   */
  async logOrderUpdate(
    orderId: number,
    userId: number,
    role: string,
    login: string,
    ip: string,
    userAgent: string,
    changes: any
  ): Promise<void> {
    await this.log({
      eventType: 'order.update',
      userId,
      role,
      login,
      ip,
      userAgent,
      success: true,
      metadata: {
        orderId,
        changes,
      },
    });
  }

  /**
   * Логирование закрытия заказа
   */
  async logOrderClose(
    orderId: number,
    userId: number,
    role: string,
    login: string,
    ip: string,
    userAgent: string,
    orderData: any
  ): Promise<void> {
    await this.log({
      eventType: 'order.close',
      userId,
      role,
      login,
      ip,
      userAgent,
      success: true,
      metadata: {
        orderId,
        result: orderData.result?.toString(),
        expenditure: orderData.expenditure?.toString(),
        clean: orderData.clean?.toString(),
      },
    });
  }

  /**
   * Логирование изменения статуса заказа
   */
  async logOrderStatusChange(
    orderId: number,
    userId: number,
    role: string,
    login: string,
    ip: string,
    userAgent: string,
    oldStatus: string,
    newStatus: string
  ): Promise<void> {
    await this.log({
      eventType: 'order.status.change',
      userId,
      role,
      login,
      ip,
      userAgent,
      success: true,
      metadata: {
        orderId,
        oldStatus,
        newStatus,
      },
    });
  }
}

