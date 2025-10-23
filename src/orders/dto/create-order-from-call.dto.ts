import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderFromCallDto {
  @ApiProperty() @IsNumber() @IsNotEmpty() callId: number;
  @ApiProperty() @IsString() @IsNotEmpty() rk: string;
  @ApiProperty() @IsString() @IsNotEmpty() city: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() avitoName?: string;
  @ApiProperty() @IsString() @IsNotEmpty() typeOrder: string;
  @ApiProperty() @IsString() @IsNotEmpty() clientName: string;
  @ApiProperty() @IsString() @IsNotEmpty() address: string;
  @ApiProperty() @IsString() @IsNotEmpty() dateMeeting: string;
  @ApiProperty() @IsString() @IsNotEmpty() typeEquipment: string;
  @ApiProperty() @IsString() @IsNotEmpty() problem: string;
}

