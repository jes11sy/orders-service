import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderFromCallDto {
  @ApiProperty({ type: [Number] }) @IsArray() @IsNotEmpty() callIds: number[];
  @ApiProperty() @IsString() @IsNotEmpty() rk: string;
  @ApiProperty() @IsString() @IsNotEmpty() city: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() avitoName?: string;
  @ApiProperty() @IsString() @IsNotEmpty() typeOrder: string;
  @ApiProperty() @IsString() @IsNotEmpty() clientName: string;
  @ApiProperty() @IsString() @IsNotEmpty() address: string;
  @ApiProperty() @IsString() @IsNotEmpty() dateMeeting: string;
  @ApiProperty() @IsString() @IsNotEmpty() typeEquipment: string;
  @ApiProperty() @IsString() @IsNotEmpty() problem: string;
  @ApiProperty() @IsNumber() @IsNotEmpty() @Transform(({ value }) => parseInt(value)) operatorNameId: number;
}

