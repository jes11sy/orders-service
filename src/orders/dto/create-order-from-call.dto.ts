import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, IsDateString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderFromCallDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsNotEmpty() callIds: number[];

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

  @ApiProperty({ required: false, description: 'ID типа заказа' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  orderTypeId?: number;

  @ApiProperty({ required: false }) @IsString() @IsOptional() clientName?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() address?: string;
  @ApiProperty({ required: false }) @IsDateString() @IsOptional() dateMeeting?: string;

  @ApiProperty({ required: false, description: 'ID типа оборудования' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  equipmentTypeId?: number;

  @ApiProperty({ required: false }) @IsString() @IsOptional() problem?: string;

  @ApiProperty({ description: 'ID оператора' })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  @Transform(({ value }) => parseInt(value))
  operatorId: number;

  @ApiProperty({ required: false }) @IsString() @IsOptional() description?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() source?: string;
}
