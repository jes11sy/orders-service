import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderFromChatDto {
  @ApiProperty() @IsString() @IsNotEmpty() rk: string;
  @ApiProperty() @IsString() @IsNotEmpty() city: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() avitoName?: string;
  @ApiProperty() @IsString() @IsNotEmpty() phone: string;
  @ApiProperty() @IsString() @IsNotEmpty() typeOrder: string;
  @ApiProperty() @IsString() @IsNotEmpty() clientName: string;
  @ApiProperty() @IsString() @IsNotEmpty() address: string;
  @ApiProperty() @IsDateString() @IsNotEmpty() dateMeeting: string;
  @ApiProperty() @IsString() @IsNotEmpty() typeEquipment: string;
  @ApiProperty() @IsString() @IsNotEmpty() problem: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() callRecord?: string;
  @ApiProperty({ required: false, default: 'Ожидает' }) @IsString() @IsOptional() statusOrder?: string;
  @ApiProperty() @IsNumber() @IsNotEmpty() @Transform(({ value }) => parseInt(value)) operatorNameId: number;
  @ApiProperty({ required: false }) @IsString() @IsOptional() avitoChatId?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() comment?: string;
}
