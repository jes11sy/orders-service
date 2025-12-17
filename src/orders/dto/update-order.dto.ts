import { IsString, IsOptional, IsNumber, IsDateString, MaxLength, Matches, IsIn, Min, Max, ValidateIf, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateOrderDto {
  // Основные поля заказа
  @ApiProperty({ required: false, description: 'Рекламная кампания' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  rk?: string;

  @ApiProperty({ required: false, description: 'Город' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ required: false, description: 'Имя аккаунта Avito' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  avitoName?: string;

  @ApiProperty({ required: false, description: 'Телефон клиента' })
  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{9,14}$/, { message: 'Неверный формат телефона' })
  @MaxLength(15)
  phone?: string;

  @ApiProperty({ required: false, description: 'Тип заказа' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  typeOrder?: string;

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

  @ApiProperty({ required: false, description: 'Тип оборудования' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  typeEquipment?: string;

  @ApiProperty({ required: false, description: 'Описание проблемы' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  problem?: string;

  @ApiProperty({ required: false, description: 'ID чата Avito' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  avitoChatId?: string;

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
  operatorNameId?: number;
  
  // Поля статуса и мастера
  @ApiProperty({ required: false, description: 'Статус заказа' })
  @IsString()
  @IsOptional()
  @IsIn(['Ожидает', 'Принял', 'В пути', 'В работе', 'Готово', 'Отказ', 'Модерн', 'Незаказ'])
  statusOrder?: string;

  @ApiProperty({ required: false, description: 'ID мастера' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  masterId?: number;
  
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
  
  // Документы
  @ApiProperty({ required: false, description: 'Документ БСО', nullable: true })
  @ValidateIf((o) => o.bsoDoc !== null)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  bsoDoc?: string | null;

  @ApiProperty({ required: false, description: 'Документ расходов', nullable: true })
  @ValidateIf((o) => o.expenditureDoc !== null)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  expenditureDoc?: string | null;

  @ApiProperty({ required: false, description: 'Документ кассового чека' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  cashReceiptDoc?: string;
  
  // Даты
  @ApiProperty({ required: false, description: 'Дата закрытия' })
  @IsDateString()
  @IsOptional()
  closingData?: string;

  @ApiProperty({ required: false, description: 'Дата закрытия модерна' })
  @IsDateString()
  @IsOptional()
  dateClosmod?: string;
  
  // Дополнительные поля
  @ApiProperty({ required: false, description: 'Комментарий' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  @Matches(/^[^<>]*$/, { message: 'HTML теги не разрешены' })
  comment?: string;

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

  @ApiProperty({ required: false, description: 'Партнер' })
  @IsBoolean()
  @IsOptional()
  partner?: boolean;

  @ApiProperty({ required: false, description: 'Процент партнера' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  partnerPercent?: number;
}

