import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateAppealDto {
  @IsString()
  @IsNotEmpty({ message: 'Телефон клиента обязателен' })
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  statusId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  callId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  siteOrderId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rkId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;
}

export class UpdateAppealDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  statusId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  callId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  siteOrderId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rkId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;
}

export class QueryAppealsDto {
  @IsOptional()
  @IsString()
  status?: string;

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
