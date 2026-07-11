import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsNumber,
  IsObject,
  IsInt,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DifyChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  query: string;

  /** Continue multi-turn chat in the same Dify conversation */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  conversationId?: string;

  /** Optional letter text injected as Dify inputs.letter_context */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  letterContext?: string;

  /** Load inbound case summary into letter_context (org-scoped) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  caseId?: number;

  /** Skip short-term answer cache for this request */
  @IsOptional()
  @IsBoolean()
  skipCache?: boolean;
}

export class DifyWorkflowRunDto {
  /** Workflow input variables (must match Dify workflow start node) */
  @IsOptional()
  @IsObject()
  inputs?: Record<string, string | number | boolean>;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  user?: string;
}

export class DifyCompletionDto {
  /** Text-generator inputs; at minimum often includes `query` */
  @IsObject()
  inputs: Record<string, string | number | boolean>;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  user?: string;
}
