import json
import sys

with open(r"C:\Users\l0905\.gemini\antigravity\scratch\icrn-exam-app\data\questions.json", encoding="utf-8") as f:
    data = json.load(f)

print(f"Total questions: {len(data)}")

for yr in [2022, 2023, 2024, 2025]:
    yr_qs = [q for q in data if q["year"] == yr]
    print(f"=== Year {yr}: {len(yr_qs)} questions ===")
    q1 = yr_qs[0]
    print(f"  Q1 ID: {q1['id']} | Ans: {q1['answer']} | Choices: {len(q1['options'])} | Multi: {q1['is_multiple']}")
    print(f"    Body: {q1['question'][:60]}...")
    if q1['options']:
        print(f"    Opt a: {q1['options'][0]['text'][:40]}...")

img_qs = [q for q in data if q["images"]]
print(f"\nQuestions with images: {len(img_qs)}")
for q in img_qs:
    print(f"  {q['id']}: {q['images']} | {q['question'][:40]}...")
