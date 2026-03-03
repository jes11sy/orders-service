import { IsString, IsOptional, MaxLength, IsIn, IsInt, IsDateString } from 'class-validator';

const SITE_ORDER_STATUSES = ['Создан', 'В обработке', 'Перезвонить', 'Не отвечает', 'Отказ', 'Заказ создан'] as const;

export class UpdateSiteOrderDto {
  @IsOptional()
  @IsInt()
  cityId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  site?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @IsIn(SITE_ORDER_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  commentOperator?: string;

  @IsOptional()
  @IsInt()
  orderId?: number;

  @IsOptional()
  @IsDateString()
  callbackAt?: string;
}
