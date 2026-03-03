import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, MaxLength, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({ description: 'ID рекламной кампании' })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  rkId: number;

  @ApiProperty({ description: 'ID города' })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  cityId: number;

  @ApiProperty({ description: 'Телефон клиента' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{9,14}$/, { message: 'Неверный формат телефона' })
  @MaxLength(15)
  phone: string;

  @ApiProperty({ required: false, description: 'ID типа заказа' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  orderTypeId?: number;

  @ApiProperty({ description: 'Имя клиента' })
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

  @ApiProperty({ description: 'ID оператора' })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  operatorId: number;

  @ApiProperty({ required: false, description: 'ID звонка' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  callId?: string;

  @ApiProperty({ required: false, description: 'Комментарий' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  @Matches(/^[^<>]*$/, { message: 'HTML теги не разрешены' })
  comment?: string;

  @ApiProperty({ required: false, description: 'Примечание (описание обращения)' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, description: 'Источник' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  source?: string;
}
