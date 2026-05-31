import {
  cloneInputBoardDraft,
  createEmptyInputBoardDraft,
  formatProjectSearchLabel,
  inferSummaryTimeRange,
  sortProjectCatalog,
  stepTimeValueExcludingLunch,
} from '../lib/input-board';
import type {
  AuxEntryType,
  EntryMode,
  InputBoardDraft,
  ProjectCatalogItem,
  ProjectCategory,
  ProjectEntry,
  ProjectTimeInputMode,
  WorkPlace,
} from '../types/input-board';

interface WorkbookRow {
  date: string;
  projectCode: string;
  projectName: string;
  categoryText: string;
  placeText: string;
  taskText: string;
  planStart: string;
  planEnd: string;
  actualStart: string;
  actualEnd: string;
  planMinutes: number;
  actualMinutes: number;
}

interface ResolvedRange {
  mode: ProjectTimeInputMode;
  start: string;
  end: string;
}

const FIXED_LUNCH_MINUTES = 60;

const workbookRows: WorkbookRow[] = [
  { date: '2026-03-01', projectCode: 'CDH1C06F30', projectName: 'ヤンマー移行ツール開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・開発環境テナント構築（マスタ事前確認用）カイハツカンキョウコウチクジゼンカクニンヨウ', planStart: '', planEnd: '', actualStart: '19:00', actualEnd: '23:00', planMinutes: 0, actualMinutes: 240 },
  { date: '2026-03-02', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・製造工程実施要領説明会\n・進捗打合せ\n・定常対応（QA対応、台帳チェック）セイゾウコウテイジッシヨウリョウセツメイカイダイチョウ', planStart: '10:00', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 180, actualMinutes: 240 },
  { date: '2026-03-02', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・DB資材構成管理／リリースツール製造シザイコウセイカンリセイゾウ', planStart: '', planEnd: '20:00', actualStart: '', actualEnd: '20:00', planMinutes: 240, actualMinutes: 240 },
  { date: '2026-03-02', projectCode: 'ZN10Z0ECD1', projectName: '第三imforce部間接費', categoryText: '間接カンセツ', placeText: '池袋イケブクロ', taskText: '・OJT報告会部内リハーサルホウコクカイブナイ', planStart: '', planEnd: '19:00', actualStart: '', actualEnd: '20:00', planMinutes: 60, actualMinutes: 60 },
  { date: '2026-03-03', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・DB資材構成管理／リリースツール製造シザイコウセイカンリセイゾウ', planStart: '10:00', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 0, actualMinutes: 330 },
  { date: '2026-03-03', projectCode: 'ZN10Z0ECD2', projectName: '第三imf間接研修通常', categoryText: '間接カンセツ', placeText: 'テレ', taskText: '・デモ環境問合せ対応カンキョウトイアワタイオウ', planStart: '', planEnd: '17:30', actualStart: '', actualEnd: '17:30', planMinutes: 0, actualMinutes: 60 },
  { date: '2026-03-04', projectCode: 'ZK10Z0A- 63K', projectName: '生産性向上に向けた現状調査およびプランニング', categoryText: '直接作業チョクセツサギョウ', placeText: '無錫ムシャク', taskText: '・無錫出張\n・AIセンター取り組みヒアリングムシャクシュッチョウトク', planStart: '', planEnd: '', actualStart: '09:30', actualEnd: '18:30', planMinutes: 0, actualMinutes: 480 },
  { date: '2026-03-05', projectCode: 'ZK10Z0A- 63K', projectName: '生産性向上に向けた現状調査およびプランニング', categoryText: '直接作業チョクセツサギョウ', placeText: '無錫ムシャク', taskText: '・無錫出張\n・開発効率化ディスカッションムシャクシュッチョウカイハツコウリツカ', planStart: '', planEnd: '', actualStart: '09:30', actualEnd: '18:30', planMinutes: 0, actualMinutes: 480 },
  { date: '2026-03-06', projectCode: 'ZK10Z0A- 63K', projectName: '生産性向上に向けた現状調査およびプランニング', categoryText: '直接作業チョクセツサギョウ', placeText: '無錫ムシャク', taskText: '・無錫出張\n・開発効率化ディスカッションムシャクシュッチョウカイハツコウリツカ', planStart: '', planEnd: '', actualStart: '09:30', actualEnd: '18:00', planMinutes: 0, actualMinutes: 450 },
  { date: '2026-03-09', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）ダイチョウ', planStart: '10:00', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 0, actualMinutes: 90 },
  { date: '2026-03-09', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・DB資材構成管理／リリースツール製造シザイコウセイカンリセイゾウ', planStart: '', planEnd: '', actualStart: '', actualEnd: '', planMinutes: 0, actualMinutes: 300 },
  { date: '2026-03-09', projectCode: 'ZK10Z0A-CAG', projectName: 'AIコーチ推進施策', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: 'DE内打合せナイウチアワ', planStart: '', planEnd: '', actualStart: '', actualEnd: '', planMinutes: 30, actualMinutes: 0 },
  { date: '2026-03-09', projectCode: 'ZK10Z0A- 63K', projectName: '生産性向上に向けた現状調査およびプランニング', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '出張内容整理、報告内容ディスカッションシュッチョウナイヨウセイリホウコクナイヨウ', planStart: '', planEnd: '19:00', actualStart: '', actualEnd: '20:00', planMinutes: 0, actualMinutes: 120 },
  { date: '2026-03-10', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・DB資材構成管理／リリースツール製造シザイコウセイカンリセイゾウ', planStart: '', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 0, actualMinutes: 570 },
  { date: '2026-03-10', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・定常対応（QA対応、台帳チェック）ダイチョウ', planStart: '', planEnd: '', actualStart: '', actualEnd: '', planMinutes: 0, actualMinutes: 60 },
  { date: '2026-03-10', projectCode: 'ZK10Z0A- 63K', projectName: '生産性向上に向けた現状調査およびプランニング', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '出張内容整理シュッチョウナイヨウセイリ', planStart: '', planEnd: '', actualStart: '', actualEnd: '21:45', planMinutes: 0, actualMinutes: 15 },
  { date: '2026-03-11', projectCode: 'ZK10Z0A- 63K', projectName: '生産性向上に向けた現状調査およびプランニング', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・フロント申請対応シンセイタイオウ', planStart: '', planEnd: '', actualStart: '13:00', actualEnd: '14:30', planMinutes: 0, actualMinutes: 90 },
  { date: '2026-03-12', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・DB資材構成管理／リリースツール製造シザイコウセイカンリセイゾウ', planStart: '', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 0, actualMinutes: 120 },
  { date: '2026-03-12', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）ダイチョウ', planStart: '', planEnd: '', actualStart: '', actualEnd: '17:30', planMinutes: 0, actualMinutes: 270 },
  { date: '2026-03-13', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・DB資材構成管理／リリースツール製造シザイコウセイカンリセイゾウ', planStart: '', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 0, actualMinutes: 480 },
  { date: '2026-03-13', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）ダイチョウ', planStart: '', planEnd: '', actualStart: '', actualEnd: '', planMinutes: 0, actualMinutes: 60 },
  { date: '2026-03-13', projectCode: 'ZK10Z0A63F', projectName: '移行作業共通化による作業効率向上', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・進捗打合せシンチョクウチアワ', planStart: '', planEnd: '', actualStart: '', actualEnd: '', planMinutes: 0, actualMinutes: 30 },
  { date: '2026-03-13', projectCode: 'ZK10Z0A63E', projectName: 'AI活用による生産性向上', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・状況確認\n・進捗打合せジョウキョウカクニンシンチョクウチアワ', planStart: '', planEnd: '', actualStart: '', actualEnd: '21:30', planMinutes: 0, actualMinutes: 60 },
  { date: '2026-03-16', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）\n・DB資材構成管理／リリースツール製造ダイチョウシザイコウセイカンリセイゾウ', planStart: '10:00', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 390, actualMinutes: 390 },
  { date: '2026-03-16', projectCode: 'ZK10Z0A-CAG', projectName: 'AIコーチ推進施策', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: 'DE内打合せナイウチアワ', planStart: '', planEnd: '18:30', actualStart: '', actualEnd: '18:00', planMinutes: 30, actualMinutes: 30 },
  { date: '2026-03-17', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）\n・DB資材構成管理／リリースツール製造ダイチョウシザイコウセイカンリセイゾウ', planStart: '10:00', planEnd: '18:00', actualStart: '10:00', actualEnd: '18:00', planMinutes: 420, actualMinutes: 420 },
  { date: '2026-03-18', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）\n・DB資材構成管理／リリースツール製造\n・社内環境説明会参加ダイチョウシザイコウセイカンリセイゾウシャナイカンキョウセツメイカイサンカ', planStart: '10:00', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 0, actualMinutes: 330 },
  { date: '2026-03-18', projectCode: 'ZK10Z0A- 63K', projectName: '生産性向上に向けた現状調査およびプランニング', categoryText: '間接カンセツ', placeText: '池袋イケブクロ', taskText: '・無錫出張報告ムシャクシュッチョウホウコク', planStart: '', planEnd: '17:00', actualStart: '', actualEnd: '17:00', planMinutes: 0, actualMinutes: 30 },
  { date: '2026-03-19', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）\n・DB資材構成管理／リリースツール製造ダイチョウシザイコウセイカンリセイゾウ', planStart: '', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 0, actualMinutes: 120 },
  { date: '2026-03-19', projectCode: 'ZN10Z0ECD2', projectName: '第三imf間接研修通常', categoryText: '間接カンセツ', placeText: '池袋イケブクロ', taskText: '・ワークショップ', planStart: '', planEnd: '', actualStart: '', actualEnd: '18:00', planMinutes: 0, actualMinutes: 300 },
  { date: '2026-03-19', projectCode: 'ZK10Z0A63E', projectName: 'AI活用による生産性向上', categoryText: '間接カンセツ', placeText: '池袋イケブクロ', taskText: '・無錫報告確認ムシャクホウコクカクニン', planStart: '', planEnd: '', actualStart: '18:00', actualEnd: '20:00', planMinutes: 0, actualMinutes: 120 },
  { date: '2026-03-23', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）ダイチョウ', planStart: '10:00', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 150, actualMinutes: 150 },
  { date: '2026-03-23', projectCode: '', projectName: '0', categoryText: '移動イドウ', placeText: '池袋イケブクロ', taskText: '分断ブンダン', planStart: '11:30', planEnd: '13:00', actualStart: '', actualEnd: '', planMinutes: 30, actualMinutes: 30 },
  { date: '2026-03-23', projectCode: 'CDH1C06F30', projectName: 'ヤンマー移行ツール開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・移行初期設定データ資材作成／検証イコウショキセッテイシザイサクセイケンショウ', planStart: '', planEnd: '', actualStart: '', actualEnd: '', planMinutes: 240, actualMinutes: 240 },
  { date: '2026-03-23', projectCode: 'ZK10Z0A-CAG', projectName: 'AIコーチ推進施策', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: 'DE内打合せナイウチアワ', planStart: '', planEnd: '', actualStart: '', actualEnd: '', planMinutes: 30, actualMinutes: 30 },
  { date: '2026-03-23', projectCode: 'ZK10Z0A63E', projectName: 'AI活用による生産性向上', categoryText: '間接カンセツ', placeText: '池袋イケブクロ', taskText: '・報告まとめホウコク', planStart: '', planEnd: '20:00', actualStart: '', actualEnd: '21:45', planMinutes: 90, actualMinutes: 195 },
  { date: '2026-03-24', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）ダイチョウ', planStart: '00:00', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 0, actualMinutes: 180 },
  { date: '2026-03-24', projectCode: 'CDH1C06F30', projectName: 'ヤンマー移行ツール開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・移行初期設定データ資材作成／検証イコウショキセッテイシザイサクセイケンショウ', planStart: '', planEnd: '', actualStart: '', actualEnd: '', planMinutes: 0, actualMinutes: 240 },
  { date: '2026-03-24', projectCode: '', projectName: '0', categoryText: '分断/休憩ブンダンキュウケイ', placeText: 'テレ', taskText: '分断ブンダン', planStart: '', planEnd: '', actualStart: '19:15', actualEnd: '20:30', planMinutes: 0, actualMinutes: 75 },
  { date: '2026-03-24', projectCode: 'ZK10Z0A63E', projectName: 'AI活用による生産性向上', categoryText: '間接カンセツ', placeText: 'テレ', taskText: '・報告まとめホウコク', planStart: '', planEnd: '20:00', actualStart: '20:30', actualEnd: '23:15', planMinutes: 0, actualMinutes: 240 },
  { date: '2026-03-25', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: 'テレ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）ダイチョウ', planStart: '10:00', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 150, actualMinutes: 180 },
  { date: '2026-03-25', projectCode: '', projectName: '0', categoryText: '移動イドウ', placeText: 'テレ', taskText: '分断ブンダン', planStart: '11:30', planEnd: '13:00', actualStart: '11:30', actualEnd: '13:00', planMinutes: 30, actualMinutes: 30 },
  { date: '2026-03-25', projectCode: 'CDH1C06F30', projectName: 'ヤンマー移行ツール開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・移行初期設定データ資材作成／検証イコウショキセッテイシザイサクセイケンショウ', planStart: '', planEnd: '', actualStart: '13:00', actualEnd: '19:30', planMinutes: 240, actualMinutes: 300 },
  { date: '2026-03-25', projectCode: '', projectName: '0', categoryText: '移動イドウ', placeText: 'テレ', taskText: '分断ブンダン', planStart: '00:00', planEnd: '', actualStart: '19:30', actualEnd: '21:00', planMinutes: 0, actualMinutes: 90 },
  { date: '2026-03-25', projectCode: 'ZK10Z0A63E', projectName: 'AI活用による生産性向上', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・報告まとめホウコク', planStart: '', planEnd: '20:00', actualStart: '21:00', actualEnd: '23:30', planMinutes: 120, actualMinutes: 150 },
  { date: '2026-03-26', projectCode: 'ZN10Z0ECD2', projectName: '第三imf間接研修通常', categoryText: '間接カンセツ', placeText: '', taskText: '・管理職合宿カンリショクガッシュク', planStart: '', planEnd: '', actualStart: '09:00', actualEnd: '18:00', planMinutes: 0, actualMinutes: 480 },
  { date: '2026-03-26', projectCode: 'ZK10Z0A63E', projectName: 'AI活用による生産性向上', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・報告まとめホウコク', planStart: '', planEnd: '', actualStart: '21:30', actualEnd: '00:15', planMinutes: 0, actualMinutes: 165 },
  { date: '2026-03-27', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）ダイチョウ', planStart: '', planEnd: '', actualStart: '09:45', actualEnd: '', planMinutes: 0, actualMinutes: 120 },
  { date: '2026-03-27', projectCode: 'CDH1C06F30', projectName: 'ヤンマー移行ツール開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・移行初期設定データ資材作成／検証イコウショキセッテイシザイサクセイケンショウ', planStart: '', planEnd: '', actualStart: '', actualEnd: '', planMinutes: 0, actualMinutes: 300 },
  { date: '2026-03-27', projectCode: 'ZK10Z0A63E', projectName: 'AI活用による生産性向上', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・報告まとめホウコク', planStart: '', planEnd: '', actualStart: '', actualEnd: '19:30', planMinutes: 0, actualMinutes: 105 },
  { date: '2026-03-30', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）\n・IT1実施準備ダイチョウジッシジュンビ', planStart: '', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 0, actualMinutes: 300 },
  { date: '2026-03-30', projectCode: 'CDH1C06F30', projectName: 'ヤンマー移行ツール開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・移行初期設定データ資材作成／検証イコウショキセッテイシザイサクセイケンショウ', planStart: '', planEnd: '', actualStart: '', actualEnd: '19:00', planMinutes: 0, actualMinutes: 180 },
  { date: '2026-03-31', projectCode: 'CDH1203F10', projectName: 'ヤンマー導入・開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・進捗打合せ\n・定常対応（QA対応、台帳チェック）\n・IT1実施準備ダイチョウジッシジュンビ', planStart: '', planEnd: '', actualStart: '10:00', actualEnd: '', planMinutes: 0, actualMinutes: 360 },
  { date: '2026-03-31', projectCode: 'CDH1C06F30', projectName: 'ヤンマー移行ツール開発', categoryText: '直接作業チョクセツサギョウ', placeText: '池袋イケブクロ', taskText: '・移行初期設定データ資材作成／検証イコウショキセッテイシザイサクセイケンショウ', planStart: '', planEnd: '', actualStart: '', actualEnd: '19:00', planMinutes: 0, actualMinutes: 120 },
];

const projectMasterOverrides: Record<string, Partial<ProjectCatalogItem>> = {
  CDH1203F10: {
    monthlyBudgetMinutes: 6000,
    pinned: true,
    timesheetProjectLabel: 'ﾏﾈｼﾞﾒﾝﾄ',
    aliases: ['ヤンマー導入', 'ヤンマーF10'],
  },
  'ZK10Z0A- 63K': {
    pinned: true,
    recent: true,
    aliases: ['無錫調査', '生産性向上調査'],
  },
  CDH1C06F30: {
    monthlyBudgetMinutes: 1620,
    pinned: true,
    recent: true,
    timesheetProjectLabel: 'AIｺｰﾁ推進施策',
    aliases: ['ヤンマー移行', '移行ツール'],
  },
  ZK10Z0A63E: {
    recent: true,
    aliases: ['AI活用'],
  },
  ZN10Z0ECD2: {
    recent: true,
    aliases: ['間接研修'],
  },
  'ZK10Z0A-CAG': {
    recent: true,
    aliases: ['AIコーチ'],
  },
};

function toTimeMinutes(value: string) {
  const matched = value.match(/^(\d{2}):(\d{2})$/);
  if (!matched) {
    return null;
  }

  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  return hours * 60 + minutes;
}

function formatTimeValue(minutes: number) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const remainder = String(minutes % 60).padStart(2, '0');
  return `${hours}:${remainder}`;
}

function resolveRange(startTime: string, endTime: string, minutes: number): ResolvedRange {
  const startMinutes = toTimeMinutes(startTime);
  const endMinutes = toTimeMinutes(endTime);

  if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) {
    return {
      mode: 'range',
      start: startTime,
      end: endTime,
    };
  }

  if (minutes > 0 && startMinutes !== null) {
    const inferredEnd = stepTimeValueExcludingLunch(startTime, minutes, startTime, FIXED_LUNCH_MINUTES);
    if (toTimeMinutes(inferredEnd) !== null && inferredEnd !== startTime) {
      return {
        mode: 'range',
        start: startTime,
        end: inferredEnd,
      };
    }
  }

  if (minutes > 0 && endMinutes !== null) {
    const inferredStart = stepTimeValueExcludingLunch(endTime, -minutes, endTime, FIXED_LUNCH_MINUTES);
    const inferredStartMinutes = toTimeMinutes(inferredStart);
    if (inferredStartMinutes !== null && inferredStartMinutes < endMinutes) {
      return {
        mode: 'range',
        start: inferredStart,
        end: endTime,
      };
    }
  }

  return {
    mode: 'duration',
    start: startTime,
    end: endTime,
  };
}

function sanitizeTaskLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return '';
  }

  if (!/[一-龯ぁ-ん]/u.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(/((?:.*[一-龯ぁ-んA-Za-z0-9／・（）()、,\-]))[ァ-ヴー]{4,}$/u, '$1').trim();
}

function sanitizeTaskText(taskText: string) {
  return Array.from(new Set(taskText.split('\n').map((line) => sanitizeTaskLine(line)).filter(Boolean))).join('\n');
}

function getPrimaryTaskLabel(taskText: string) {
  return sanitizeTaskText(taskText).split('\n')[0] ?? '';
}

function resolveProjectCategory(categoryText: string): ProjectCategory {
  return categoryText.includes('直接') ? 'direct' : 'indirect';
}

function resolveWorkPlace(placeText: string): WorkPlace {
  if (placeText.includes('テレ')) {
    return 'home';
  }

  if (placeText.includes('池袋')) {
    return 'office';
  }

  if (placeText.includes('無錫')) {
    return 'client';
  }

  return 'other';
}

function resolveWorkPlaceDetail(placeText: string) {
  const trimmed = placeText.trim();
  return resolveWorkPlace(trimmed) === 'other' ? trimmed : '';
}

function pickMostFrequentValue<T extends string>(values: T[], fallback: T): T {
  if (values.length === 0) {
    return fallback;
  }

  const counts = new Map<T, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
}

function buildProjectCatalog(rows: WorkbookRow[]) {
  const groupedRows = new Map<string, WorkbookRow[]>();
  rows
    .filter((row) => row.projectCode.trim() !== '')
    .forEach((row) => {
      const currentRows = groupedRows.get(row.projectCode) ?? [];
      currentRows.push(row);
      groupedRows.set(row.projectCode, currentRows);
    });

  const projectCatalog = [...groupedRows.entries()].map(([projectCode, projectRows]) => {
    const [firstRow] = projectRows;
    const cleanedTasks = projectRows.map((row) => sanitizeTaskText(row.taskText)).filter(Boolean);
    const recentTaskNames = Array.from(
      new Set(
        [...cleanedTasks]
          .sort((left, right) => {
            const leftCount = cleanedTasks.filter((task) => task === left).length;
            const rightCount = cleanedTasks.filter((task) => task === right).length;
            return rightCount - leftCount;
          })
          .slice(0, 5),
      ),
    );
    const override = projectMasterOverrides[projectCode] ?? {};
    const defaultPlace = pickMostFrequentValue(
      projectRows.map((row) => row.placeText).filter(Boolean),
      firstRow.placeText,
    );

    return {
      projectCode,
      projectName: firstRow.projectName,
      category: pickMostFrequentValue(
        projectRows.map((row) => resolveProjectCategory(row.categoryText)),
        resolveProjectCategory(firstRow.categoryText),
      ),
      monthlyBudgetMinutes: override.monthlyBudgetMinutes ?? projectRows.reduce((total, row) => total + row.planMinutes, 0),
      defaultTaskName: override.defaultTaskName ?? getPrimaryTaskLabel(recentTaskNames[0] ?? ''),
      defaultPlace: override.defaultPlace ?? resolveWorkPlace(defaultPlace),
      isActive: override.isActive ?? true,
      pinned: override.pinned ?? false,
      recent: override.recent ?? false,
      needsComment: override.needsComment ?? false,
      aliases: override.aliases,
      recentTaskNames,
    } satisfies ProjectCatalogItem;
  });

  return sortProjectCatalog(projectCatalog);
}

function createProjectEntryFromRow(row: WorkbookRow, projectCatalog: ProjectCatalogItem[], index: number): ProjectEntry {
  const matchedProject = projectCatalog.find((project) => project.projectCode === row.projectCode);
  const taskLabel = sanitizeTaskText(row.taskText);
  const planRange = resolveRange(row.planStart, row.planEnd, row.planMinutes);
  const actualRange = resolveRange(row.actualStart, row.actualEnd, row.actualMinutes);
  const place = resolveWorkPlace(row.placeText);
  const placeDetail = resolveWorkPlaceDetail(row.placeText);

  return {
    id: `project-${row.date}-${String(index + 1).padStart(2, '0')}`,
    projectSearch: formatProjectSearchLabel(row.projectCode, row.projectName),
    projectCode: row.projectCode,
    projectName: row.projectName,
    category: resolveProjectCategory(row.categoryText),
    needsComment: Boolean(matchedProject?.needsComment),
    timeInputMode: {
      plan: planRange.mode,
      actual: actualRange.mode,
    },
    rangeStart: {
      plan: planRange.mode === 'range' ? planRange.start : '',
      actual: actualRange.mode === 'range' ? actualRange.start : '',
    },
    rangeEnd: {
      plan: planRange.mode === 'range' ? planRange.end : '',
      actual: actualRange.mode === 'range' ? actualRange.end : '',
    },
    minutes: {
      plan: row.planMinutes,
      actual: row.actualMinutes,
    },
    taskName: {
      plan: row.planMinutes > 0 ? taskLabel : '',
      actual: row.actualMinutes > 0 ? taskLabel : '',
    },
    place: {
      plan: place,
      actual: place,
    },
    placeDetail: {
      plan: placeDetail,
      actual: placeDetail,
    },
    note: {
      plan: '',
      actual: '',
    },
    recentTaskNames: matchedProject?.recentTaskNames ?? [taskLabel].filter(Boolean),
  };
}

function createAuxEntriesFromRows(rows: WorkbookRow[]) {
  const auxEntries: InputBoardDraft['auxEntries'] = [];
  let counter = 1;

  rows
    .filter((row) => row.projectCode.trim() === '')
    .forEach((row) => {
      const type: AuxEntryType = row.categoryText.includes('休憩') ? 'break' : 'split';
      const note = row.categoryText.includes('移動')
        ? '移動'
        : row.categoryText.includes('休憩')
          ? '休憩'
          : sanitizeTaskText(row.taskText) || '分断';

      (['plan', 'actual'] as EntryMode[]).forEach((mode) => {
        const minutes = mode === 'plan' ? row.planMinutes : row.actualMinutes;
        if (minutes <= 0) {
          return;
        }

        const range = resolveRange(
          mode === 'plan' ? row.planStart : row.actualStart,
          mode === 'plan' ? row.planEnd : row.actualEnd,
          minutes,
        );
        if (range.mode !== 'range' || !range.start || !range.end) {
          return;
        }

        auxEntries.push({
          id: `${type}-${mode}-${row.date}-${String(counter).padStart(2, '0')}`,
          mode,
          type,
          startTime: range.start,
          endTime: range.end,
          note,
        });
        counter += 1;
      });
    });

  return auxEntries;
}

function buildSummaryTimes(rows: WorkbookRow[], projectEntries: ProjectEntry[], mode: EntryMode) {
  const allocationMinutes = projectEntries.reduce((total, entry) => total + entry.minutes[mode], 0);
  const auxMinutes = rows
    .filter((row) => row.projectCode.trim() === '')
    .reduce((total, row) => total + (mode === 'plan' ? row.planMinutes : row.actualMinutes), 0);
  const totalMinutes = allocationMinutes + auxMinutes;

  if (totalMinutes <= 0) {
    return {
      startTime: '',
      endTime: '',
    };
  }

  const ranges = rows
    .map((row) =>
      resolveRange(
        mode === 'plan' ? row.planStart : row.actualStart,
        mode === 'plan' ? row.planEnd : row.actualEnd,
        mode === 'plan' ? row.planMinutes : row.actualMinutes,
      ),
    )
    .filter((range) => range.mode === 'range' && range.start && range.end)
    .map((range) => ({
      start: toTimeMinutes(range.start),
      end: toTimeMinutes(range.end),
    }))
    .filter((range): range is { start: number; end: number } => range.start !== null && range.end !== null);

  const earliestStart = ranges.length > 0 ? Math.min(...ranges.map((range) => range.start)) : null;
  const latestEnd = ranges.length > 0 ? Math.max(...ranges.map((range) => range.end)) : null;

  if (earliestStart !== null) {
    const inferredRange = inferSummaryTimeRange(
      formatTimeValue(earliestStart),
      allocationMinutes,
      auxMinutes,
      FIXED_LUNCH_MINUTES,
    );
    if (inferredRange.startTime && inferredRange.endTime) {
      return inferredRange;
    }

    if (latestEnd !== null && latestEnd > earliestStart) {
      return {
        startTime: formatTimeValue(earliestStart),
        endTime: formatTimeValue(latestEnd),
      };
    }
  }

  if (latestEnd !== null) {
    const inferredStart = stepTimeValueExcludingLunch(
      formatTimeValue(latestEnd),
      -totalMinutes,
      formatTimeValue(latestEnd),
      FIXED_LUNCH_MINUTES,
    );
    const inferredStartMinutes = toTimeMinutes(inferredStart);
    if (inferredStartMinutes !== null && inferredStartMinutes < latestEnd) {
      return {
        startTime: inferredStart,
        endTime: formatTimeValue(latestEnd),
      };
    }
  }

  return {
    startTime: '',
    endTime: '',
  };
}

function buildBoardForDate(date: string, rows: WorkbookRow[], projectCatalog: ProjectCatalogItem[]) {
  const draft = createEmptyInputBoardDraft(date, projectCatalog);
  const projectEntries = rows
    .filter((row) => row.projectCode.trim() !== '')
    .sort((left, right) => {
      const leftRange = resolveRange(left.actualStart, left.actualEnd, left.actualMinutes);
      const rightRange = resolveRange(right.actualStart, right.actualEnd, right.actualMinutes);
      const leftStart = toTimeMinutes(leftRange.start) ?? toTimeMinutes(resolveRange(left.planStart, left.planEnd, left.planMinutes).start) ?? 9999;
      const rightStart =
        toTimeMinutes(rightRange.start) ?? toTimeMinutes(resolveRange(right.planStart, right.planEnd, right.planMinutes).start) ?? 9999;
      return leftStart - rightStart;
    })
    .map((row, index) => createProjectEntryFromRow(row, projectCatalog, index));

  draft.projectEntries = projectEntries.length > 0 ? projectEntries : draft.projectEntries;
  draft.auxEntries = createAuxEntriesFromRows(rows);
  draft.currentMode = projectEntries.some((entry) => entry.minutes.actual > 0) ? 'actual' : 'plan';

  const planSummary = buildSummaryTimes(rows, draft.projectEntries, 'plan');
  const actualSummary = buildSummaryTimes(rows, draft.projectEntries, 'actual');
  draft.startTime.plan = planSummary.startTime;
  draft.endTime.plan = planSummary.endTime;
  draft.startTime.actual = actualSummary.startTime;
  draft.endTime.actual = actualSummary.endTime;

  return draft;
}

function buildMockRecords() {
  const projectCatalog = buildProjectCatalog(workbookRows);
  const rowsByDate = new Map<string, WorkbookRow[]>();

  workbookRows.forEach((row) => {
    const currentRows = rowsByDate.get(row.date) ?? [];
    currentRows.push(row);
    rowsByDate.set(row.date, currentRows);
  });

  return Object.fromEntries(
    [...rowsByDate.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([date, rows]) => [date, buildBoardForDate(date, rows, projectCatalog)]),
  ) as Record<string, InputBoardDraft>;
}

function applyDemoTweaks(records: Record<string, InputBoardDraft>) {
  const currentBoard = records['2026-03-30'];
  if (!currentBoard) {
    return records;
  }

  const nextBoard = cloneInputBoardDraft(currentBoard);
  nextBoard.currentMode = 'actual';
  nextBoard.startTime.actual = '10:00';
  nextBoard.endTime.actual = '19:00';
  nextBoard.projectEntries = nextBoard.projectEntries.map((entry) => {
    if (entry.projectCode === 'CDH1203F10') {
      return {
        ...entry,
        timeInputMode: {
          ...entry.timeInputMode,
          actual: 'range',
        },
        rangeStart: {
          ...entry.rangeStart,
          actual: '10:00',
        },
        rangeEnd: {
          ...entry.rangeEnd,
          actual: '17:00',
        },
        minutes: {
          ...entry.minutes,
          actual: 360,
        },
      };
    }

    if (entry.projectCode === 'CDH1C06F30') {
      return {
        ...entry,
        timeInputMode: {
          ...entry.timeInputMode,
          actual: 'range',
        },
        rangeStart: {
          ...entry.rangeStart,
          actual: '17:00',
        },
        rangeEnd: {
          ...entry.rangeEnd,
          actual: '19:00',
        },
        minutes: {
          ...entry.minutes,
          actual: 120,
        },
      };
    }

    return entry;
  });

  return {
    ...records,
    '2026-03-30': nextBoard,
  };
}

export const mockInputBoardRecords: Record<string, InputBoardDraft> = applyDemoTweaks(buildMockRecords());

export const mockInputBoardDraft: InputBoardDraft = cloneInputBoardDraft(
  mockInputBoardRecords['2026-03-30'] ??
    Object.values(mockInputBoardRecords).sort((left, right) => right.date.localeCompare(left.date))[0],
);
