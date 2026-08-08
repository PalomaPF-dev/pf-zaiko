#!/usr/bin/env python3
"""資材W/F の品目マスタ（Excel）から src/data/item-master.json を生成する。

資材ワークフロー（W/F）の品目マスタは「品目コード × 仕入先 × 有効期間」の1行＝1改訂で
出力される（単価改訂のたびに行が増える）。在庫アプリ側で必要なのは
「いま有効な品目 1件＝1行」なので、ここで品目コード単位に畳んでから JSON 化する。

使い方:
    pip install openpyxl
    python3 scripts/build-item-master.py 品目マスタ_20260807.xlsx

    # 基準日（この日に有効な改訂を採用）は既定でファイル名末尾の8桁。明示も可能:
    python3 scripts/build-item-master.py 品目マスタ.xlsx --snapshot 20260807

畳み込みのルール:
  * 有効区分='0'（有効）の行だけを対象にする。1件も無ければその品目は「無効」扱い。
  * 基準日が有効期間内の行を「現行」とし、その中で有効開始日が最も新しい行を代表にする
    （同日複数なら 納入単価が高い順→外注コード順。再実行しても同じ結果になるよう完全に決定的）。
  * 代表以外の現行行の外注名は「併用仕入先」としてまとめて持つ（複数購買の品目があるため）。
  * 現行行が無い品目は、最後に有効だった行を代表にして active=false とする。
"""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import sys

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("openpyxl が必要です:  pip install openpyxl")

# 出力 JSON の列順（src/lib/itemMaster.ts の ITEM_MASTER_COLUMNS と一致させること）
COLUMNS = [
    "code",          # 品目コード（図番9桁 = 図番1+図番2+図番3）
    "name",          # 部品名
    "supplierCode",  # 外注コード（代表）
    "supplierName",  # 外注名（代表）
    "altSuppliers",  # 併用仕入先（代表以外。／区切り）
    "unitCode",      # 単位（W/Fの単位コード）
    "packQty",       # 入数
    "packUnitCode",  # 入数単位（W/Fの単位コード）
    "lotQty",        # ロット数
    "roundQty",      # まるめ
    "container",     # 容器
    "accountCode",   # 受入科目
    "unitPrice",     # 納入単価
    "validFrom",     # 有効開始日（YYYYMMDD）
    "validTo",       # 有効終了日（YYYYMMDD）
    "active",        # 基準日時点で有効か（1/0）
]

# Excel 側の列見出し（資材W/F の出力そのまま）
SRC = {
    "code": "図番",
    "name": "部品名",
    "supplierCode": "外注コード",
    "supplierName": "外注名",
    "validFrom": "有効開始日",
    "validTo": "有効終了日",
    "validKind": "有効区分",
    "unitPrice": "納入単価",
    "accountCode": "受入科目",
    "unitCode": "単位",
    "packQty": "入数",
    "packUnitCode": "入数単位",
    "lotQty": "ロット数",
    "roundQty": "まるめ",
    "container": "容器",
}


def cell(row, index, key: str) -> str:
    """空欄・文字列 'NULL' をすべて空文字に正規化して取り出す。"""
    value = row[index[SRC[key]]]
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text == "NULL" else text


def number(row, index, key: str) -> str:
    """'25.00' のような数値文字列を '25' に詰める（JSON を小さくするため）。"""
    text = cell(row, index, key)
    if text == "":
        return ""
    try:
        value = float(text)
    except ValueError:
        return ""
    return str(int(value)) if value == int(value) else str(value)


def build(path: pathlib.Path, snapshot: str) -> dict:
    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = book.worksheets[0]
    rows = list(sheet.iter_rows(values_only=True))
    header, body = rows[0], rows[1:]
    index = {name: i for i, name in enumerate(header)}
    missing = [j for j in SRC.values() if j not in index]
    if missing:
        sys.exit(f"想定の列が見つかりません: {'、'.join(missing)}")

    by_code: dict[str, list] = collections.defaultdict(list)
    for row in body:
        code = cell(row, index, "code")
        if code:
            by_code[code].append(row)

    def price(row) -> float:
        try:
            return float(cell(row, index, "unitPrice") or 0)
        except ValueError:
            return 0.0

    items = []
    for code in sorted(by_code):
        revisions = by_code[code]
        valid = [r for r in revisions if cell(r, index, "validKind") == "0"]
        current = [
            r
            for r in valid
            if cell(r, index, "validFrom") <= snapshot <= cell(r, index, "validTo")
        ]
        if current:
            pool, active = current, 1
        else:
            # 有効な改訂が無い（＝廃止済み）。最後に有効だった行だけを残す。
            fallback = valid or revisions
            pool = sorted(
                fallback,
                key=lambda r: (cell(r, index, "validTo"), cell(r, index, "validFrom")),
            )[-1:]
            active = 0
        primary = sorted(
            pool,
            key=lambda r: (
                cell(r, index, "validFrom"),
                price(r),
                cell(r, index, "supplierCode"),
            ),
        )[-1]

        name = cell(primary, index, "name")
        if not name:  # 代表行の部品名が空なら、直近で名前のある改訂から借りる
            for row in sorted(
                revisions, key=lambda r: cell(r, index, "validFrom"), reverse=True
            ):
                name = cell(row, index, "name")
                if name:
                    break

        primary_supplier = cell(primary, index, "supplierName")
        alternates = [
            s
            for s in dict.fromkeys(cell(r, index, "supplierName") for r in pool)
            if s and s != primary_supplier
        ]

        items.append(
            [
                code,
                name,
                cell(primary, index, "supplierCode"),
                primary_supplier,
                "／".join(alternates),
                cell(primary, index, "unitCode"),
                number(primary, index, "packQty"),
                cell(primary, index, "packUnitCode"),
                number(primary, index, "lotQty"),
                number(primary, index, "roundQty"),
                cell(primary, index, "container"),
                cell(primary, index, "accountCode"),
                number(primary, index, "unitPrice"),
                cell(primary, index, "validFrom"),
                cell(primary, index, "validTo"),
                str(active),
            ]
        )

    return {
        "version": snapshot,
        "source": "資材W/F 品目マスタ",
        "sourceRows": len(body),
        "columns": COLUMNS,
        "items": items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx", type=pathlib.Path, help="資材W/F からエクスポートした品目マスタ")
    parser.add_argument("--snapshot", help="基準日 YYYYMMDD（既定: ファイル名末尾の8桁）")
    parser.add_argument(
        "--out",
        type=pathlib.Path,
        default=pathlib.Path(__file__).resolve().parent.parent / "src/data/item-master.json",
    )
    args = parser.parse_args()

    snapshot = args.snapshot
    if not snapshot:
        found = re.findall(r"(20\d{6})", args.xlsx.name)
        if not found:
            sys.exit("基準日を判別できません。--snapshot 20260807 のように指定してください。")
        snapshot = found[-1]
    if not re.fullmatch(r"20\d{6}", snapshot):
        sys.exit("--snapshot は YYYYMMDD 形式で指定してください。")

    data = build(args.xlsx, snapshot)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    # 版と件数だけの小さな JSON を別に出す。アプリはこちらを常時読み、
    # 1MB 近い本体は取込のときだけ動的 import する（各ルートの初期ロードを軽く保つ）。
    meta = {"version": data["version"], "count": len(data["items"]), "source": data["source"]}
    (args.out.parent / "item-master-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    # 1品目1行。差分レビューできる形で書く。
    lines = [
        "{",
        f'  "version": {json.dumps(data["version"])},',
        f'  "source": {json.dumps(data["source"], ensure_ascii=False)},',
        f'  "sourceRows": {data["sourceRows"]},',
        f'  "columns": {json.dumps(data["columns"])},',
        '  "items": [',
    ]
    body = [
        "    " + json.dumps(item, ensure_ascii=False, separators=(",", ""))
        for item in data["items"]
    ]
    lines.append(",\n".join(body))
    lines += ["  ]", "}", ""]
    args.out.write_text("\n".join(lines), encoding="utf-8")

    active = sum(1 for i in data["items"] if i[-1] == "1")
    print(
        f"{args.out}: {len(data['items'])}品目（有効 {active} / 無効 {len(data['items']) - active}）"
        f" ← {data['sourceRows']}行, 基準日 {snapshot}"
    )


if __name__ == "__main__":
    main()
