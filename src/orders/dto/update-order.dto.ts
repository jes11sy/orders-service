import { IsString, IsOptional, IsNumber, IsDateString, MaxLength, Matches, Min, Max, ValidateIf, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateOrderDto {
  // Основные поля заказа
  @ApiProperty({ required: false, description: 'ID рекламной кампании' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  rkId?: number;

  @ApiProperty({ required: false, description: 'ID города' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  cityId?: number;

  @ApiProperty({ required: false, description: 'Телефон клиента' })
  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{9,14}$/, { message: 'Неверный формат телефона' })
  @MaxLength(15)
  phone?: string;

  @ApiProperty({ required: false, description: 'ID типа заказа' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  orderTypeId?: number;

  @ApiProperty({ required: false, description: 'Имя клиента' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  @Matches(/^[^<>]*$/, { message: 'HTML теги не разрешены' })
  clientName?: string;

  @ApiProperty({ required: false, description: 'Адрес' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @Matches(/^[^<>]*$/, { message: 'HTML теги не разрешены' })
  address?: string;

  @ApiProperty({ required: false, description: 'Дата встречи' })
  @IsDateString()
  @IsOptional()
  dateMeeting?: string;

  @ApiProperty({ required: false, description: 'ID типа оборудования' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  equipmentTypeId?: number;

  @ApiProperty({ required: false, description: 'Описание проблемы' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  problem?: string;

  @ApiProperty({ required: false, description: 'ID звонка' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  callId?: string;

  @ApiProperty({ required: false, description: 'ID оператора' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  operatorId?: number;

  // Поля статуса и мастера
  @ApiProperty({ required: false, description: 'ID статуса заказа' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  statusId?: number;

  @ApiProperty({ required: false, description: 'ID мастера (null для снятия)', nullable: true })
  @ValidateIf((o) => o.masterId !== null)
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  masterId?: number | null;

  // Финансовые поля
  @ApiProperty({ required: false, description: 'Итоговая сумма' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(999999)
  result?: number;

  @ApiProperty({ required: false, description: 'Расходы' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(999999)
  expenditure?: number;

  @ApiProperty({ required: false, description: 'Чистая прибыль' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(999999)
  clean?: number;

  @ApiProperty({ required: false, description: 'Сдача мастера' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(999999)
  masterChange?: number;

  @ApiProperty({ required: false, description: 'Предоплата' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(999999)
  prepayment?: number;

  // Документы (хранятся в order_documents)
  @ApiProperty({ required: false, description: 'Массив документов БСО', type: [String], nullable: true })
  @ValidateIf((o) => o.bsoDoc !== null)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bsoDoc?: string[] | null;

  @ApiProperty({ required: false, description: 'Массив документов расходов', type: [String], nullable: true })
  @ValidateIf((o) => o.expenditureDoc !== null)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  expenditureDoc?: string[] | null;

  @ApiProperty({ required: false, description: 'Документ кассового чека' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  cashReceiptDoc?: string;

  // Даты
  @ApiProperty({ required: false, description: 'Дата закрытия' })
  @IsDateString()
  @IsOptional()
  closingAt?: string;

  @ApiProperty({ required: false, description: 'Дата закрытия модерна' })
  @IsDateString()
  @IsOptional()
  dateCloseMod?: string;

  // Дополнительные поля
  @ApiProperty({ required: false, description: 'Комментарий' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  @Matches(/^[^<>]*$/, { message: 'HTML теги не разрешены' })
  comment?: string;

  // Касса (хранится в cash_submissions)
  @ApiProperty({ required: false, description: 'Статус подачи кассы' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  cashSubmissionStatus?: string;

  @ApiProperty({ required: false, description: 'Сумма подачи кассы' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(999999)
  cashSubmissionAmount?: number;
}
