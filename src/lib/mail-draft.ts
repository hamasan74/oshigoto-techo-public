import type { EntryMode, InputBoardDraft } from '../types/input-board';
import type { BoardMailDraft } from '../types/mail';
import {
  buildBoardMailDraftFromTemplateContext,
  buildMailTemplateContext,
} from './output/mail-template';
import { buildDailyOutputViewModel } from './output/view-model';

export function buildBoardMailDraft(params: {
  date: string;
  board: InputBoardDraft;
  userId: string;
  userName: string;
  themeName?: string;
  currentMode?: EntryMode;
  now?: Date;
}): BoardMailDraft {
  const viewModel = buildDailyOutputViewModel(params);
  const context = buildMailTemplateContext({
    userId: params.userId,
    themeName: params.themeName ?? 'warm-teal',
    viewModel,
  });

  return buildBoardMailDraftFromTemplateContext(context);
}
