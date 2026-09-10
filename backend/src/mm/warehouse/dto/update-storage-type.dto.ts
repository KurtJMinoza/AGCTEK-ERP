import { PartialType } from '@nestjs/mapped-types'
import { CreateStorageTypeDto } from './create-storage-type.dto'

export class UpdateStorageTypeDto extends PartialType(CreateStorageTypeDto) {}
