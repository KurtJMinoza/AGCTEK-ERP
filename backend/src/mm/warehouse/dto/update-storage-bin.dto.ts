import { PartialType } from '@nestjs/mapped-types'
import { CreateStorageBinDto } from './create-storage-bin.dto'

export class UpdateStorageBinDto extends PartialType(CreateStorageBinDto) {}
