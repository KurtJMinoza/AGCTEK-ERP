import { IsString, IsNotEmpty, IsOptional } from 'class-validator'

export class AssignPutawayDto {
    @IsOptional()
    @IsString()
    workerId?: string

    @IsOptional()
    @IsString()
    assignedWorker?: string
}
