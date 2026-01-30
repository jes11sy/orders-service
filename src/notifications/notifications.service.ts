import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

interface NewOrderNotification {
  orderId: number;
  city: string;
  clientName: string;
  phone: string;
  address: string;
  dateMeeting: string;
  problem: string;
  rk?: string;
  avitoName?: string;
  typeEquipment?: string;
}

interface DateChangeNotification {
  orderId: number;
  city: string;
  clientName?: string;
  newDate?: string;
  oldDate?: string;
  masterId?: number;
  rk?: string;
  avitoName?: string;
  typeEquipment?: string;
}

interface OrderRejectionNotification {
  orderId: number;
  city: string;
  clientName?: string;
  phone: string;
  reason: string;
  masterId?: number;
  rk?: string;
  avitoName?: string;
  typeEquipment?: string;
  dateMeeting?: string;
}

interface MasterAssignedNotification {
  orderId: number;
  masterId: number;
  rk?: string;
  avitoName?: string;
  typeEquipment?: string;
  clientName?: string;
  address?: string;
  dateMeeting?: string;
}

interface MasterReassignedNotification {
  orderId: number;
  oldMasterId: number;
}

interface OrderAcceptedNotification {
  orderId: number;
  masterId?: number;
  rk?: string;
  avitoName?: string;
  typeEquipment?: string;
  clientName?: string;
  dateMeeting?: string;
}

interface OrderClosedNotification {
  orderId: number;
  masterId?: number;
  clientName?: string;
  closingDate?: string;
  total?: string;
  expense?: string;
  net?: string;
  handover?: string;
}

interface OrderInModernNotification {
  orderId: number;
  masterId?: number;
  rk?: string;
  avitoName?: string;
  typeEquipment?: string;
  clientName?: string;
  dateMeeting?: string;
  prepayment?: string;
  expectedClosingDate?: string;
  comment?: string;
}

interface CityChangeNotification {
  orderId: number;
  oldCity: string;
  newCity: string;
  clientName?: string;
  masterId?: number;
  rk?: string;
  avitoName?: string;
  typeEquipment?: string;
  dateMeeting?: string;
}

interface AddressChangeNotification {
  orderId: number;
  city: string;
  oldAddress: string;
  newAddress: string;
  clientName?: string;
  masterId?: number;
  rk?: string;
  avitoName?: string;
  typeEquipment?: string;
  dateMeeting?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly notificationsUrl: string;
  private readonly webhookToken: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.notificationsUrl = this.configService.get<string>('NOTIFICATIONS_SERVICE_URL') || 'http://notifications-service.crm.svc.cluster.local:5006/api/v1';
    this.webhookToken = this.configService.get<string>('NOTIFICATIONS_WEBHOOK_TOKEN') || '';
    this.logger.log(`Notifications URL: ${this.notificationsUrl}`);
    this.logger.log(`Webhook token configured: ${this.webhookToken ? '✅' : '❌'}`);
  }

  /**
   * Отправка уведомления о новом заказе директору города
   */
  async sendNewOrderNotification(data: NewOrderNotification): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationsUrl}/notifications/new-order`,
          data,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Token': this.webhookToken,
            },
          },
        ),
      );
      this.logger.log(`✅ New order notification sent for order #${data.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send new order notification: ${error.message}`);
      // Не прерываем основной флоу если уведомление не отправилось
    }
  }

  /**
   * Отправка уведомления об изменении даты встречи
   */
  async sendDateChangeNotification(data: DateChangeNotification): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationsUrl}/notifications/date-change`,
          data,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Token': this.webhookToken,
            },
          },
        ),
      );
      this.logger.log(`✅ Date change notification sent for order #${data.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send date change notification: ${error.message}`);
    }
  }

  /**
   * Отправка уведомления об отмене заказа
   */
  async sendOrderRejectionNotification(data: OrderRejectionNotification): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationsUrl}/notifications/order-rejection`,
          data,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Token': this.webhookToken,
            },
          },
        ),
      );
      this.logger.log(`✅ Order rejection notification sent for order #${data.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send order rejection notification: ${error.message}`);
    }
  }

  /**
   * Отправка уведомления о назначении мастера
   */
  async sendMasterAssignedNotification(data: MasterAssignedNotification): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationsUrl}/notifications/master-assigned`,
          data,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Token': this.webhookToken,
            },
          },
        ),
      );
      this.logger.log(`✅ Master assigned notification sent for order #${data.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send master assigned notification: ${error.message}`);
    }
  }

  /**
   * Отправка уведомления о передаче заказа другому мастеру
   */
  async sendMasterReassignedNotification(data: MasterReassignedNotification): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationsUrl}/notifications/master-reassigned`,
          data,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Token': this.webhookToken,
            },
          },
        ),
      );
      this.logger.log(`✅ Master reassigned notification sent for order #${data.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send master reassigned notification: ${error.message}`);
    }
  }

  /**
   * Отправка уведомления о принятии заказа мастером
   */
  async sendOrderAcceptedNotification(data: OrderAcceptedNotification): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationsUrl}/notifications/order-accepted`,
          data,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Token': this.webhookToken,
            },
          },
        ),
      );
      this.logger.log(`✅ Order accepted notification sent for order #${data.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send order accepted notification: ${error.message}`);
    }
  }

  /**
   * Отправка уведомления о закрытии заказа
   */
  async sendOrderClosedNotification(data: OrderClosedNotification): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationsUrl}/notifications/order-closed`,
          data,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Token': this.webhookToken,
            },
          },
        ),
      );
      this.logger.log(`✅ Order closed notification sent for order #${data.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send order closed notification: ${error.message}`);
    }
  }

  /**
   * Отправка уведомления о заказе в модерне
   */
  async sendOrderInModernNotification(data: OrderInModernNotification): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationsUrl}/notifications/order-in-modern`,
          data,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Token': this.webhookToken,
            },
          },
        ),
      );
      this.logger.log(`✅ Order in modern notification sent for order #${data.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send order in modern notification: ${error.message}`);
    }
  }

  /**
   * Отправка уведомления об изменении города
   */
  async sendCityChangeNotification(data: CityChangeNotification): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationsUrl}/notifications/city-change`,
          data,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Token': this.webhookToken,
            },
          },
        ),
      );
      this.logger.log(`✅ City change notification sent for order #${data.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send city change notification: ${error.message}`);
    }
  }

  /**
   * Отправка уведомления об изменении адреса
   */
  async sendAddressChangeNotification(data: AddressChangeNotification): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.notificationsUrl}/notifications/address-change`,
          data,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Token': this.webhookToken,
            },
          },
        ),
      );
      this.logger.log(`✅ Address change notification sent for order #${data.orderId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send address change notification: ${error.message}`);
    }
  }
}

