import json

with open(r"C:\Users\l0905\.gemini\antigravity\scratch\icrn-exam-app\data\questions.json", encoding="utf-8") as f:
    qs = json.load(f)

for q in qs:
    if q["id"] == "2024-13":
        print("=== 2024-13 ===")
        print(q["question"])
        print("Options:", q["options"])
    if len(q["options"]) == 6:
        print(f"=== {q['id']} (6 options) ===")
        for o in q["options"]:
            print(" ", o)
