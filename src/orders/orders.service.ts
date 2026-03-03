import { Injectable, ForbiddenException, NotFoundException, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderFromCallDto } from './dto/create-order-from-call.dto';
import { CreateOrderFromChatDto } from './dto/create-order-from-chat.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UserRole } from '../auth/roles.guard';
import { AuthUser } from '../types/auth-user.type';
import { maskSensitiveData, getFieldNames } from '../utils/masking.util';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { NotificationsService } from '../notifications/notifications.service';

// Коды статусов заказов (должны совпадать с данными в references_service.order_statuses)
const STATUS = {
  WAITING: 'waiting',
  ACCEPTED: 'accepted',
  ON_WAY: 'on_way',
  IN_WORK: 'in_work',
  MODERN: 'modern',
  DONE: 'done',
  REJECTED: 'rejected',
  NO_ORDER: 'no_order',
} as const;

const TERMINAL_STATUS_CODES = [STATUS.DONE, STATUS.REJECTED, STATUS.NO_ORDER];

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersService.name);

  // Кэш для getFilterOptions (предотвращает timeout при частых запросах)
  private filterOptionsCache = new Map<string, { data: any; expiry: number; lastAccess: number }>();
  private readonly FILTER_OPTIONS_CACHE_TTL = 60 * 1000;
  private readonly FILTER_OPTIONS_CACHE_MAX_SIZE = 100;
  private cacheCleanupInterval: NodeJS.Timeout | null = null;

  // Кэш статусов: code → id (загружается один раз, обновляется по необходимости)
  private statusCodeToId = new Map<string, number>();
  private statusIdToCode = new Map<number, string>();

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      for (const [key, value] of this.filterOptionsCache.entries()) {
        if (value.expiry < now) {
          this.filterOptionsCache.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) this.logger.debug(`[Cache] Cleaned ${cleaned} expired entries`);
    }, 5 * 60 * 1000);
    this.logger.log('✅ Filter options cache cleanup started');
  }

  onModuleDestroy() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.filterOptionsCache.clear();
    this.logger.log('✅ Filter options cache cleanup stopped');
  }

  // Загрузка и кэширование статусов из БД
  private async loadStatusCache() {
    if (this.statusCodeToId.size > 0) return;
    const statuses = await this.prisma.orderStatus.findMany({
      select: { id: true, code: true },
    });
    for (const s of statuses) {
      this.statusCodeToId.set(s.code, s.id);
      this.statusIdToCode.set(s.id, s.code);
    }
  }

  private async getStatusIdByCode(code: string): Promise<number | undefined> {
    await this.loadStatusCache();
    return this.statusCodeToId.get(code);
  }

  private async getStatusCodeById(id: number): Promise<string | undefined> {
    await this.loadStatusCache();
    return this.statusIdToCode.get(id);
  }

  private fireAndForgetNotification(notificationPromise: Promise<void>, context: string) {
    notificationPromise
      .then(() => this.logger.log(`✅ Notification sent (${context})`))
      .catch(err => this.logger.error(`❌ Notification failed (${context}): ${err.message}`));
  }

  // ─────────────────────────────────────────
  // ORDERS LIST (Raw SQL с JOIN)
  // ─────────────────────────────────────────

  async getOrders(query: QueryOrdersDto, user: AuthUser) {
    const startTime = Date.now();
    const {
      page = 1, limit = 50, statusIds, cityId, search, searchId,
      searchPhone, searchAddress, masterId, master, closingDate,
      rkId, equipmentTypeId, dateType, dateFrom, dateTo,
    } = query;
    const skip = (page - 1) * limit;

    this.logger.debug(`[getOrders] user=${user.userId} (${user.role}), page=${page}, limit=${limit}`);

    try {
      const whereConditions: string[] = [];
      const params: any[] = [];
      let p = 1;

      // RBAC фильтры
      if (user.role === 'master') {
        whereConditions.push(`o.master_id = $${p++}`);
        params.push(user.userId);
      }

      if (user.role === 'director' && user.cityIds && user.cityIds.length > 0) {
        whereConditions.push(`o.city_id = ANY($${p++}::int[])`);
        params.push(user.cityIds);
      }

      // Фильтры из query
      if (statusIds) {
        const ids = statusIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
        if (ids.length === 1) {
          whereConditions.push(`o.status_id = $${p++}`);
          params.push(ids[0]);
        } else if (ids.length > 1) {
          whereConditions.push(`o.status_id = ANY($${p++}::int[])`);
          params.push(ids);
        }
      }

      if (cityId) {
        whereConditions.push(`o.city_id = $${p++}`);
        params.push(cityId);
      }

      if (masterId) {
        whereConditions.push(`o.master_id = $${p++}`);
        params.push(+masterId);
      }

      if (rkId) {
        whereConditions.push(`o.rk_id = $${p++}`);
        params.push(+rkId);
      }

      if (equipmentTypeId) {
        whereConditions.push(`o.equipment_type_id = $${p++}`);
        params.push(+equipmentTypeId);
      }

      if (master) {
        whereConditions.push(`m.name ILIKE $${p++}`);
        params.push(`%${master}%`);
      }

      if (closingDate) {
        const date = new Date(closingDate);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        whereConditions.push(`o.closing_at >= $${p++} AND o.closing_at < $${p++}`);
        params.push(date, nextDay);
      }

      if (dateFrom || dateTo) {
        let dateField = 'o.created_at';
        if (dateType === 'close') dateField = 'o.closing_at';
        if (dateType === 'meeting') dateField = 'o.date_meeting';

        if (dateFrom) {
          const d = new Date(dateFrom);
          d.setHours(0, 0, 0, 0);
          whereConditions.push(`${dateField} >= $${p++}`);
          params.push(d);
        }
        if (dateTo) {
          const d = new Date(dateTo);
          d.setHours(23, 59, 59, 999);
          whereConditions.push(`${dateField} <= $${p++}`);
          params.push(d);
        }
      }

      if (search) {
        const searchAsNumber = parseInt(search, 10);
        if (!isNaN(searchAsNumber) && searchAsNumber > 0 && searchAsNumber < 1000000) {
          whereConditions.push(`(o.phone ILIKE $${p} OR o.client_name ILIKE $${p} OR o.address ILIKE $${p} OR o.id = $${p + 1})`);
          params.push(`%${search}%`, searchAsNumber);
          p += 2;
        } else {
          whereConditions.push(`(o.phone ILIKE $${p} OR o.client_name ILIKE $${p} OR o.address ILIKE $${p})`);
          params.push(`%${search}%`);
          p++;
        }
      }

      if (searchId) {
        const idAsNumber = parseInt(searchId, 10);
        if (!isNaN(idAsNumber) && idAsNumber > 0) {
          whereConditions.push(`o.id = $${p++}`);
          params.push(idAsNumber);
        }
      }

      if (searchPhone) {
        whereConditions.push(`o.phone ILIKE $${p++}`);
        params.push(`%${searchPhone}%`);
      }

      if (searchAddress) {
        whereConditions.push(`o.address ILIKE $${p++}`);
        params.push(`%${searchAddress}%`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const ordersQuery = `
        SELECT
          o.id,
          o.city_id         AS "cityId",
          c.name            AS "cityName",
          o.rk_id           AS "rkId",
          rkt.name          AS "rkName",
          o.phone,
          o.order_type_id   AS "orderTypeId",
          ot.name           AS "orderTypeName",
          o.client_name     AS "clientName",
          o.address,
          o.date_meeting    AS "dateMeeting",
          o.equipment_type_id AS "equipmentTypeId",
          et.name           AS "equipmentTypeName",
          o.problem,
          o.status_id       AS "statusId",
          os.name           AS "statusName",
          os.code           AS "statusCode",
          os.color          AS "statusColor",
          o.operator_id     AS "operatorId",
          o.master_id       AS "masterId",
          o.result,
          o.expenditure,
          o.clean,
          o.master_change   AS "masterChange",
          o.prepayment,
          o.call_id         AS "callId",
          o.description,
          o.source,
          o.site_order_id   AS "siteOrderId",
          o.qa_status       AS "qaStatus",
          o.qa_amount_confirmed AS "qaAmountConfirmed",
          o.qa_note         AS "qaNote",
          o.date_close_mod  AS "dateCloseMod",
          o.closing_at      AS "closingAt",
          o.has_poverka     AS "hasPoverka",
          o.created_at      AS "createdAt",
          o.updated_at      AS "updatedAt",
          json_build_object('id', op.id, 'name', op.name, 'login', op.login) AS operator,
          CASE WHEN m.id IS NOT NULL
            THEN json_build_object('id', m.id, 'name', m.name)
            ELSE NULL
          END AS master,
          COALESCE(
            (SELECT json_agg(json_build_object(
              'id', d.id, 'type', d.type, 'url', d.url, 'createdAt', d.created_at
            ) ORDER BY d.created_at ASC)
             FROM orders_service.order_documents d WHERE d.order_id = o.id),
            '[]'::json
          ) AS documents,
          COALESCE(
            (SELECT json_build_object(
              'status', cs.status, 'amount', cs.amount,
              'submittedAt', cs.submitted_at, 'approvedAt', cs.approved_at
            )
             FROM orders_service.cash_submissions cs WHERE cs.order_id = o.id),
            NULL
          ) AS "cashSubmission",
          COALESCE(
            (SELECT json_agg(json_build_object(
              'id', oc.id, 'role', oc.role, 'userId', oc.user_id,
              'text', oc.text, 'createdAt', oc.created_at
            ) ORDER BY oc.created_at ASC)
             FROM orders_service.order_comments oc WHERE oc.order_id = o.id),
            '[]'::json
          ) AS comments
        FROM orders_service.orders o
        JOIN references_service.order_statuses os ON os.id = o.status_id
        JOIN references_service.cities c ON c.id = o.city_id
        JOIN references_service.rk rkt ON rkt.id = o.rk_id
        JOIN references_service.order_types ot ON ot.id = o.order_type_id
        JOIN references_service.equipment_types et ON et.id = o.equipment_type_id
        LEFT JOIN auth_service.operators op ON op.id = o.operator_id
        LEFT JOIN auth_service.masters m ON m.id = o.master_id
        ${whereClause}
        ORDER BY
          os.sort_order ASC,
          CASE
            WHEN os.code IN ('waiting','accepted','on_way','in_work','modern')
            THEN o.date_meeting
          END ASC NULLS LAST,
          CASE
            WHEN os.code IN ('done','rejected','no_order')
            THEN o.closing_at
          END DESC NULLS LAST
        LIMIT $${p++}
        OFFSET $${p++}
      `;

      params.push(limit, skip);

      const countQuery = `
        SELECT COUNT(*) AS count
        FROM orders_service.orders o
        LEFT JOIN auth_service.masters m ON m.id = o.master_id
        ${whereClause}
      `;

      const [orders, totalResult] = await Promise.all([
        this.prisma.$queryRawUnsafe<any[]>(ordersQuery, ...params),
        this.prisma.$queryRawUnsafe<[{ count: bigint }]>(countQuery, ...params.slice(0, -2)),
      ]);

      const s3BaseUrl = process.env.S3_BASE_URL || 'https://s3.twcstorage.ru/f7eead03-crmfiles';

      const transformedOrders = orders.map(order => ({
        ...order,
        result: order.result ? parseFloat(order.result) : null,
        expenditure: order.expenditure ? parseFloat(order.expenditure) : null,
        clean: order.clean ? parseFloat(order.clean) : null,
        masterChange: order.masterChange ? parseFloat(order.masterChange) : null,
        prepayment: order.prepayment ? parseFloat(order.prepayment) : null,
        documents: (order.documents || []).map((d: any) => ({
          ...d,
          url: d.url?.startsWith('http') ? d.url : `${s3BaseUrl}/${d.url}`,
        })),
      }));

      const total = Number(totalResult[0].count);
      const duration = Date.now() - startTime;
      this.logger.debug(`[getOrders] COMPLETE in ${duration}ms (${transformedOrders.length} orders, total=${total})`);

      if (duration > 2000) {
        this.logger.warn(`[getOrders] SLOW QUERY: ${duration}ms`);
      }

      return {
        success: true,
        data: {
          orders: transformedOrders,
          pagination: {
            page: +page,
            limit: +limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      };
    } catch (error) {
      this.logger.error(`[getOrders] FAILED: ${error.message}`);
      throw error;
    }
  }

  // ─────────────────────────────────────────
  // CREATE ORDER
  // ─────────────────────────────────────────

  async createOrder(dto: CreateOrderDto, user: AuthUser) {
    await this.loadStatusCache();
    const waitingStatusId = this.statusCodeToId.get(STATUS.WAITING);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          cityId: dto.cityId,
          rkId: dto.rkId,
          phone: dto.phone,
          orderTypeId: dto.orderTypeId ?? null,
          clientName: dto.clientName ?? '',
          address: dto.address ?? null,
          dateMeeting: dto.dateMeeting ? new Date(dto.dateMeeting) : null,
          equipmentTypeId: dto.equipmentTypeId ?? null,
          problem: dto.problem ?? null,
          statusId: waitingStatusId || 1,
          operatorId: dto.operatorId,
          callId: dto.callId,
          description: dto.description ?? '',
          source: dto.source ?? null,
        },
        include: {
          city: true,
          rk: true,
          orderType: true,
          equipmentType: true,
          status: true,
          operator: { select: { id: true, name: true, login: true } },
          master: { select: { id: true, name: true } },
        },
      });

      // Создаём первый комментарий если передан
      if (dto.comment) {
        await tx.orderComment.create({
          data: {
            orderId: created.id,
            role: user.role,
            userId: user.userId,
            text: dto.comment,
          },
        });
      }

      return created;
    });

    this.fireAndForgetNotification(
      this.notificationsService.sendNewOrderNotification({
        orderId: order.id,
        city: order.city.name,
        clientName: order.clientName,
        phone: order.phone,
        address: order.address ?? '',
        dateMeeting: order.dateMeeting?.toISOString() ?? '',
        problem: order.problem ?? '',
        rk: order.rk?.name,
        typeEquipment: order.equipmentType?.name,
      }),
      `new-order-#${order.id}`
    );

    this.fireAndForgetNotification(
      this.notificationsService.sendUINotificationToDirectors(
        order.city.name,
        'order_new',
        order.id,
        order.clientName,
        undefined,
        { address: order.address ?? '', dateMeeting: order.dateMeeting?.toISOString() ?? '' },
      ),
      `ui-new-order-#${order.id}`
    );

    if (order.operatorId) {
      this.fireAndForgetNotification(
        this.notificationsService.sendUINotificationToOperator(
          order.operatorId,
          'order_created',
          order.id,
          order.clientName,
        ),
        `ui-operator-order-#${order.id}`
      );
    }

    this.invalidateFilterOptionsCache();

    return {
      success: true,
      data: order,
      message: `Заказ №${order.id} успешно создан!`
    };
  }

  async createOrderFromCall(dto: CreateOrderFromCallDto, user: AuthUser) {
    const calls = await this.prisma.call.findMany({
      where: { id: { in: dto.callIds } },
      select: { id: true, phoneClient: true, operatorId: true, callId: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!calls || calls.length === 0) {
      throw new NotFoundException('Calls not found');
    }

    const mainCall = calls[0];
    const allCallIds = calls.map(c => c.id).join(',');

    await this.loadStatusCache();
    const waitingStatusId = this.statusCodeToId.get(STATUS.WAITING);

    const order = await this.prisma.order.create({
      data: {
        rkId: dto.rkId,
        cityId: dto.cityId,
        phone: mainCall.phoneClient,
        orderTypeId: dto.orderTypeId ?? null,
        clientName: dto.clientName ?? '',
        address: dto.address ?? null,
        dateMeeting: dto.dateMeeting ? new Date(dto.dateMeeting) : null,
        equipmentTypeId: dto.equipmentTypeId ?? null,
        problem: dto.problem ?? null,
        statusId: waitingStatusId || 1,
        operatorId: dto.operatorId,
        callId: allCallIds,
      },
      include: {
        city: true,
        rk: true,
        equipmentType: true,
        status: true,
        operator: { select: { id: true, name: true, login: true } },
        master: { select: { id: true, name: true } },
      },
    });

    this.fireAndForgetNotification(
      this.notificationsService.sendNewOrderNotification({
        orderId: order.id,
        city: order.city.name,
        clientName: order.clientName,
        phone: order.phone,
        address: order.address ?? '',
        dateMeeting: order.dateMeeting?.toISOString() ?? '',
        problem: order.problem ?? '',
        rk: order.rk?.name,
        typeEquipment: order.equipmentType?.name,
      }),
      `new-order-from-call-#${order.id}`
    );

    this.fireAndForgetNotification(
      this.notificationsService.sendUINotificationToDirectors(
        order.city.name,
        'order_new',
        order.id,
        order.clientName,
        undefined,
        { address: order.address ?? '', dateMeeting: order.dateMeeting?.toISOString() ?? '' },
      ),
      `ui-new-order-from-call-#${order.id}`
    );

    if (order.operatorId) {
      this.fireAndForgetNotification(
        this.notificationsService.sendUINotificationToOperator(
          order.operatorId,
          'order_created',
          order.id,
          order.clientName,
        ),
        `ui-operator-order-from-call-#${order.id}`
      );
    }

    this.invalidateFilterOptionsCache();

    return {
      success: true,
      data: order,
      message: `Заказ №${order.id} успешно создан!`
    };
  }

  async createOrderFromChat(dto: CreateOrderFromChatDto, user: AuthUser) {
    await this.loadStatusCache();
    const waitingStatusId = this.statusCodeToId.get(STATUS.WAITING);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          rkId: dto.rkId,
          cityId: dto.cityId,
          phone: dto.phone,
          orderTypeId: dto.orderTypeId ?? null,
          clientName: dto.clientName ?? '',
          address: dto.address ?? null,
          dateMeeting: dto.dateMeeting ? new Date(dto.dateMeeting) : null,
          equipmentTypeId: dto.equipmentTypeId ?? null,
          problem: dto.problem ?? null,
          statusId: waitingStatusId || 1,
          operatorId: dto.operatorId,
          callId: dto.callId,
        },
        include: {
          city: true,
          rk: true,
          equipmentType: true,
          status: true,
          operator: { select: { id: true, name: true, login: true } },
          master: { select: { id: true, name: true } },
        },
      });

      if (dto.comment) {
        await tx.orderComment.create({
          data: {
            orderId: created.id,
            role: user.role,
            userId: user.userId,
            text: dto.comment,
          },
        });
      }

      return created;
    });

    this.fireAndForgetNotification(
      this.notificationsService.sendNewOrderNotification({
        orderId: order.id,
        city: order.city.name,
        clientName: order.clientName,
        phone: order.phone,
        address: order.address ?? '',
        dateMeeting: order.dateMeeting?.toISOString() ?? '',
        problem: order.problem ?? '',
        rk: order.rk?.name,
        typeEquipment: order.equipmentType?.name,
      }),
      `new-order-from-chat-#${order.id}`
    );

    this.fireAndForgetNotification(
      this.notificationsService.sendUINotificationToDirectors(
        order.city.name,
        'order_new',
        order.id,
        order.clientName,
        undefined,
        { address: order.address ?? '', dateMeeting: order.dateMeeting?.toISOString() ?? '' },
      ),
      `ui-new-order-from-chat-#${order.id}`
    );

    if (order.operatorId) {
      this.fireAndForgetNotification(
        this.notificationsService.sendUINotificationToOperator(
          order.operatorId,
          'order_created',
          order.id,
          order.clientName,
        ),
        `ui-operator-order-from-chat-#${order.id}`
      );
    }

    this.invalidateFilterOptionsCache();

    return {
      success: true,
      data: order,
      message: `Заказ №${order.id} успешно создан!`
    };
  }

  // ─────────────────────────────────────────
  // GET SINGLE ORDER
  // ─────────────────────────────────────────

  async getOrder(id: number, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        city: true,
        rk: true,
        orderType: true,
        equipmentType: true,
        status: true,
        operator: { select: { id: true, name: true, login: true } },
        master: { select: { id: true, name: true } },
        documents: true,
        comments: { orderBy: { createdAt: 'asc' } },
        cashSubmission: true,
        poverkas: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (user.role === 'master' && order.masterId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }

    if (user.role === 'director' && user.cityIds && !user.cityIds.includes(order.cityId)) {
      throw new ForbiddenException('Order is not in your cities');
    }

    const s3BaseUrl = process.env.S3_BASE_URL || 'https://s3.twcstorage.ru/f7eead03-crmfiles';

    return {
      success: true,
      data: {
        ...order,
        documents: order.documents.map(d => ({
          ...d,
          url: d.url.startsWith('http') ? d.url : `${s3BaseUrl}/${d.url}`,
        })),
      },
    };
  }

  // ─────────────────────────────────────────
  // UPDATE ORDER
  // ─────────────────────────────────────────

  async updateOrder(
    id: number,
    dto: UpdateOrderDto,
    user: AuthUser,
    headers?: Record<string, string | string[] | undefined>
  ) {
    this.logger.debug(`Updating order #${id}, fields: ${getFieldNames(dto).join(', ')}`);

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { status: true, city: true },
      });

      if (!order) throw new NotFoundException('Order not found');

      if (user.role === 'master' && order.masterId !== user.userId) {
        throw new ForbiddenException('Access denied');
      }

      const updateData: any = {};
      let cityChanged = false;
      let oldMasterIdBeforeCityChange: number | null = null;

      if (dto.rkId !== undefined) updateData.rkId = dto.rkId;

      if (dto.cityId !== undefined && dto.cityId !== order.cityId) {
        updateData.cityId = dto.cityId;
        cityChanged = true;
        if (order.masterId) {
          oldMasterIdBeforeCityChange = order.masterId;
          updateData.masterId = null;
          this.logger.log(`City changed, removing master #${order.masterId} from order #${id}`);
        }
      } else if (dto.cityId !== undefined) {
        updateData.cityId = dto.cityId;
      }

      if (dto.phone !== undefined) updateData.phone = dto.phone;
      if (dto.orderTypeId !== undefined) updateData.orderTypeId = dto.orderTypeId;
      if (dto.clientName !== undefined) updateData.clientName = dto.clientName;
      if (dto.address !== undefined) updateData.address = dto.address;
      if (dto.equipmentTypeId !== undefined) updateData.equipmentTypeId = dto.equipmentTypeId;
      if (dto.problem !== undefined) updateData.problem = dto.problem;
      if (dto.callId !== undefined) updateData.callId = dto.callId;
      if (dto.operatorId !== undefined) updateData.operatorId = dto.operatorId;
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.source !== undefined) updateData.source = dto.source;
      if (dto.siteOrderId !== undefined) updateData.siteOrderId = dto.siteOrderId;
      if (dto.qaStatus !== undefined) updateData.qaStatus = dto.qaStatus;
      if (dto.qaAmountConfirmed !== undefined) updateData.qaAmountConfirmed = dto.qaAmountConfirmed;
      if (dto.qaNote !== undefined) updateData.qaNote = dto.qaNote;

      if (dto.statusId !== undefined) {
        updateData.statusId = dto.statusId;
      }

      if (dto.masterId !== undefined) {
        updateData.masterId = dto.masterId;
      }

      // Финансовые поля
      if (dto.result !== undefined) updateData.result = dto.result;
      if (dto.expenditure !== undefined) updateData.expenditure = dto.expenditure;

      if (dto.result !== undefined || dto.expenditure !== undefined) {
        const finalResult = dto.result !== undefined ? dto.result : (Number(order.result) || 0);
        const finalExpenditure = dto.expenditure !== undefined ? dto.expenditure : (Number(order.expenditure) || 0);
        updateData.clean = finalResult - finalExpenditure;
      } else if (dto.clean !== undefined) {
        this.logger.warn(`Manual clean value provided: ${dto.clean} for order update`);
        updateData.clean = dto.clean;
      }

      if (dto.masterChange !== undefined) updateData.masterChange = dto.masterChange;
      if (dto.prepayment !== undefined) updateData.prepayment = dto.prepayment;

      // Документы через OrderDocument
      if (dto.bsoDoc !== undefined) {
        await tx.orderDocument.deleteMany({ where: { orderId: id, type: 'bso' } });
        if (dto.bsoDoc && dto.bsoDoc.length > 0) {
          await tx.orderDocument.createMany({
            data: dto.bsoDoc.map(url => ({ orderId: id, type: 'bso', url })),
          });
        }
      }
      if (dto.expenditureDoc !== undefined) {
        await tx.orderDocument.deleteMany({ where: { orderId: id, type: 'expenditure' } });
        if (dto.expenditureDoc && dto.expenditureDoc.length > 0) {
          await tx.orderDocument.createMany({
            data: dto.expenditureDoc.map(url => ({ orderId: id, type: 'expenditure', url })),
          });
        }
      }
      if (dto.cashReceiptDoc !== undefined) {
        await tx.orderDocument.deleteMany({ where: { orderId: id, type: 'cash_receipt' } });
        if (dto.cashReceiptDoc) {
          await tx.orderDocument.create({ data: { orderId: id, type: 'cash_receipt', url: dto.cashReceiptDoc } });
        }
      }

      // Комментарий → создать новый
      if (dto.comment !== undefined && dto.comment !== null) {
        await tx.orderComment.create({
          data: { orderId: id, role: user.role, userId: user.userId, text: dto.comment },
        });
      }

      // Статус подачи кассы
      if (dto.cashSubmissionStatus !== undefined || dto.cashSubmissionAmount !== undefined) {
        const existingCs = await tx.cashSubmission.findUnique({ where: { orderId: id } });
        if (existingCs) {
          await tx.cashSubmission.update({
            where: { orderId: id },
            data: {
              ...(dto.cashSubmissionStatus !== undefined ? { status: dto.cashSubmissionStatus } : {}),
              ...(dto.cashSubmissionAmount !== undefined ? { amount: dto.cashSubmissionAmount } : {}),
            },
          });
        }
      }

      // Даты
      if (dto.dateMeeting !== undefined) updateData.dateMeeting = new Date(dto.dateMeeting);
      if (dto.closingAt !== undefined) updateData.closingAt = dto.closingAt ? new Date(dto.closingAt) : null;
      if (dto.dateCloseMod !== undefined) updateData.dateCloseMod = dto.dateCloseMod ? new Date(dto.dateCloseMod) : null;

      // Автоматически ставим дату закрытия при переходе в терминальный статус
      if (dto.statusId !== undefined && dto.closingAt === undefined) {
        await this.loadStatusCache();
        const newCode = this.statusIdToCode.get(dto.statusId);
        if (newCode && TERMINAL_STATUS_CODES.includes(newCode as any)) {
          updateData.closingAt = new Date();
        }
      }

      const updated = await tx.order.update({
        where: { id },
        data: updateData,
        include: {
          city: true,
          rk: true,
          equipmentType: true,
          status: true,
          operator: { select: { id: true, name: true, login: true } },
          master: { select: { id: true, name: true } },
        },
      });

      this.logger.log(`Order #${updated.id} updated successfully`);

      const needsCashSync = updated.status.code === STATUS.DONE
        && updated.masterChange
        && Number(updated.masterChange) > 0;

      return { order, updated, cityChanged, oldMasterIdBeforeCityChange, needsCashSync };
    }, { timeout: 15000, isolationLevel: 'ReadCommitted' });

    const { order, updated, cityChanged, oldMasterIdBeforeCityChange, needsCashSync } = result;

    if (needsCashSync) {
      this.logger.log(`Order #${updated.id} completed, syncing cash (masterChange=${updated.masterChange})`);
      try {
        await this.syncCashReceipt(updated, user, headers);
      } catch (err) {
        this.logger.error(`Failed to sync cash for order #${updated.id}: ${err.message}`);
        // Откатываем статус
        await this.prisma.order.update({
          where: { id: updated.id },
          data: { statusId: order.statusId, closingAt: order.closingAt },
        });
        throw new Error(`Заказ не может быть закрыт: сервис кассы недоступен. Попробуйте позже.`);
      }
    }

    this.sendUpdateNotifications(order, updated, dto, { cityChanged, oldMasterIdBeforeCityChange });

    return {
      success: true,
      data: updated,
      oldOrder: order,
      message: `Заказ №${updated.id} обновлен!`
    };
  }

  // ─────────────────────────────────────────
  // NOTIFICATIONS AFTER UPDATE
  // ─────────────────────────────────────────

  private sendUpdateNotifications(
    order: any,
    updated: any,
    dto: UpdateOrderDto,
    extra?: { cityChanged?: boolean; oldMasterIdBeforeCityChange?: number | null }
  ) {
    const oldCode = order.status?.code;
    const newCode = updated.status?.code;
    const cityName = updated.city?.name;

    // 0. Изменение города
    if (extra?.cityChanged && dto.cityId && order.cityId !== dto.cityId) {
      this.fireAndForgetNotification(
        this.notificationsService.sendCityChangeNotification({
          orderId: updated.id,
          oldCity: order.city?.name || String(order.cityId),
          newCity: cityName,
          clientName: updated.clientName?.trim() || undefined,
          masterId: extra.oldMasterIdBeforeCityChange || undefined,
          rk: updated.rk?.name?.trim() || undefined,
          typeEquipment: updated.equipmentType?.name?.trim() || undefined,
          dateMeeting: updated.dateMeeting?.toISOString(),
        }),
        `city-change-#${updated.id}`
      );
    }

    // 0.1. Изменение адреса
    if (dto.address && order.address !== dto.address && !extra?.cityChanged) {
      this.fireAndForgetNotification(
        this.notificationsService.sendAddressChangeNotification({
          orderId: updated.id,
          city: cityName,
          oldAddress: order.address || 'Не указан',
          newAddress: updated.address,
          clientName: updated.clientName?.trim() || undefined,
          masterId: updated.masterId || undefined,
          rk: updated.rk?.name?.trim() || undefined,
          typeEquipment: updated.equipmentType?.name?.trim() || undefined,
          dateMeeting: updated.dateMeeting?.toISOString(),
        }),
        `address-change-#${updated.id}`
      );
    }

    // 1. Изменение даты встречи
    if (dto.dateMeeting && order.dateMeeting?.toISOString() !== new Date(dto.dateMeeting).toISOString()) {
      this.fireAndForgetNotification(
        this.notificationsService.sendDateChangeNotification({
          orderId: updated.id,
          city: cityName,
          clientName: updated.clientName?.trim() || undefined,
          newDate: updated.dateMeeting?.toISOString(),
          oldDate: order.dateMeeting?.toISOString(),
          masterId: updated.masterId || undefined,
          rk: updated.rk?.name?.trim() || undefined,
          typeEquipment: updated.equipmentType?.name?.trim() || undefined,
        }),
        `date-change-#${updated.id}`
      );
    }

    // 2. Принятие заказа мастером
    if (newCode === STATUS.ACCEPTED && oldCode !== STATUS.ACCEPTED) {
      this.fireAndForgetNotification(
        this.notificationsService.sendOrderAcceptedNotification({
          orderId: updated.id,
          masterId: updated.masterId || undefined,
          rk: updated.rk?.name?.trim() || undefined,
          typeEquipment: updated.equipmentType?.name?.trim() || undefined,
          clientName: updated.clientName?.trim() || undefined,
          dateMeeting: updated.dateMeeting?.toISOString(),
        }),
        `order-accepted-#${updated.id}`
      );
      this.fireAndForgetNotification(
        this.notificationsService.sendUINotificationToDirectors(
          cityName,
          'order_accepted',
          updated.id,
          updated.clientName,
          updated.master?.name,
          { address: updated.address, dateMeeting: updated.dateMeeting?.toISOString() },
        ),
        `ui-order-accepted-#${updated.id}`
      );
    }

    // 3. Закрытие заказа
    if (newCode === STATUS.DONE && oldCode !== STATUS.DONE) {
      this.fireAndForgetNotification(
        this.notificationsService.sendOrderClosedNotification({
          orderId: updated.id,
          masterId: updated.masterId || undefined,
          clientName: updated.clientName,
          closingDate: new Date().toISOString(),
          total: updated.result?.toString(),
          expense: updated.expenditure?.toString(),
          net: updated.clean?.toString(),
          handover: updated.masterChange?.toString(),
        }),
        `order-closed-#${updated.id}`
      );
      this.fireAndForgetNotification(
        this.notificationsService.sendUINotificationToDirectors(
          cityName,
          'order_closed',
          updated.id,
          updated.clientName,
          updated.master?.name,
          { total: updated.result?.toString(), expense: updated.expenditure?.toString(), net: updated.clean?.toString(), handover: updated.masterChange?.toString() },
        ),
        `ui-order-closed-#${updated.id}`
      );
    }

    // 4. Модерн
    if (newCode === STATUS.MODERN && oldCode !== STATUS.MODERN) {
      this.fireAndForgetNotification(
        this.notificationsService.sendOrderInModernNotification({
          orderId: updated.id,
          masterId: updated.masterId || undefined,
          rk: updated.rk?.name?.trim() || undefined,
          typeEquipment: updated.equipmentType?.name?.trim() || undefined,
          clientName: updated.clientName?.trim() || undefined,
          dateMeeting: updated.dateMeeting?.toISOString(),
          prepayment: updated.prepayment?.toString(),
          expectedClosingDate: updated.dateCloseMod?.toISOString(),
        }),
        `order-modern-#${updated.id}`
      );
      this.fireAndForgetNotification(
        this.notificationsService.sendUINotificationToDirectors(
          cityName, 'order_modern', updated.id, updated.clientName, updated.master?.name,
          { address: updated.address, dateMeeting: updated.dateMeeting?.toISOString() },
        ),
        `ui-order-modern-#${updated.id}`
      );
    }

    // 5. Отказ
    if (newCode === STATUS.REJECTED && oldCode !== STATUS.REJECTED) {
      this.fireAndForgetNotification(
        this.notificationsService.sendOrderRejectionNotification({
          orderId: updated.id,
          city: cityName,
          clientName: updated.clientName,
          phone: updated.phone,
          reason: updated.status?.name || STATUS.REJECTED,
          masterId: updated.masterId || undefined,
        }),
        `order-refusal-#${updated.id}`
      );
      this.fireAndForgetNotification(
        this.notificationsService.sendUINotificationToDirectors(
          cityName, 'order_refusal', updated.id, updated.clientName, updated.master?.name,
          { address: updated.address, dateMeeting: updated.dateMeeting?.toISOString() },
        ),
        `ui-order-refusal-#${updated.id}`
      );
      if (updated.masterId) {
        this.fireAndForgetNotification(
          this.notificationsService.sendUINotificationToMaster(
            updated.masterId, 'master_order_rejected', updated.id,
            { clientName: updated.clientName, reason: updated.status?.name },
          ),
          `ui-master-refusal-#${updated.id}`
        );
      }
    }

    // 6. Незаказ
    if (newCode === STATUS.NO_ORDER && oldCode !== STATUS.NO_ORDER) {
      this.fireAndForgetNotification(
        this.notificationsService.sendOrderRejectionNotification({
          orderId: updated.id,
          city: cityName,
          clientName: updated.clientName,
          phone: updated.phone,
          reason: updated.status?.name || STATUS.NO_ORDER,
          masterId: updated.masterId || undefined,
        }),
        `order-noorder-#${updated.id}`
      );
      this.fireAndForgetNotification(
        this.notificationsService.sendUINotificationToDirectors(
          cityName, 'order_rejected', updated.id, updated.clientName, undefined,
          { address: updated.address, dateMeeting: updated.dateMeeting?.toISOString() },
        ),
        `ui-order-rejected-#${updated.id}`
      );
      if (updated.masterId) {
        this.fireAndForgetNotification(
          this.notificationsService.sendUINotificationToMaster(
            updated.masterId, 'master_order_rejected', updated.id,
            { clientName: updated.clientName, reason: updated.status?.name },
          ),
          `ui-master-noorder-#${updated.id}`
        );
      }
    }

    // 7. Изменение мастера
    if (dto.masterId !== undefined && order.masterId !== dto.masterId) {
      if (order.masterId && dto.masterId === null) {
        this.fireAndForgetNotification(
          this.notificationsService.sendOrderRejectionNotification({
            orderId: updated.id,
            city: cityName,
            clientName: updated.clientName?.trim() || undefined,
            phone: updated.phone,
            reason: 'Мастер отказался от заказа',
            masterId: order.masterId,
            rk: updated.rk?.name?.trim() || undefined,
            typeEquipment: updated.equipmentType?.name?.trim() || undefined,
            dateMeeting: updated.dateMeeting?.toISOString(),
          }),
          `master-declined-#${updated.id}`
        );
      }
      if (order.masterId && dto.masterId) {
        this.fireAndForgetNotification(
          this.notificationsService.sendMasterReassignedNotification({ orderId: updated.id, oldMasterId: order.masterId }),
          `master-reassigned-#${updated.id}`
        );
        this.fireAndForgetNotification(
          this.notificationsService.sendUINotificationToMaster(
            order.masterId, 'master_order_reassigned', updated.id, { clientName: updated.clientName },
          ),
          `ui-master-reassigned-#${updated.id}`
        );
      }
      if (dto.masterId) {
        this.fireAndForgetNotification(
          this.notificationsService.sendMasterAssignedNotification({
            orderId: updated.id, masterId: dto.masterId,
            rk: updated.rk?.name?.trim() || undefined,
            typeEquipment: updated.equipmentType?.name?.trim() || undefined,
            clientName: updated.clientName?.trim() || undefined,
            address: updated.address?.trim() || undefined,
            dateMeeting: updated.dateMeeting?.toISOString(),
          }),
          `master-assigned-#${updated.id}`
        );
        this.fireAndForgetNotification(
          this.notificationsService.sendUINotificationToMaster(
            dto.masterId, 'master_assigned', updated.id,
            { clientName: updated.clientName, address: updated.address, city: cityName, dateMeeting: updated.dateMeeting?.toISOString() },
          ),
          `ui-master-assigned-#${updated.id}`
        );
      }
    }

    // 8. Перенос даты
    if (dto.dateMeeting && order.dateMeeting?.toISOString() !== new Date(dto.dateMeeting).toISOString()) {
      if (updated.masterId) {
        this.fireAndForgetNotification(
          this.notificationsService.sendUINotificationToMaster(
            updated.masterId, 'master_order_rescheduled', updated.id,
            { clientName: updated.clientName, newDate: updated.dateMeeting?.toISOString() },
          ),
          `ui-master-rescheduled-#${updated.id}`
        );
      }
      this.fireAndForgetNotification(
        this.notificationsService.sendUINotificationToDirectors(
          cityName, 'order_rescheduled', updated.id, updated.clientName, updated.master?.name,
          { address: updated.address, dateMeeting: order.dateMeeting?.toISOString(), newDateMeeting: updated.dateMeeting?.toISOString() },
        ),
        `ui-order-rescheduled-#${updated.id}`
      );
    }
  }

  // ─────────────────────────────────────────
  // UPDATE STATUS
  // ─────────────────────────────────────────

  async updateStatus(
    id: number,
    statusId: number,
    user: AuthUser,
    headers?: Record<string, string | string[] | undefined>
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { status: true, city: true, master: { select: { id: true, name: true } }, operator: { select: { id: true, name: true, login: true } } }
    });
    if (!order) throw new NotFoundException('Order not found');

    if (user.role === 'master' && order.masterId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }

    await this.loadStatusCache();
    const newCode = this.statusIdToCode.get(statusId);
    const isTerminal = newCode ? TERMINAL_STATUS_CODES.includes(newCode as any) : false;

    const data: any = { statusId };
    if (isTerminal) data.closingAt = new Date();

    const needsCashSync = newCode === STATUS.DONE
      && order.masterChange
      && Number(order.masterChange) > 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findUnique({
        where: { id },
        select: { statusId: true },
      });

      if (currentOrder?.statusId === statusId) {
        throw new Error('Статус уже установлен');
      }

      return tx.order.update({
        where: { id },
        data,
        include: {
          city: true,
          status: true,
          operator: { select: { id: true, name: true, login: true } },
          master: { select: { id: true, name: true } },
        },
      });
    }, { isolationLevel: 'Serializable', timeout: 15000 });

    if (needsCashSync) {
      this.logger.log(`Order #${updated.id} status -> done, syncing cash`);
      try {
        await this.syncCashReceipt(updated, user, headers);
      } catch (err) {
        this.logger.error(`Failed to sync cash for order #${updated.id}: ${err.message}`);
        await this.prisma.order.update({
          where: { id },
          data: { statusId: order.statusId, closingAt: order.closingAt },
        });
        throw new Error(`Сервис транзакций недоступен. Попробуйте позже.`);
      }
    }

    return { success: true, data: updated, oldStatusId: order.statusId, oldStatusCode: order.status.code };
  }

  async assignMaster(id: number, masterId: number) {
    const updated = await this.prisma.order.update({
      where: { id },
      data: { masterId },
    });
    return { success: true, data: updated };
  }

  // ─────────────────────────────────────────
  // SYNC CASH RECEIPT
  // ─────────────────────────────────────────

  private async syncCashReceipt(
    order: any,
    user: AuthUser,
    requestHeaders?: Record<string, string | string[] | undefined>
  ) {
    const startTime = Date.now();
    this.logger.debug(`[syncCashReceipt] START for order #${order.id}`);

    try {
      const cashServiceUrl = process.env.CASH_SERVICE_URL || 'http://cash-service.backend.svc.cluster.local:5006';

      const masterChangeAmount = order.masterChange ? Number(order.masterChange) : 0;
      const resultAmount = order.result ? Number(order.result) : 0;

      const cashData: any = {
        name: 'приход',
        amount: masterChangeAmount,
        cityId: order.cityId,
        note: `Итог по заказу: ${resultAmount}₽`,
        paymentPurpose: `Заказ №${order.id}`,
      };

      const authHeader = requestHeaders?.authorization || requestHeaders?.Authorization;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authHeader) {
        headers['Authorization'] = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      } else {
        this.logger.warn(`[syncCashReceipt] No Authorization header for order #${order.id}`);
      }

      let lastError: Error | null = null;
      let response: any = null;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const httpStartTime = Date.now();
          response = await firstValueFrom(
            this.httpService.post(
              `${cashServiceUrl}/api/v1/cash`,
              cashData,
              { headers, timeout: 5000, maxRedirects: 0, validateStatus: (s) => s >= 200 && s < 300 }
            ).pipe(
              timeout(5000),
              catchError((error) => {
                const httpDuration = Date.now() - httpStartTime;
                if (error.response) {
                  const statusCode = error.response.status;
                  const data = error.response.data;
                  const errorMsg = data?.message || data?.error || JSON.stringify(data).substring(0, 200);
                  this.logger.error(`[syncCashReceipt] HTTP ${statusCode} after ${httpDuration}ms: ${errorMsg}`);
                  throw new Error(`Ошибка от сервера кассы (${statusCode}): ${errorMsg}`);
                }
                if (error.code === 'ECONNREFUSED') throw new Error('Сервер кассы недоступен');
                if (error.name === 'TimeoutError') throw new Error('Превышено время ожидания кассы');
                throw error;
              })
            )
          );
          this.logger.log(`[syncCashReceipt] ✅ Synced for order #${order.id} (attempt ${attempt})`);
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxRetries) {
            const delayMs = Math.pow(2, attempt - 1) * 500;
            this.logger.warn(`[syncCashReceipt] Attempt ${attempt} failed, retry in ${delayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          } else {
            this.logger.error(`[syncCashReceipt] All ${maxRetries} attempts failed for order #${order.id}`);
          }
        }
      }

      if (!response && lastError) throw lastError;

      // Обновляем статус CashSubmission
      await this.prisma.cashSubmission.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          status: 'submitted',
          amount: masterChangeAmount,
          submittedAt: new Date(),
        },
        update: {
          status: 'submitted',
          amount: masterChangeAmount,
          submittedAt: new Date(),
        },
      });

      this.logger.debug(`[syncCashReceipt] COMPLETE in ${Date.now() - startTime}ms`);
    } catch (error) {
      this.logger.error(`[syncCashReceipt] FAILED: ${error instanceof Error ? error.message : 'Unknown'}`);

      try {
        await this.prisma.cashSubmission.upsert({
          where: { orderId: order.id },
          create: { orderId: order.id, status: 'sync_error', amount: 0, submittedAt: new Date() },
          update: { status: 'sync_error' },
        });
      } catch (updateError) {
        this.logger.error(`Failed to update error status: ${updateError instanceof Error ? updateError.message : 'Unknown'}`);
      }

      throw error;
    }
  }

  // ─────────────────────────────────────────
  // FILTER OPTIONS
  // ─────────────────────────────────────────

  async getFilterOptions(user: AuthUser) {
    const startTime = Date.now();
    this.logger.debug(`[getFilterOptions] user ${user.userId} (${user.role})`);

    try {
      const cacheKey = user.role === 'master'
        ? `master_${user.userId}`
        : user.role === 'director' && user.cityIds?.length
          ? `director_${user.cityIds.sort().join(',')}`
          : 'global';

      const cached = this.filterOptionsCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        cached.lastAccess = Date.now();
        return { success: true, data: cached.data, cached: true };
      }

      const whereConditions: string[] = [];
      const params: any[] = [];
      let p = 1;

      if (user.role === 'master') {
        whereConditions.push(`o.master_id = $${p++}`);
        params.push(user.userId);
      }

      if (user.role === 'director' && user.cityIds && user.cityIds.length > 0) {
        whereConditions.push(`o.city_id = ANY($${p++}::int[])`);
        params.push(user.cityIds);
      }

      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';
      const addWhere = whereConditions.length > 0 ? 'AND' : 'WHERE';

      await this.prisma.ensureConnection();

      const executeQueries = async (attempt = 1): Promise<any[][]> => {
        const queryStartTime = Date.now();

        const queryPromise = Promise.all([
          // Уникальные РК из заказов пользователя
          this.prisma.$queryRawUnsafe<Array<{ id: number; name: string }>>(
            `SELECT DISTINCT rkt.id, rkt.name
             FROM orders_service.orders o
             JOIN references_service.rk rkt ON rkt.id = o.rk_id
             ${whereClause}
             ORDER BY rkt.name ASC`,
            ...params
          ),
          // Уникальные типы оборудования
          this.prisma.$queryRawUnsafe<Array<{ id: number; name: string }>>(
            `SELECT DISTINCT et.id, et.name
             FROM orders_service.orders o
             JOIN references_service.equipment_types et ON et.id = o.equipment_type_id
             ${whereClause}
             ORDER BY et.name ASC`,
            ...params
          ),
          // Города
          this.prisma.$queryRawUnsafe<Array<{ id: number; name: string }>>(
            `SELECT DISTINCT c.id, c.name
             FROM orders_service.orders o
             JOIN references_service.cities c ON c.id = o.city_id
             ${whereClause}
             ORDER BY c.name ASC`,
            ...params
          ),
          // Все статусы (из reference)
          this.prisma.$queryRawUnsafe<Array<{ id: number; name: string; code: string; color: string | null; sortOrder: number }>>(
            `SELECT id, name, code, color, sort_order AS "sortOrder"
             FROM references_service.order_statuses
             WHERE is_active = true
             ORDER BY sort_order ASC`
          ),
          // Все типы заказов
          this.prisma.$queryRawUnsafe<Array<{ id: number; name: string }>>(
            `SELECT id, name FROM references_service.order_types WHERE is_active = true ORDER BY name ASC`
          ),
        ]);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getFilterOptions timeout (>5s)')), 5000)
        );

        try {
          return await Promise.race([queryPromise, timeoutPromise]);
        } catch (error: any) {
          const isRetryable = error.message?.includes('timeout') || error.message?.includes('idle-session') || error.message?.includes('57P05');
          if (isRetryable && attempt < 3) {
            this.logger.warn(`[getFilterOptions] Attempt ${attempt} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            return executeQueries(attempt + 1);
          }
          throw error;
        }
      };

      const [rks, equipmentTypes, cities, statuses, orderTypes] = await executeQueries();

      const result = { rks, equipmentTypes, cities, statuses, orderTypes };

      if (this.filterOptionsCache.size >= this.FILTER_OPTIONS_CACHE_MAX_SIZE) {
        this.evictLRUCacheEntry();
      }

      this.filterOptionsCache.set(cacheKey, {
        data: result,
        expiry: Date.now() + this.FILTER_OPTIONS_CACHE_TTL,
        lastAccess: Date.now(),
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`[getFilterOptions] COMPLETE in ${duration}ms`);

      return { success: true, data: result };
    } catch (error: any) {
      this.logger.error(`[getFilterOptions] FAILED: ${error.message}`);
      if (error.message?.includes('timeout')) {
        return { success: true, data: { rks: [], equipmentTypes: [], cities: [], statuses: [], orderTypes: [] }, error: 'timeout' };
      }
      throw error;
    }
  }

  private invalidateFilterOptionsCache() {
    this.filterOptionsCache.clear();
    this.logger.debug('[getFilterOptions] Cache invalidated');
  }

  private evictLRUCacheEntry() {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;
    for (const [key, value] of this.filterOptionsCache.entries()) {
      if (value.lastAccess < oldestAccess) {
        oldestAccess = value.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.filterOptionsCache.delete(oldestKey);
    }
  }

  // ─────────────────────────────────────────
  // SUBMIT CASH FOR REVIEW
  // ─────────────────────────────────────────

  async submitCashForReview(orderId: number, cashReceiptDoc: string | undefined, user: AuthUser) {
    this.logger.log(`Submitting cash for review: Order ${orderId} by Master ${user.userId}`);

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { status: true, master: { select: { id: true, name: true } } }
      });

      if (!order) return { success: false, error: 'Заказ не найден' };

      if (order.masterId !== user.userId) {
        return { success: false, error: 'Вы не можете отправить сдачу по чужому заказу' };
      }

      if (order.status.code !== STATUS.DONE) {
        return { success: false, error: 'Можно отправить сдачу только по завершенным заказам' };
      }

      const existingCs = await this.prisma.cashSubmission.findUnique({ where: { orderId } });
      if (existingCs?.status === 'pending_review') {
        return { success: false, error: 'Сдача уже отправлена на проверку. Дождитесь решения директора.' };
      }

      const cashSubmission = await this.prisma.cashSubmission.upsert({
        where: { orderId },
        create: {
          orderId,
          status: 'pending_review',
          amount: order.masterChange || 0,
          submittedAt: new Date(),
        },
        update: {
          status: 'pending_review',
          submittedAt: new Date(),
          amount: order.masterChange || 0,
        },
      });

      // Сохраняем чек как документ если передан
      if (cashReceiptDoc) {
        await this.prisma.orderDocument.upsert({
          where: { id: 0 } as any,
          create: { orderId, type: 'cash_receipt', url: cashReceiptDoc },
          update: {},
        });
      }

      this.logger.log(`✅ Cash submission successful: Order #${orderId}`);

      return {
        success: true,
        message: 'Сдача успешно отправлена на проверку',
        data: {
          id: cashSubmission.id,
          status: cashSubmission.status,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Failed to submit cash for review: ${error.message}`, error.stack);
      return { success: false, error: `Ошибка при отправке сдачи: ${error.message}` };
    }
  }

  // ─────────────────────────────────────────
  // ORDER HISTORY
  // ─────────────────────────────────────────

  async getOrderHistory(orderId: number, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, cityId: true, masterId: true },
    });

    if (!order) throw new NotFoundException('Заказ не найден');

    if (user.role === UserRole.MASTER && order.masterId !== user.userId) {
      throw new ForbiddenException('У вас нет доступа к этому заказу');
    }

    if (user.role === UserRole.DIRECTOR && user.cityIds && !user.cityIds.includes(order.cityId)) {
      throw new ForbiddenException('Заказ не в вашем городе');
    }

    const logs = await this.prisma.auditOrders.findMany({
      where: {
        eventType: { in: ['order.create', 'order.update', 'order.close', 'order.status.change'] },
        metadata: { path: ['orderId'], equals: orderId },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const logins = [...new Set(logs.map(log => log.login).filter(Boolean))] as string[];

    const [operators, masters] = await Promise.all([
      logins.length > 0
        ? this.prisma.operator.findMany({ where: { login: { in: logins } }, select: { login: true, name: true } })
        : [],
      logins.length > 0
        ? this.prisma.master.findMany({ where: { login: { in: logins } }, select: { login: true, name: true } })
        : [],
    ]);

    const loginToName = new Map<string, string>();
    [...operators, ...masters].forEach(u => {
      if (u.login) loginToName.set(u.login, u.name);
    });

    const history = logs.map(log => ({
      id: log.id,
      createdAt: log.createdAt,
      eventType: log.eventType,
      userId: log.userId,
      role: log.role,
      login: log.login,
      userName: log.login ? loginToName.get(log.login) || null : null,
      metadata: log.metadata,
    }));

    return { success: true, data: history };
  }

  // ─────────────────────────────────────────
  // ORDERS BY PHONE
  // ─────────────────────────────────────────

  async getOrdersByPhone(phone: string, user: AuthUser) {
    const normalizedPhone = phone.replace(/[\s\+\(\)\-]/g, '');

    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          { phone: { contains: normalizedPhone } },
          { phone: { contains: phone } },
        ],
      },
      select: {
        id: true,
        clientName: true,
        cityId: true,
        city: { select: { name: true } },
        statusId: true,
        status: { select: { name: true, code: true } },
        dateMeeting: true,
        equipmentTypeId: true,
        equipmentType: { select: { name: true } },
        orderTypeId: true,
        orderType: { select: { name: true } },
        problem: true,
        createdAt: true,
        rkId: true,
        rk: { select: { name: true } },
        address: true,
        result: true,
        master: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      success: true,
      data: orders.map(order => ({
        id: order.id,
        clientName: order.clientName,
        cityId: order.cityId,
        cityName: order.city?.name,
        statusId: order.statusId,
        statusName: order.status?.name,
        statusCode: order.status?.code,
        dateMeeting: order.dateMeeting,
        equipmentTypeName: order.equipmentType?.name,
        orderTypeName: order.orderType?.name,
        problem: order.problem,
        createdAt: order.createdAt,
        rkName: order.rk?.name,
        address: order.address,
        result: order.result,
        master: order.master,
      })),
    };
  }

  async getOrderAvitoChat(id: number, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        clientName: true,
        phone: true,
        city: { select: { name: true } },
        rk: { select: { name: true, code: true } },
        status: { select: { name: true, code: true } },
        problem: true,
        address: true,
        dateMeeting: true,
        createdAt: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return { success: true, data: order };
  }
}
