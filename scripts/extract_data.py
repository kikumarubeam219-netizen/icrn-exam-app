"""
集中治療認証看護師 過去問データ抽出・統合スクリプト（完全修正版）
・全280問（2022年〜2025年 各70問）のテキスト・選択肢・正解・解説・画像を完璧に抽出・統合
・康煕部首の通常文字化（NFKC正規化）
・問題図・波形・画像の完全抽出と紐付け
・特殊問題（2024年問13の記号補正、2025年問34の選択肢補正、2022年採点対象外5問の対応）
"""
import os
import re
import sys
import glob
import json
import unicodedata
import fitz  # PyMuPDF
import openpyxl

def get_excel_path():
    matches = glob.glob(os.path.join(r"C:\Users\l0905\Downloads", "*2022-2025*.xlsx"))
    if matches:
        return matches[0]
    raise FileNotFoundError("Excel file for 2022-2025 not found in Downloads")

def get_pdf_dir():
    d = r"C:\Users\l0905\OneDrive\デスクトップ\集中治療認証看護師試験問題と解答"
    if os.path.exists(d):
        return d
    for root, dirs, files in os.walk(r"C:\Users\l0905\OneDrive\デスクトップ"):
        if "集中" in root and "問題" in root:
            return root
    raise FileNotFoundError("PDF directory not found")

OUTPUT_DIR = r"C:\Users\l0905\.gemini\antigravity\scratch\icrn-exam-app\data"
IMG_OUTPUT_DIR = os.path.join(OUTPUT_DIR, "images")
os.makedirs(IMG_OUTPUT_DIR, exist_ok=True)

def clean_text(text):
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u3000", " ").replace("\t", " ")
    text = re.sub(r"[ ]{2,}", " ", text)
    return text.strip()

# 各年度の画像所属マッピング (year -> {q_num: [(page_no_0based, img_index_or_xref)]})
IMAGE_MAPPING = {
    2022: {
        2: [(0, 0)],
        34: [(4, 0)],
        37: [(5, 0)],
        52: [(7, 0)],
    },
    2023: {
        4: [(1, 1)],  # page 2: img 1 is Q4
        8: [(1, 0)],  # page 2: img 0 is Q8
        11: [(2, 0)], # page 3
        51: [(7, 0)], # page 8
        56: [(8, 0)], # page 9
        58: [(8, 1)], # page 9
        63: [(9, 0)], # page 10
        64: [(9, 1), (9, 2), (9, 3)], # page 10: 3 images
    },
    2024: {
        2: [(1, 0), (1, 1), (1, 2)], # page 2: 3 graphics
        5: [(3, 0)],                 # page 4: ECG
        24: [(10, 0)],               # page 11: drain schematic
        36: [(15, 0)],               # page 16: ventilator graphic
        49: [(20, 0)],               # page 21: ECG
        54: [(23, 0)],               # page 24: ventilator graphic
        63: [(27, 0)],               # page 28: EtCO2 waveform
    },
    2025: {
        64: [(27, 0)],               # page 28: CT image
    }
}

def extract_and_save_images(doc, year):
    """PDFから指定された画像を抽出し、{q_num: [image_paths]} を返す"""
    mapping = IMAGE_MAPPING.get(year, {})
    q_to_images = {}
    for q_num, img_list in mapping.items():
        q_to_images[q_num] = []
        for idx, (pno, img_idx) in enumerate(img_list):
            page = doc[pno]
            imgs = page.get_images()
            if img_idx < len(imgs):
                xref = imgs[img_idx][0]
                img_name = f"{year}_q{q_num}_{idx+1}.png"
                img_path = os.path.join(IMG_OUTPUT_DIR, img_name)
                try:
                    pix = fitz.Pixmap(doc, xref)
                    if pix.colorspace.name not in ("DeviceRGB", "DeviceGray") or pix.n >= 5:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    pix.save(img_path)
                    q_to_images[q_num].append(f"data/images/{img_name}")
                    print(f"  Saved image: {img_name}")
                except Exception as e:
                    # fallback using Pillow if PyMuPDF conversion fails
                    try:
                        pix = fitz.Pixmap(doc, xref)
                        img_data = pix.tobytes("png")
                        with open(img_path, "wb") as fimg:
                            fimg.write(img_data)
                        q_to_images[q_num].append(f"data/images/{img_name}")
                        print(f"  Saved image via fallback: {img_name}")
                    except Exception as e2:
                        print(f"  Error extracting image {img_name}: {e} / {e2}")
    return q_to_images

def load_excel_data():
    excel_path = get_excel_path()
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    results = {}
    for sheet in wb.sheetnames:
        m = re.search(r"(\d{4})", sheet)
        if not m:
            continue
        year = int(m.group(1))
        ws = wb[sheet]
        rows = list(ws.iter_rows(values_only=True))
        year_dict = {}
        for row in rows[1:]:
            if not row or row[0] is None:
                continue
            try:
                q_num = int(row[0])
            except ValueError:
                continue
            ans_raw = str(row[1]).strip() if row[1] is not None else ""
            exp_raw = str(row[2]).strip() if row[2] is not None else ""
            
            ans_clean = clean_text(ans_raw)
            if "採点対象外" in ans_clean:
                correct_keys = []
            else:
                keys = re.findall(r"[a-eA-E]", ans_clean)
                correct_keys = []
                for k in keys:
                    kl = k.lower()
                    if kl not in correct_keys:
                        correct_keys.append(kl)
            
            year_dict[q_num] = {
                "answer_raw": ans_raw,
                "correct_keys": correct_keys,
                "explanation": clean_text(exp_raw)
            }
        results[year] = year_dict
    return results

def extract_pdf_data(year, excel_year_data):
    pdf_dir = get_pdf_dir()
    pdf_path = os.path.join(pdf_dir, f"{year} Q.pdf")
    if not os.path.exists(pdf_path):
        return []

    doc = fitz.open(pdf_path)
    q_images_map = extract_and_save_images(doc, year)

    # ブロック収集
    ordered_blocks = []
    for pno, page in enumerate(doc):
        blocks = page.get_text("blocks")
        if year in [2022, 2023]:
            left = [b for b in blocks if b[0] < 300]
            right = [b for b in blocks if b[0] >= 300]
            left.sort(key=lambda b: b[1])
            right.sort(key=lambda b: b[1])
            col_blocks = left + right
        else:
            col_blocks = sorted(blocks, key=lambda b: b[1])

        for b in col_blocks:
            txt = clean_text(b[4])
            if txt.startswith("－") and txt.endswith("－"):
                continue
            if "集中治療認証看護師試験問題" in txt and len(txt) < 35:
                continue
            ordered_blocks.append(txt)

    full_text = "\n".join(ordered_blocks)

    # 問題番号のマッチ
    q_matches = list(re.finditer(r"(?:^|\n)\s*(\d{1,2})[）\)]", full_text))
    unique_matches = []
    seen_q = set()
    for m in q_matches:
        qn = int(m.group(1))
        if 1 <= qn <= 70 and qn not in seen_q:
            seen_q.add(qn)
            unique_matches.append((qn, m.start(0), m.end(0)))

    unique_matches.sort(key=lambda x: x[0])

    questions = []
    for i, (q_num, start_idx, end_idx) in enumerate(unique_matches):
        next_start = unique_matches[i+1][1] if i + 1 < len(unique_matches) else len(full_text)
        q_raw_text = full_text[start_idx:next_start].strip()

        # 先頭の番号（例: '1）'）を除去
        q_clean = re.sub(r"^\s*\d{1,2}[）\)]\s*", "", q_raw_text).strip()

        question_body = ""
        options = []

        # 特殊処理: 2024年問13（PDFで選択肢記号a-dが脱落している）
        if year == 2024 and q_num == 13:
            question_body = "重症患者の関節可動域練習について正しいのはどれか。2 つ選びなさい。"
            options = [
                {"key": "a", "text": "股関節に屈曲制限があると端座位が困難となる"},
                {"key": "b", "text": "足関節に背屈制限があると立位が困難となる"},
                {"key": "c", "text": "関節可動域練習では各関節を素早く動かす"},
                {"key": "d", "text": "離床練習の開始以降に間接可動域練習は不要である"}
            ]
        # 特殊処理: 2025年問34（末尾に回路図テキスト「A 透析液...」が混入）
        elif year == 2025 and q_num == 34:
            question_body = "72 歳の男性。敗血症性急性腎障害に対し，右内頸静脈カテーテルからcontinuous renal replacement therapy（CRRT）が行われている。CRRT 開始4 時間後に圧モニタA・B に上昇警報が発生した。圧モニタA・B の位置を図に示す。原因として考えられるのはどれか。"
            options = [
                {"key": "a", "text": "脱血不良"},
                {"key": "b", "text": "脱血チャンバの目詰まり"},
                {"key": "c", "text": "透析膜の目詰まり"},
                {"key": "d", "text": "返血側カテーテルの閉塞"}
            ]
        else:
            opt_matches = list(re.finditer(r"(?:^|\n)\s*([a-eA-E])[\.．\s]\s*", q_clean))
            if opt_matches:
                question_body = q_clean[:opt_matches[0].start()].strip()
                for oi, om in enumerate(opt_matches):
                    opt_key = om.group(1).lower()
                    opt_start = om.end()
                    opt_end = opt_matches[oi+1].start() if oi + 1 < len(opt_matches) else len(q_clean)
                    opt_val = q_clean[opt_start:opt_end].strip()
                    opt_val = re.sub(r"\n+", " ", opt_val).strip()
                    # a-d のみ追加（5個目以降の誤検出を除外）
                    if opt_key in ["a", "b", "c", "d", "e"]:
                        options.append({
                            "key": opt_key,
                            "text": opt_val
                        })
            else:
                question_body = q_clean

        # 問題文の整形
        lines = [l.strip() for l in question_body.split("\n") if l.strip()]
        question_body = "\n".join(lines)

        excel_info = excel_year_data.get(q_num, {})
        ans_raw = excel_info.get("answer_raw", "")
        correct_keys = excel_info.get("correct_keys", [])
        explanation = excel_info.get("explanation", "")

        is_cancelled = "採点対象外" in ans_raw or "採点対象外" in explanation

        # 複数選択判定
        is_multiple = len(correct_keys) > 1 or "2つ選" in question_body or "二つ選" in question_body or "2 つ選" in question_body
        num_choices = 2 if ("2つ選" in question_body or "二つ選" in question_body or "2 つ選" in question_body) else max(len(correct_keys), 1)

        assigned_images = q_images_map.get(q_num, [])

        questions.append({
            "id": f"{year}-{q_num:02d}",
            "year": year,
            "q_num": q_num,
            "question": question_body,
            "options": options,
            "answer_raw": ans_raw,
            "correct_keys": correct_keys,
            "explanation": explanation,
            "is_multiple": is_multiple,
            "num_choices": num_choices,
            "images": assigned_images,
            "is_cancelled": is_cancelled
        })

    # 2022年の採点対象外5問
    if year == 2022:
        existing_nums = {q["q_num"] for q in questions}
        for missing_num in [5, 8, 30, 57, 59]:
            if missing_num not in existing_nums:
                excel_info = excel_year_data.get(missing_num, {})
                questions.append({
                    "id": f"2022-{missing_num:02d}",
                    "year": 2022,
                    "q_num": missing_num,
                    "question": "【採点対象外問題】本問題は学会により「不適切問題」または「誤植」と判定され、公開問題から除外されました。（全員正答扱い）",
                    "options": [],
                    "answer_raw": excel_info.get("answer_raw", "採点対象外"),
                    "correct_keys": [],
                    "explanation": excel_info.get("explanation", "※学会により採点対象外と判定されました。"),
                    "is_multiple": False,
                    "num_choices": 0,
                    "images": [],
                    "is_cancelled": True
                })
        questions.sort(key=lambda q: q["q_num"])

    return questions

def main():
    excel_data = load_excel_data()
    all_questions = []

    for year in [2022, 2023, 2024, 2025]:
        year_qs = extract_pdf_data(year, excel_data.get(year, {}))
        all_questions.extend(year_qs)

    output_file = os.path.join(OUTPUT_DIR, "questions.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    print(f"\nSUCCESS: Exported {len(all_questions)} questions to questions.json")

if __name__ == "__main__":
    main()
