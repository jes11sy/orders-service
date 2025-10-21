import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrderDto {
  @ApiProperty({ required: false }) @IsString() @IsOptional() statusOrder?: string;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() masterId?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() result?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() expenditure?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() clean?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() masterChange?: number;
  @ApiProperty({ required: false }) @IsString() @IsOptional() bsoDoc?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() expenditureDoc?: string;
  @ApiProperty({ required: false }) @IsDateString() @IsOptional() closingData?: string;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() prepayment?: number;
  @ApiProperty({ required: false }) @IsString() @IsOptional() comment?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() cashSubmissionStatus?: string;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() cashSubmissionAmount?: number;
  @ApiProperty({ required: false }) @IsString() @IsOptional() cashReceiptDoc?: string;
}

