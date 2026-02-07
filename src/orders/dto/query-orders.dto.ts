import { IsOptional, IsString, IsInt, Min, Max, MaxLength, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryOrdersDto {
  @ApiPropertyOptional({ description: 'Номер страницы', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Количество записей на странице', minimum: 1, maximum: 300, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Статус заказа (можно несколько через запятую: Готово,Отказ,Незаказ)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  status?: string;

  @ApiPropertyOptional({ description: 'Город' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'Поисковый запрос (общий)', maximum: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  search?: string;

  @ApiPropertyOptional({ description: 'Поиск по ID заказа' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }) => value?.trim())
  searchId?: string;

  @ApiPropertyOptional({ description: 'Поиск по номеру телефона' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }) => value?.trim())
  searchPhone?: string;

  @ApiPropertyOptional({ description: 'Поиск по адресу' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  searchAddress?: string;

  @ApiPropertyOptional({ description: 'ID мастера' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  masterId?: number;

  @ApiPropertyOptional({ description: 'Поиск по имени мастера' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  master?: string;

  @ApiPropertyOptional({ description: 'Дата закрытия (фильтр по дате)' })
  @IsOptional()
  @IsString()
  closingDate?: string;

  @ApiPropertyOptional({ description: 'РК (рекламная кампания)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  rk?: string;

  @ApiPropertyOptional({ description: 'Направление (тип оборудования)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  typeEquipment?: string;

  @ApiPropertyOptional({ description: 'Тип даты для фильтра (create - создания, close - закрытия, meeting - встречи)', enum: ['create', 'close', 'meeting'] })
  @IsOptional()
  @IsString()
  @IsIn(['create', 'close', 'meeting'])
  dateType?: 'create' | 'close' | 'meeting';

  @ApiPropertyOptional({ description: 'Дата от (формат YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Дата до (формат YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}

