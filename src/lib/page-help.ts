import sharedHelpImage from '../assets/help/help-shared-controls.svg';
import dailyHelpImage from '../assets/help/help-daily-board.svg';
import monthlyHelpImage from '../assets/help/help-monthly-summary.svg';
import dayListHelpImage from '../assets/help/help-day-list.svg';
import projectMasterHelpImage from '../assets/help/help-project-master.svg';

export type HelpView = 'shared' | 'daily' | 'monthly' | 'day-list' | 'project-master';

export interface HelpCallout {
  number: number;
  title: string;
  description: string;
}

export interface HelpTopic {
  view: HelpView;
  tabLabel: string;
  title: string;
  summary: string;
  imageSrc: string;
  imageAlt: string;
  callouts: HelpCallout[];
  extraSection?: {
    title: string;
    items: string[];
  };
  tip: string;
}

export const helpViewOrder: HelpView[] = ['shared', 'daily', 'monthly', 'day-list', 'project-master'];

export const helpTopicsByView: Record<HelpView, HelpTopic> = {
  shared: {
    view: 'shared',
    tabLabel: '共通設定',
    title: '右上の共通ボタン',
    summary:
      'どの画面からでも使える共通ボタンです。見た目の調整、利用者の切替、Excelバックアップ、ヘルプの呼び出しをここから行います。',
    imageSrc: sharedHelpImage,
    imageAlt: '右上の共通ボタンを示す簡略図',
    callouts: [
      {
        number: 1,
        title: '表示設定',
        description:
          'テーマ、表示密度、メール作成方式、おまけ機能の表示を切り替えます。同じ browser でも利用者ごとに保存されます。',
      },
      {
        number: 2,
        title: '利用者',
        description:
          '利用者の userId と表示名、メールの To / CC を確認・更新します。ここで切り替えると保存先の名前空間も変わります。',
      },
      {
        number: 3,
        title: 'ヘルプ',
        description:
          'いま見ている画面に対応するヘルプを開きます。分からなくなったらここに戻れば、役割と操作の流れを確認できます。',
      },
      {
        number: 4,
        title: 'Excelエクスポート',
        description:
          '表示中の月を対象に、日入力一覧・月集計・PJマスタ一覧を 1 つの Excel バックアップとして出力します。',
      },
    ],
    extraSection: {
      title: 'アプリ化のコツ',
      items: [
        'Microsoft Edge で公開 URL を開き、右上の「…」→「アプリ」→「このサイトをアプリとしてインストール」を選びます。アドレスバーにインストールアイコンが見えないときも、この手順で入れられます。',
        'インストール後は edge://apps からこのアプリの「…」→「Auto-start on device login」を有効にすると、Windows サインイン後の立ち上げが楽になります。',
        'Edge はショートカットの初回起動時だけウィンドウサイズが小さめになることがあります。一度使いやすい大きさに広げると、次回以降はそのサイズが引き継がれることがあります。',
        'Chrome でもアプリ化できますが、初回のウィンドウサイズや配置は Edge と少し違って見えることがあります。',
      ],
    },
    tip: 'まずは表示設定と利用者を整えてから使い始めると、他の画面で迷いにくくなります。日常的に使うなら、アプリ化して独立ウィンドウで開く運用がおすすめです。',
  },
  daily: {
    view: 'daily',
    tabLabel: '日入力',
    title: '日入力画面の使い方',
    summary:
      'その日の勤務情報と PJ ごとの予定・実績を整える画面です。最初に日入力バーで一日の枠を決めてから、入力ボードと明細編集で内容を埋めていきます。',
    imageSrc: dailyHelpImage,
    imageAlt: '日入力画面の構成を示す簡略図',
    callouts: [
      {
        number: 1,
        title: '日付と当日操作',
        description:
          '対象日を切り替え、予定 / 実績のモードやメール作成、挨拶表示の呼び出しを行います。まずここで今日の作業対象日を合わせます。',
      },
      {
        number: 2,
        title: '日入力バー',
        description:
          '開始・終了やモード切替、前日コピーなど、一日の土台を整える操作をまとめたエリアです。勤務時間を先に合わせると、その後の配賦が楽になります。',
      },
      {
        number: 3,
        title: '入力ボード',
        description:
          'PJ 明細と年休 / 分断を一覧で確認するエリアです。空行を追加しながら PJ、タスク、時間を埋めて、右端の確認表示で不足入力を見つけます。',
      },
      {
        number: 4,
        title: '明細編集',
        description:
          '選択中の行を詳しく調整するエリアです。場所、時間数、時間帯、コメントをここで整えると、入力ボード側の表示にもすぐ反映されます。',
      },
    ],
    tip: '開始と終了を先にそろえ、次に入力ボードで配賦、最後に明細編集で細部を整える流れにすると迷いにくくなります。',
  },
  monthly: {
    view: 'monthly',
    tabLabel: '月集計',
    title: '月集計画面の使い方',
    summary:
      '今月の計画、実績、着地見込みを確認する画面です。主役は PJ 別サマリで、必要な PJ を選んでその月の計画値だけを調整します。',
    imageSrc: monthlyHelpImage,
    imageAlt: '月集計画面の構成を示す簡略図',
    callouts: [
      {
        number: 1,
        title: '月次サマリー',
        description:
          '計画合計、実績合計、着地見込み、差分を月単位で見ます。全体の進み具合を先に見てから、下の PJ 別サマリへ進むと状況が掴みやすいです。',
      },
      {
        number: 2,
        title: 'PJ別サマリ',
        description:
          'PJ ごとの計画、実績、着地、差分を一覧で確認します。調整したい PJ を選ぶ入口で、月集計の主役になるエリアです。',
      },
      {
        number: 3,
        title: '今月の計画',
        description:
          '選択中 PJ の今月計画だけを調整します。PJ 名や区分のような固定属性はここでは変えず、必要なら PJマスタで更新します。',
      },
      {
        number: 4,
        title: '関連する日と導線',
        description:
          'その PJ に実績が入った日を確認し、必要なら日一覧へ移って日ごとの中身を見ます。月次の違和感を日次へ掘るための導線です。',
      },
    ],
    tip: '月集計では気になる PJ を選んで計画値だけ直し、日ごとの理由確認は日一覧へ回すと役割がぶれません。',
  },
  'day-list': {
    view: 'day-list',
    tabLabel: '日一覧',
    title: '日一覧画面の使い方',
    summary:
      'ひと月の中で、どの日にどんな入力があったかを日別に見返す画面です。月集計で気になった PJ の実績日を追うときにも使います。',
    imageSrc: dayListHelpImage,
    imageAlt: '日一覧画面の構成を示す簡略図',
    callouts: [
      {
        number: 1,
        title: '月と対象 PJ',
        description:
          '表示中の月と、必要に応じて絞り込んだ PJ を確認します。月集計から開いた場合は、選択していた PJ の文脈を保ったまま入れます。',
      },
      {
        number: 2,
        title: '日別サマリー',
        description:
          '日付ごとの勤務時間、PJ 時間、差分を横断で見ます。入力漏れや偏りがある日を先に見つけると、下の一覧確認が早くなります。',
      },
      {
        number: 3,
        title: '一覧テーブル',
        description:
          'その日の開始・終了、PJ、タスク、コメントの有無を表で確認します。必要な日だけ拾って日入力へ戻るための確認用テーブルです。',
      },
      {
        number: 4,
        title: '日入力へ戻る',
        description:
          '気になる日を見つけたら日入力へ戻って修正します。日一覧は確認に徹し、編集は日入力で行うのが基本です。',
      },
    ],
    tip: '月集計で違和感のあった PJ を絞ってから日一覧へ来ると、見るべき日がかなり減ります。',
  },
  'project-master': {
    view: 'project-master',
    tabLabel: 'PJマスタ',
    title: 'PJマスタ画面の使い方',
    summary:
      'PJ の固定属性を整える画面です。PJ コード、PJ 名、区分、有効状態、コメント要否、代表作業候補などをここで管理します。',
    imageSrc: projectMasterHelpImage,
    imageAlt: 'PJマスタ画面の構成を示す簡略図',
    callouts: [
      {
        number: 1,
        title: '検索と新規追加',
        description:
          'PJ 一覧を絞り込んだり、新しい PJ を追加したりする入口です。既存 PJ を探してから編集する流れにすると重複作成を防げます。',
      },
      {
        number: 2,
        title: 'PJ一覧',
        description:
          '登録済み PJ を一覧で確認するエリアです。ピン留めや有効状態の確認もここで行い、編集したい PJ を選びます。',
      },
      {
        number: 3,
        title: 'PJ詳細編集',
        description:
          '選択中 PJ の固定属性を編集するフォームです。代表作業候補やコメント要否など、日入力で使う前提情報をここで整えます。',
      },
      {
        number: 4,
        title: '保存と初期化',
        description:
          '保存ボタンで反映し、必要なら入力内容を初期化します。月次計画の調整は月集計で行い、ここでは固定属性に集中します。',
      },
    ],
    tip: '月集計で気になった PJ をここで開き、固定属性だけ整えてから月集計へ戻ると役割が混ざりません。',
  },
};
