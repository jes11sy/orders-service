import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AppealStatus, AppealCategory } from '@prisma/client';

export class CreateAppealDto {
  @IsString()
  @IsNotEmpty({ message: 'Телефон клиента обязателен' })
  @MaxLength(20)
  clientPhone: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientName?: string;

  @IsEnum(AppealCategory, { message: 'Неверная категория' })
  category: AppealCategory;

  @IsString()
  @IsNotEmpty({ message: 'Описание обращения обязательно' })
  description: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsEnum(AppealStatus, { message: 'Неверный статус' })
  status?: AppealStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  callId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  siteOrderId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId?: number;
}

export class UpdateAppealDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  clientPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientName?: string;

  @IsOptional()
  @IsEnum(AppealCategory)
  category?: AppealCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsEnum(AppealStatus)
  status?: AppealStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  callId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  siteOrderId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId?: number;
}

export class QueryAppealsDto {
  @IsOptional()
  @IsEnum(AppealStatus)
  status?: AppealStatus;

  @IsOptional()
  @IsEnum(AppealCategory)
  category?: AppealCategory;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 1)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || 50)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}
