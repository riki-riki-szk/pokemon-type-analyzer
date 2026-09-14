"""
ポケモンチャンピオンズの使用率ランキングを取得し、
data/champions_ranking.json を生成するスクリプト。

データ元:
  - 使用率順位・タイプ・フォーム・持ち物: https://championsbattledata.com/ (非公式、ゲーム内バトルデータの集計)
  - 日本語名: https://pokeapi.co/

GitHub Actions (.github/workflows/update-ranking.yml) から毎日実行される。
ローカルで試す場合:  python scripts/build_ranking.py
"""

import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "data" / "champions_ranking.json"
NAME_CACHE_PATH = ROOT / "scripts" / "names_cache.json"

INDEX_URL = "https://championsbattledata.com/api/index"
BATTLE_URL = "https://championsbattledata.com/api/battle/{format}/{id}"
POKEAPI_SPECIES_URL = "https://pokeapi.co/api/v2/pokemon-species/{name}"

TOP_N = 50
FORMATS = {"singles": "Singles", "doubles": "Doubles"}

TYPE_JA = {
    "Normal": "ノーマル", "Fire": "ほのお", "Water": "みず", "Electric": "でんき",
    "Grass": "くさ", "Ice": "こおり", "Fighting": "かくとう", "Poison": "どく",
    "Ground": "じめん", "Flying": "ひこう", "Psychic": "エスパー", "Bug": "むし",
    "Rock": "いわ", "Ghost": "ゴースト", "Dragon": "ドラゴン", "Dark": "あく",
    "Steel": "はがね", "Fairy": "フェアリー",
}

# フォーム名(英語のハイフン以降)→ 日本語表記。(prefix, suffix)
FORM_JA = {
    "Alola": ("アローラ", ""),
    "Hisui": ("ヒスイ", ""),
    "Galar": ("ガラル", ""),
    "Paldea-Aqua": ("パルデア", "(みず種)"),
    "Paldea-Blaze": ("パルデア", "(ほのお種)"),
    "Paldea-Combat": ("パルデア", "(かくとう種)"),
    "F": ("", "♀"),
    "M": ("", "♂"),
    "Mega": ("メガ", ""),
    "Eternal": ("", "(えいえんのはな)"),
    "Four": ("", "(4匹家族)"),
    "Three": ("", "(3匹家族)"),
    "Large": ("", "(大)"),
    "Small": ("", "(小)"),
    "Super": ("", "(特大)"),
    "Dusk": ("", "(たそがれ)"),
    "Midnight": ("", "(まよなか)"),
    "Low-Key": ("", "(ロー)"),
    "Yellow": ("", "(黄)"),
    "Fancy": ("", "(ファンシー)"),
    "Hero": ("", "(マイティ)"),
    "Bloodmoon": ("", "(アカツキ)"),
    "Rapid-Strike": ("", "(れんげき)"),
    "Wellspring": ("", "(いどのめん)"),
    "Hearthflame": ("", "(かまどのめん)"),
    "Cornerstone": ("", "(いしずえのめん)"),
    "Therian": ("", "(れいじゅう)"),
    "Origin": ("", "(オリジン)"),
    "Crowned": ("", "(けんのおう)"),
}

# ハイフン以降を含めた英名そのものを置き換えたいもの
FULL_NAME_JA = {
    "Rotom-Wash": "ウォッシュロトム",
    "Rotom-Heat": "ヒートロトム",
    "Rotom-Frost": "フロストロトム",
    "Rotom-Fan": "スピンロトム",
    "Rotom-Mow": "カットロトム",
}

# 英名(ベース)からPokeAPIの species 名が機械的に作れないもの
SPECIES_OVERRIDE = {
    "Mr. Mime": "mr-mime",
    "Mr. Rime": "mr-rime",
    "Mime Jr.": "mime-jr",
    "Type: Null": "type-null",
    "Flabébé": "flabebe",
    "Farfetch'd": "farfetchd",
    "Sirfetch'd": "sirfetchd",
}

# 英名のハイフンがフォーム区切りではなく種名の一部であるもの
HYPHEN_SPECIES = {"Kommo-o", "Jangmo-o", "Hakamo-o", "Ho-Oh", "Porygon-Z", "Wo-Chien", "Chien-Pao", "Ting-Lu", "Chi-Yu"}


def fetch_json(url, retries=3):
    last_error = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pokemon-type-analyzer ranking builder"})
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.load(res)
        except Exception as e:  # noqa: BLE001
            last_error = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {url}: {last_error}")


def split_name(en_name):
    """'Ninetales-Alola' -> ('Ninetales', 'Alola'), 'Kommo-o' -> ('Kommo-o', None)"""
    if en_name in HYPHEN_SPECIES or "-" not in en_name:
        return en_name, None
    base, form = en_name.split("-", 1)
    return base, form


def species_slug(base_name):
    if base_name in SPECIES_OVERRIDE:
        return SPECIES_OVERRIDE[base_name]
    slug = base_name.lower()
    slug = re.sub(r"[.:']", "", slug)
    slug = re.sub(r"\s+", "-", slug.strip())
    return slug


def load_name_cache():
    if NAME_CACHE_PATH.exists():
        return json.loads(NAME_CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_name_cache(cache):
    NAME_CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def japanese_base_name(base_name, cache):
    if base_name in cache:
        return cache[base_name]
    slug = species_slug(base_name)
    try:
        data = fetch_json(POKEAPI_SPECIES_URL.format(name=slug))
        entry = next((n for n in data["names"] if n["language"]["name"] == "ja-Hrkt"), None) or \
            next((n for n in data["names"] if n["language"]["name"] == "ja"), None)
        ja = entry["name"] if entry else base_name
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] PokeAPI failed for {base_name} ({slug}): {e}", file=sys.stderr)
        ja = base_name
    cache[base_name] = ja
    return ja


def japanese_display_name(en_name, cache):
    if en_name in FULL_NAME_JA:
        return FULL_NAME_JA[en_name]
    base, form = split_name(en_name)
    ja = japanese_base_name(base, cache)
    if form is None:
        return ja
    if form in FORM_JA:
        prefix, suffix = FORM_JA[form]
        return f"{prefix}{ja}{suffix}"
    return f"{ja}({form})"


def mega_label(form_kind):
    """'Mega' -> 'メガ', 'Mega X' -> 'メガX'"""
    return "メガ" + form_kind.replace("Mega", "").strip()


def mega_stone_rates(showdown_id, format_name, base_name):
    """持ち物採用率からメガストーンの割合を {variant: percent} で返す (variant: '' / 'X' / 'Y' / 'Z')"""
    data = fetch_json(BATTLE_URL.format(format=format_name, id=showdown_id))
    key = re.sub(r"[^a-z]", "", base_name.lower())[:4]
    rates = {}
    for row in data.get("rows", []):
        if row.get("category") != "held_item":
            continue
        name = (row.get("name") or "").strip()
        m = re.match(r"^(.*?)(?:\s+([XYZ]))?$", name)
        stone, variant = m.group(1), (m.group(2) or "")
        if not stone.lower().endswith("ite"):
            continue
        if re.sub(r"[^a-z]", "", stone.lower())[:4] != key:
            continue
        pct = row.get("percentage_value")
        if pct is None:
            try:
                pct = float(str(row.get("percentage", "")).rstrip("%"))
            except ValueError:
                pct = 0.0
        rates[variant] = rates.get(variant, 0.0) + float(pct)
    return rates


def build_entry(pokemon, format_name, position, name_cache):
    summary = pokemon["summary"]
    primary = summary["primary"]
    en_name = pokemon["name"]
    base_name, _ = split_name(en_name)
    base_types = [TYPE_JA[t] for t in primary["types"]]

    display_name = japanese_display_name(en_name, name_cache)

    entry = {
        "rank": position,
        "id": pokemon["showdownId"],
        "en": en_name,
        "name": display_name,
        "forms": [],
    }

    # 既にメガ状態が主フォームとして登録されているもの (例: Gallade-Mega)
    if primary["form_kind"].startswith("Mega"):
        entry["forms"].append({"key": "base", "label": None, "types": base_types, "rate": None, "default": True})
        return entry

    # タイプが変わるメガシンカだけを別フォームとして扱う
    mega_forms = [
        f for f in summary.get("forms", [])
        if f["form_kind"].startswith("Mega") and [TYPE_JA[t] for t in f["types"]] != base_types
    ]

    if not mega_forms:
        entry["forms"].append({"key": "base", "label": None, "types": base_types, "rate": None, "default": True})
        return entry

    rates = mega_stone_rates(pokemon["showdownId"], format_name, base_name)
    time.sleep(0.2)

    forms = []
    used = 0.0
    for f in mega_forms:
        variant = f["form_kind"].replace("Mega", "").strip()
        rate = round(rates.get(variant, 0.0), 1)
        used += rate
        forms.append({
            "key": "mega" + variant.lower(),
            "label": mega_label(f["form_kind"]),
            "types": [TYPE_JA[t] for t in f["types"]],
            "rate": rate,
            "default": False,
        })

    base_rate = round(max(0.0, 100.0 - used), 1)
    forms.insert(0, {"key": "base", "label": "通常", "types": base_types, "rate": base_rate, "default": False})

    best = max(forms, key=lambda x: x["rate"])
    best["default"] = True
    entry["forms"] = forms
    return entry


def main():
    print("fetching index ...")
    index = fetch_json(INDEX_URL)
    name_cache = load_name_cache()

    latest_daily = (index.get("dailyDataFolders") or [""])[0]
    season, _, data_date = latest_daily.partition("/")

    result = {
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "season": season or None,
        "dataDate": data_date.replace("_", "/") if data_date else None,   # DD/MM/YYYY
        "source": {
            "ranking": "https://championsbattledata.com/",
            "names": "https://pokeapi.co/",
        },
        "topN": TOP_N,
        "formats": {},
    }

    for key, format_name in FORMATS.items():
        ranked = []
        for p in index["pokemon"]:
            b = p.get("summary", {}).get("battleSummary", {}).get("Current", {}).get(format_name)
            if b and b.get("position") is not None:
                ranked.append((b["position"], p))
        ranked.sort(key=lambda r: r[0])
        ranked = ranked[:TOP_N]

        print(f"{format_name}: {len(ranked)} entries")
        entries = []
        for position, p in ranked:
            entries.append(build_entry(p, format_name, position, name_cache))
        result["formats"][key] = entries

    save_name_cache(name_cache)
    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
