import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrderDto {
  // Основные поля заказа
  @ApiProperty({ required: false }) @IsString() @IsOptional() rk?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() city?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() avitoName?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() phone?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() typeOrder?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() clientName?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() address?: string;
  @ApiProperty({ required: false }) @IsDateString() @IsOptional() dateMeeting?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() typeEquipment?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() problem?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() avitoChatId?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() callId?: string;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() operatorNameId?: number;
  
  // Поля статуса и мастера
  @ApiProperty({ required: false }) @IsString() @IsOptional() statusOrder?: string;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() masterId?: number;
  
  // Финансовые поля
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() result?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() expenditure?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() clean?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() masterChange?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() prepayment?: number;
  
  // Документы
  @ApiProperty({ required: false }) @IsString() @IsOptional() bsoDoc?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() expenditureDoc?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() cashReceiptDoc?: string;
  
  // Даты
  @ApiProperty({ required: false }) @IsDateString() @IsOptional() closingData?: string;
  
  // Дополнительные поля
  @ApiProperty({ required: false }) @IsString() @IsOptional() comment?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() cashSubmissionStatus?: string;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() cashSubmissionAmount?: number;
}

