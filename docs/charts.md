# これは、ゲームをプレイするために必要なノーツ情報や音楽のオフセットなどが記載される譜面ファイルの仕様を説明するものです。

## 譜面ファイルの場所について
譜面ファイルは、
Charts/```楽曲名```/```難易度```.usc
譜面ファイルに付随する音源ファイルは
Charts/```楽曲名```/```楽曲名```.mp3
というディレクトリに保管されています。

## 譜面ファイルの仕様

譜面ファイルは、json形式で記述され、以下の構造で構成されています。

```

```json
{
  "usc": {
    "offset": <number>,          // 音源のオフセット（ミリ秒）
    "objects": [                // ノーツや制御データのリスト
      {
        /* 各種オブジェクトが並ぶ */
      }
    ]
  },
  "version": <number>          // フォーマットバージョン
}
```

### 共通フィールド

以下はデモファイル（Charts/demo.json ～ demo_5.json）から確認できる共通キーと意味です。

- `type` – オブジェクトの種類。例: `bpm`, `timeScaleGroup`, `single`, `damage`, `guide`, `slide` など。
- `beat` – 小節位置。0 始まりで、曲の進行に応じたタイミングを示す。
- `bpm` – BPM 変更時にのみ存在し、指定位置からのテンポを表す。
- `offset` – 曲の開始オフセット (秒)。`usc` オブジェクト直下にある。
- `lane` – 横方向座標。負値は左、正値は右、3レーン幅で扱う。
- `size` – ノーツの幅・高さ。通常 1.5 など。
- `timeScaleGroup` – ルールセットとして定義した `timeScaleGroup` のインデックス。
- `trace` – 連続判定フラグ。スライド線上のノーツなど。
- `critical` – クリティカル判定フラグ。
- `direction` – ノーツの向き (`up` など)。主にスライド方向で使用。

### オブジェクト別フィールド

#### bpm

- `beat` – 変更が適用される小節位置。
- `bpm` – 新しいテンポ値。

#### timeScaleGroup

- `changes` – 配列。各エントリに `beat` と `timeScale` を持ち、レーンスピードを指定。
  - `beat` – 変更発生小節。
  - `timeScale` – 倍率（1.0 が等倍）。

#### single (単打)

- `beat` – 発生小節。
- `lane` – レーン座標。横方向の位置を数値で表現。
- `size` – ノーツの大きさ。
- `timeScaleGroup` – 利用される `timeScaleGroup` のインデックス。
- `trace` – トレースの判定かどうか。
- `critical` – クリティカル判定対象か。
- `direction` – 指定されている場合はタップの後に離す必要がある。

#### damage (ダメージノーツ)

- `beat` / `lane` / `size` / `timeScaleGroup` – single と同様。

#### guide (ガイドライン)

- `color` – 線色 (`green` など)。
- `fade` – 表示フェード `in`/`out`。
- `midpoints` – 曲線を構成する中間点の配列。各要素は `beat`、`lane`、`size`、`timeScaleGroup`、`ease`（補間タイプ）。後述するスライドに似た構造。

#### slide (スライド)

- `connections` – スライドを構成する各節の配列。要素は以下を含む。
  - `type` – `start`/`tick`/`attach`/`end` など。
    - `start` – スライド開始点。
    - `tick` – スライドの途中に配置されるノーツ。
    - `attach` – スライドの途中に配置されるノーツで、中継の位置が常にスライドの中心に固定される。
    - `end` – スライドの終点。
  - `beat`, `lane`, `size`, `timeScaleGroup` – 基本位置情報。single と同様。
  - `critical` – クリティカル対象。
  - `ease` – 中継点間の補間方式 (`linear` 等)。
  - `judgeType` – 判定タイプ (`normal` 等)。
- `critical` – スライド全体へのクリティカル属性。

## デモファイルの解説

プロジェクト初期段階で用意される `demo.json` 系列は、ゲーム内レーン幅やノーツ配置の試作用です。以下に各バージョンの変更点と、関連するキーの挙動を示します。

### 共通事項

- すべてのデモは **左端から幅3レーン** で記述された配置を基準とする。各 `lane` 値がこの座標系で変化する。
- レーンスピードや拍の変更は `timeScaleGroup` オブジェクトで表現され、対象オブジェクトは `timeScaleGroup` インデックスを参照する。
- クリティカルノーツは `critical: true` を付与。
- スライド／ロングノーツは `connections` 配列で節ごとに定義し、`ease` プロパティで移動の線形・加速・減速を制御する。

### demo.json

最も基本的なテンプレート。レーンスピード固定、すべてのノーツは左端に記述される。

```json
{ /* 先ほど示したベース例を参照 */ }
```

### demo1.json

`demo.json` に対して**途中でレーンスピード（timeScale）を 2 倍に変更**を加えた版。`timeScaleGroup` 配列の値のみが変化することで表現。例：

```json
{
  "type": "timeScaleGroup",
  "changes": [
    { "beat": 0.0, "timeScale": 1.0 },
    { "beat": 11.0, "timeScale": 2.0 }  // ここで速度が切り替わる
  ]
}
```

### demo2.json

さらに **クリティカルノーツを最右レーンに移動** したバージョン。`lane` が負から正の最大値へ変化し、`critical: true` を維持。

```json
{
  "beat": 5.0,
  "lane": 4.5,          // 右端レーンに配置
  "critical": true,
  "type": "single"
}
```

### demo3.json

スライドノーツの経路を大幅拡張したもの。

1. 左端の開始位置から **左から2レーン目の幅3レーン中継点** へ直線移動。
2. そこから **左から4レーン、幅3レーンの不可視中継点** へ直線。
3. さらに「レーンにかかわらずロングノーツ中央に中継点が配置される」仕様のノーツを経由。
4. 最終的に **最右レーン幅3レーンの終点** に接続。

以下は接続節の一部例。

```json
{
  "connections": [
    { "type": "start", "beat": 1.0, "lane": -4.5, "ease": "linear" },
    { "type": "tick",  "beat": 1.5, "lane": -2.5, "ease": "linear" },
    { "type": "tick",  "beat": 2.0, "lane": -0.5, "ease": "linear" },
    { "type": "attach", "beat": 2.5, "lane": -4.5, "ease": "linear" },
    { "type": "end",   "beat": 3.0, "lane": 3.5,  "ease": "linear" }
  ],
  "type": "slide",
  "critical": false
}
```

> **ヒント:** 中継点を変えれば、ロングノーツがどう動くかを推論できる。

### demo4.json

`demo3.json` から **中央配置（ノーツに依らず中央置き）を削除**。
`connections` 配列から該当エントリが取り除かれている。

### demo5.json

`demo4.json` のスライド移動に **非線形補間（加速/減速）** を追加したもの。`connections` 内 `ease` が `in`、`out`、`linear` など複数に分かれており、移動挙動を制御する。

```json
{
  "type": "tick",
  "beat": 1.5,
  "lane": -2.5,
  "ease": "out"   // 減速
},
{
  "type": "start",
  "beat": 1.0,
  "lane": -4.5,
  "ease": "in"    // 加速
}
```

> **コード生成ヒント:** `ease` の値を変更するだけで移動曲線が変わること、`lane` の値を調整すればレーン間移動が表現できることを推論して自動生成できる。