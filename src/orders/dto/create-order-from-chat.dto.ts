import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderFromChatDto {
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

  @ApiProperty() @IsString() @IsNotEmpty() phone: string;

  @ApiProperty({ description: 'ID типа заказа' })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  orderTypeId: number;

  @ApiProperty() @IsString() @IsNotEmpty() clientName: string;
  @ApiProperty() @IsString() @IsNotEmpty() address: string;
  @ApiProperty() @IsDateString() @IsNotEmpty() dateMeeting: string;

  @ApiProperty({ description: 'ID типа оборудования' })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  equipmentTypeId: number;

  @ApiProperty() @IsString() @IsNotEmpty() problem: string;

  @ApiProperty({ description: 'ID оператора' })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  @Transform(({ value }) => parseInt(value))
  operatorId: number;

  @ApiProperty({ required: false }) @IsString() @IsOptional() callId?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() comment?: string;
}
