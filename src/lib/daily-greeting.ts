import type { ServerTodayFact } from '../storage/server-greeting';
import type { EntryMode } from '../types/input-board';

interface GreetingSourceLink {
  label: string;
  url: string;
}

interface LuckyColorOption {
  name: string;
  hex: string;
}

interface GreetingFortuneBlock {
  omikujiLabel: string;
  omikujiTitle: string;
  luckyColorLabel: string;
  luckyColor: LuckyColorOption;
  luckyItemLabel: string;
  luckyItem: string;
}

interface GreetingFactBlock {
  line: string;
  sourceLabel: string;
  sourceUrl: string;
}

interface GreetingTextBlock {
  label: string;
  text: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

export interface DailyGreetingContent {
  mode: EntryMode;
  periodLabel: string;
  headline: string;
  fact: GreetingFactBlock | null;
  fortune: GreetingFortuneBlock | null;
  morningJinx: GreetingTextBlock | null;
  pcTip: GreetingTextBlock | null;
  closing: GreetingTextBlock | null;
}

interface OmikujiResult {
  title: string;
}

interface PcTipDefinition {
  text: string;
  source: GreetingSourceLink;
}

interface WeightedGreetingOption<T> {
  value: T;
  weight: number;
}

const omikujiResults: OmikujiResult[] = [
  { title: '大吉' },
  { title: '中吉' },
  { title: '吉' },
  { title: '小吉' },
  { title: '末吉' },
];

const weightedOmikujiResults: WeightedGreetingOption<OmikujiResult>[] = [
  { value: { title: '大吉' }, weight: 17 },
  { value: { title: '中吉' }, weight: 18 },
  { value: { title: '吉' }, weight: 35 },
  { value: { title: '末吉' }, weight: 10 },
  { value: { title: '凶' }, weight: 20 },
];

const luckyColors: LuckyColorOption[] = [
  { name: 'ミルクホワイト', hex: '#FFFDF8' },
  { name: 'パールホワイト', hex: '#F8F6F1' },
  { name: 'シェルホワイト', hex: '#F6F1EA' },
  { name: 'オフホワイト', hex: '#F7F5EF' },
  { name: 'アイボリー', hex: '#FFF8E7' },
  { name: 'クリームホワイト', hex: '#FFF5D9' },
  { name: 'ムーンホワイト', hex: '#F4F6FA' },
  { name: 'クラウドホワイト', hex: '#F2F4F7' },
  { name: 'リネンホワイト', hex: '#F3EEE6' },
  { name: 'オーツホワイト', hex: '#EEE7DD' },
  { name: 'スノーホワイト', hex: '#F8FBFF' },
  { name: 'シルバーホワイト', hex: '#EEF1F5' },
  { name: 'ボーンホワイト', hex: '#F2EADF' },
  { name: 'ミストホワイト', hex: '#F7F7F2' },
  { name: 'サンドベージュ', hex: '#D8C3A5' },
  { name: 'オートミール', hex: '#E8DDC8' },
  { name: 'ウォームグレージュ', hex: '#B7A79A' },
  { name: 'トープ', hex: '#B59B84' },
  { name: 'キャラメル', hex: '#B97A56' },
  { name: 'ココアブラウン', hex: '#7B5D4F' },
  { name: 'シナモン', hex: '#B97A57' },
  { name: 'フレッシュグリーン', hex: '#7BC47F' },
  { name: 'ペールミント', hex: '#D9F0E4' },
  { name: 'セージグリーン', hex: '#A8C3A0' },
  { name: 'セラドン', hex: '#8FB9A8' },
  { name: 'アクアミント', hex: '#8FE3CF' },
  { name: 'ボタニカルグリーン', hex: '#5F9F6F' },
  { name: 'ティールグリーン', hex: '#2F8F83' },
  { name: 'ピスタチオ', hex: '#B7D39C' },
  { name: 'モスグリーン', hex: '#6E8B74' },
  { name: 'ライムミスト', hex: '#D6F08C' },
  { name: 'メロングリーン', hex: '#9EDB8C' },
  { name: 'スカイブルー', hex: '#78B7FF' },
  { name: 'デイブルー', hex: '#5B8DEF' },
  { name: 'ミストブルー', hex: '#BFD7EA' },
  { name: 'アイスブルー', hex: '#D9ECFF' },
  { name: 'シアンブルー', hex: '#63D2FF' },
  { name: 'ネイビーミスト', hex: '#6F86A8' },
  { name: 'スモーキーブルー', hex: '#7C92B3' },
  { name: 'マリンブルー', hex: '#3D6DCC' },
  { name: 'ティールブルー', hex: '#3D8FA3' },
  { name: 'レインブルー', hex: '#91AFC8' },
  { name: 'ライラック', hex: '#C7B5E8' },
  { name: 'ラベンダー', hex: '#BFA9F0' },
  { name: 'モーブ', hex: '#B784A7' },
  { name: 'プラム', hex: '#7D5A7B' },
  { name: 'グレープ', hex: '#8466C6' },
  { name: 'ダスティパープル', hex: '#9C8DB8' },
  { name: 'アイリス', hex: '#8F86D9' },
  { name: 'オーキッド', hex: '#C98AD8' },
  { name: 'コーラルピンク', hex: '#F08AA0' },
  { name: 'ローズピンク', hex: '#E8A0BF' },
  { name: 'ピーチピンク', hex: '#F6B1A5' },
  { name: 'サーモン', hex: '#F59B8C' },
  { name: 'チェリーレッド', hex: '#D85C63' },
  { name: 'クランベリー', hex: '#A94A62' },
  { name: 'ベリーピンク', hex: '#C85D9E' },
  { name: 'アプリコットピンク', hex: '#F6C1A4' },
  { name: 'バターイエロー', hex: '#F4D96C' },
  { name: 'レモンクリーム', hex: '#FFF2A6' },
  { name: 'ハニーオレンジ', hex: '#F3A54A' },
  { name: 'アプリコット', hex: '#F6B37D' },
  { name: 'マスタード', hex: '#D7A327' },
  { name: 'ゴールドベージュ', hex: '#D9BE7A' },
  { name: 'サンライズ', hex: '#F7B267' },
  { name: 'アンバー', hex: '#D8892B' },
  { name: 'ライトグレー', hex: '#D6D9DE' },
  { name: 'クラウドグレー', hex: '#C7CCD4' },
  { name: 'スレート', hex: '#7D8796' },
  { name: 'チャコールブルー', hex: '#46556B' },
  { name: 'スモーキーネイビー', hex: '#5A667D' },
  { name: 'グラファイト', hex: '#4D545C' },
  { name: 'ミッドナイト', hex: '#2F3440' },
];

const luckyItems = [
  '書き味のいい黒ペン',
  '角が丸い付せん',
  '余白の広いメモ帳',
  'ノートPCスタンド',
  'ワイヤレスイヤホン',
  '静かなキーボード',
  '無線マウス',
  'ケーブルホルダー',
  '画面クリーナー',
  'クリアファイル',
  '折りたたみ傘',
  'タオルハンカチ',
  'リップクリーム',
  'ハンドクリーム',
  'モバイルバッテリー',
  '小さめのポーチ',
  'エコバッグ',
  '名刺入れ',
  'ミントタブレット',
  'ポケットティッシュ',
  '温かい飲みもの',
  '炭酸水',
  'コーヒー',
  'カフェラテ',
  '小さなおやつ',
  'のど飴',
  'チョコ',
  'グミ',
  'ラムネ',
  'フルーツ',
  '白いスニーカー',
  '軽いカーディガン',
  '静かな靴底',
  '腕時計',
  'ブレスレット',
  '帽子',
  'サングラス',
  'ヘアゴム',
  '薄手のストール',
  'マグカップ',
  'クッション',
  'ひざ掛け',
  '読みかけの本',
  '10分の散歩',
  'ベランダの空気',
  'よく乾いたタオル',
  'きれいな枕カバー',
  '充電100%の端末',
  '絡まないケーブル',
  'しわの少ないシャツ',
  'よく切れるはさみ',
  '開けやすい袋',
  'ぴったり閉まるジッパー',
  '音の静かなドア',
  'まっすぐ置かれた靴',
  '冷えすぎていない水',
  '手になじむスプーン',
];

const morningJinxes = [
  '朝いちで机の上を10cmだけ空けると、返信の腰が少し軽くなります。',
  '迷ったら、いちばん短いタスクから触ると流れが出やすい日です。',
  '先に保存した人から、運が静かに味方するかもしれません。',
  '最初の5分を丁寧に使うと、その後の雑音が少しだけ遠のきます。',
  '飲み物を先に用意すると、午前の気持ちが散りにくい日です。',
  'ひとつだけ先に終わらせると、二つ目の抵抗が小さくなる傾向があります。',
  '席に着いたら深呼吸を一回。気分より先に姿勢を整えると流れが出ます。',
  '朝のうちに一番軽い返信を返すと、未読の圧が少し下がります。',
  'タブを一枚閉じるだけでも、運気は案外その程度のきっかけで動きます。',
  '今日の運は、完璧さより着手の早さに乗りやすい日です。',
  'メモを一行残すと、午後の自分が少しだけ味方になります。',
  '急がなくても、順番を決めるだけで進みが整いやすい日です。',
  '朝の予定を声に出さずに一度読むと、余計な寄り道が減りやすいです。',
  'ひとまず一つ開いてみる、くらいの雑な勇気が今日は効きます。',
  '机の左側を整えると、なぜか細かい見落としが減る日があります。',
  '締切より先に保存を意識すると、気持ちの摩耗が少し和らぎます。',
  '最初の一件を片づけると、午前の空気が急にこちら側に寄ってきます。',
  'チャットを返す前に一呼吸おくと、誤字と温度差が少し減ります。',
  '今日の開運動作は、いちばん散らかった画面を一枚閉じることです。',
  '朝の判断は速さより明るさで。曇った気分の決断は昼に回して正解です。',
  '未着手の山を見上げるより、一段目に足を乗せる方が今日は強いです。',
  'すぐ終わるものを後ろに回さないと、夕方の機嫌が守られやすい日です。',
  '今朝の運は、几帳面さよりリズム感に寄っています。',
  'メモ欄を先に開いておくと、あとで思い出す労力が少なくなります。',
];

const nightClosingLines = [
  '今日はここまでで十分です。未読は明日の自分にも平等です。',
  '返信しきれなかったものより、閉じられた画面の数を今日は評価していい日です。',
  '完璧に終わらなかったとしても、雑に続けるよりずっと立派です。',
  '今日片づかなかったものは、だいたい今日だけの責任ではありません。',
  '一日分の判断をしたので、もう少し甘やかされていい時間です。',
  '詰め切れなかったことより、ここで止まれた判断をまず褒めていい日です。',
  '今日はもう、元気より回復を優先して問題ありません。',
  '画面を閉じるのも立派な進捗です。少なくとも今夜はそういうことにしましょう。',
  '積み残しはありますが、体力にも締切があります。',
  '全部を救えなくても、今日の自分をこれ以上削らないのは正解です。',
  '少し足りないまま終わる日もあります。だいたい人間はその状態で運用されています。',
  '今日の反省は三行以内で十分です。長文になるとだいたい自分に厳しすぎます。',
  '気力が切れたあとにひねり出した一手は、だいたい明日の自分が困ります。',
  '今日はこれで締めて大丈夫です。世界は意外と一晩で壊れません。',
  '残ったタスクは心配ですが、眠い頭よりは明日の頭の方がまだ交渉できます。',
  '今日の自分は、思っているより多くの小さい判断を片づけています。',
  '仕上がりが八割でも、閉じられるなら今日は上出来です。',
  '未読の圧はありますが、風呂と睡眠の方が長期的にはだいたい正しいです。',
  'やり切れなかったことがあっても、今日はちゃんと一日分使っています。',
  '今夜の最適解は、気合いではなく終了です。',
];

const windowsSource: GreetingSourceLink = {
  label: 'Microsoft Windows',
  url: 'https://support.microsoft.com/en-us/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec',
};

const clipboardSource: GreetingSourceLink = {
  label: 'Microsoft Clipboard',
  url: 'https://support.microsoft.com/en-us/windows/using-the-clipboard-30375039-ce71-9fe4-5b30-21b7aab6b13f',
};

const chromeSource: GreetingSourceLink = {
  label: 'Google Chrome',
  url: 'https://support.google.com/chrome/answer/157179?hl=ja',
};

const xlookupSource: GreetingSourceLink = {
  label: 'Microsoft Excel',
  url: 'https://support.microsoft.com/office/xlookup-function-b7fd680e-6d10-43e6-84f9-88eae8bf5929',
};

const filterSource: GreetingSourceLink = {
  label: 'Microsoft Excel',
  url: 'https://support.microsoft.com/en-us/office/filter-function-f4f7cb66-82eb-4767-8f7c-4877ad80c759',
};

const textjoinSource: GreetingSourceLink = {
  label: 'Microsoft Excel',
  url: 'https://support.microsoft.com/en-us/office/textjoin-function-357b449a-ec91-49d0-80c3-0e8fc845691c',
};

const textsplitSource: GreetingSourceLink = {
  label: 'Microsoft Excel',
  url: 'https://support.microsoft.com/en-us/office/textsplit-function-b1ca414e-4c21-4ca0-b1b7-bdecace8a6e7',
};

const autoFilterSource: GreetingSourceLink = {
  label: 'Microsoft Excel',
  url: 'https://support.microsoft.com/en-us/office/use-autofilter-to-filter-your-data-7d87d63e-ebd0-424b-8106-e2ab61133d92',
};

const pcTips: PcTipDefinition[] = [
  { text: 'Win + V でクリップボード履歴を開けます。よく使う項目は固定もできます。', source: clipboardSource },
  { text: 'Win + Shift + S で範囲を選んでスクリーンショットを撮れます。', source: windowsSource },
  { text: 'Alt + Tab で開いているアプリをすばやく切り替えられます。', source: windowsSource },
  { text: 'Win + D でデスクトップの表示と復帰を切り替えられます。', source: windowsSource },
  { text: 'Win + E でファイル エクスプローラーをすぐ開けます。', source: windowsSource },
  { text: 'Win + L で席を離れる前に PC をすぐロックできます。', source: windowsSource },
  { text: 'Ctrl + Shift + Esc でタスク マネージャーを直接開けます。', source: windowsSource },
  { text: 'Ctrl + L でブラウザのアドレスバーへすぐ移動できます。', source: chromeSource },
  { text: 'Ctrl + Shift + T で閉じたタブを復元できます。閉じすぎた朝の保険です。', source: chromeSource },
  { text: 'Ctrl + Tab で右隣のタブへ、Ctrl + Shift + Tab で左隣のタブへ移れます。', source: chromeSource },
  { text: 'Ctrl + 1 から Ctrl + 8 で、Chrome の左から順番にタブを開けます。', source: chromeSource },
  { text: 'XLOOKUP は戻り列が検索列の左側にあっても使えるのが強みです。', source: xlookupSource },
  { text: 'XLOOKUP は見つからないときの表示を [if_not_found] で直接決められます。', source: xlookupSource },
  { text: 'FILTER は条件に合う行だけを別の場所へ返せるので、抽出表づくりが軽くなります。', source: filterSource },
  { text: 'FILTER は結果が空のときの表示も指定できます。空欄やメッセージにしておくと親切です。', source: filterSource },
  { text: 'TEXTJOIN は空白セルを無視しながら文字列をつなげられます。', source: textjoinSource },
  { text: 'TEXTJOIN は区切り文字を一か所で指定できるので、住所や氏名の結合に向いています。', source: textjoinSource },
  { text: 'TEXTSPLIT は区切り文字でセル内の文字列を横や縦へ分解できます。', source: textsplitSource },
  { text: 'TEXTSPLIT は TEXTJOIN の逆向きに考えると覚えやすい関数です。', source: textsplitSource },
  { text: 'Excel のオートフィルターは、列ごとに検索しながら絞り込みできます。', source: autoFilterSource },
  { text: 'オートフィルターは一覧全体を隠すのではなく、条件に合わない行だけを一時的に隠します。', source: autoFilterSource },
];

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pickBySeed<T>(items: T[], seed: number) {
  return items[seed % items.length];
}

function pickWeightedBySeed<T>(items: WeightedGreetingOption<T>[], seed: number) {
  const totalWeight = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) {
    return items[0]?.value;
  }

  let cursor = seed % totalWeight;
  for (const item of items) {
    cursor -= Math.max(0, item.weight);
    if (cursor < 0) {
      return item.value;
    }
  }

  return items[items.length - 1]?.value;
}

function formatGreetingName(userName: string) {
  const normalizedUserName = userName.trim();
  return normalizedUserName ? `${normalizedUserName}さん` : '';
}

function formatFactHeadline(title?: string | null) {
  const normalizedTitle = title?.trim() ?? '';
  if (!normalizedTitle) {
    return '';
  }

  return `今日は${normalizedTitle}です。`;
}

function formatMonthDay(date: string) {
  const [year, month, day] = date.split('-').map((value) => Number(value));
  if (!year || !month || !day) {
    return '今日';
  }

  return `${month}月${day}日`;
}

export function buildDailyGreeting(params: {
  date: string;
  mode: EntryMode;
  userId?: string;
  userName: string;
  fact?: ServerTodayFact | null;
}): DailyGreetingContent {
  const { date, mode, userId, userName, fact } = params;
  const greetingName = formatGreetingName(userName);
  const greetingSeedKey = `${date}:${(userId ?? '').trim() || userName.trim() || 'guest'}`;
  const omikuji =
    pickWeightedBySeed(weightedOmikujiResults, hashString(`${greetingSeedKey}:${mode}:omikuji`)) ??
    pickBySeed(omikujiResults, hashString(`${greetingSeedKey}:${mode}:omikuji`));
  const luckyColor = pickBySeed(luckyColors, hashString(`${greetingSeedKey}:${mode}:color`));
  const luckyItem = pickBySeed(luckyItems, hashString(`${greetingSeedKey}:${mode}:item`));
  const morningJinx = pickBySeed(morningJinxes, hashString(`${greetingSeedKey}:jinx`));
  const pcTip = pickBySeed(pcTips, hashString(`${greetingSeedKey}:pc-tip`));
  const closingText = pickBySeed(nightClosingLines, hashString(`${greetingSeedKey}:${mode}:closing`));
  const factHeadline = formatFactHeadline(fact?.title);
  const morningHeadline = `${greetingName ? `${greetingName}、` : ''}おはようございます。`;
  const nightHeadline = `${greetingName ? `${greetingName}、` : ''}おつかれさまです。`;

  return {
    mode,
    periodLabel: mode === 'plan' ? '朝のごあいさつ' : '夜のごあいさつ',
    headline: mode === 'plan' ? morningHeadline : nightHeadline,
    fact:
      mode === 'plan'
        ? {
            line: factHeadline || `今日は${formatMonthDay(date)}です。`,
            sourceLabel: fact?.sourceLabel ?? '',
            sourceUrl: fact?.sourceUrl ?? '',
          }
        : null,
    fortune:
      mode === 'plan'
        ? {
            omikujiLabel: 'おみくじ',
            omikujiTitle: omikuji.title,
            luckyColorLabel: 'ラッキーカラー',
            luckyColor,
            luckyItemLabel: 'ラッキーアイテム',
            luckyItem,
          }
        : null,
    morningJinx:
      mode === 'plan'
        ? {
            label: '今日のジンクス',
            text: morningJinx,
          }
        : null,
    pcTip:
      mode === 'plan'
        ? {
            label: 'PC豆知識',
            text: pcTip.text,
            sourceLabel: pcTip.source.label,
            sourceUrl: pcTip.source.url,
          }
        : null,
    closing:
      mode === 'plan'
        ? null
        : {
            label: '今夜のひとこと',
            text: closingText,
          },
  };
}
