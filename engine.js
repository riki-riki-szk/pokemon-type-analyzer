// ==========================================
// Pokemon Type Analyzer
// Engine Ver0.5
// ==========================================

// -------------------------
// 単タイプ倍率取得
// -------------------------
function getTypeMultiplier(attackType, defenseType) {

    if (!typeChart[attackType]) return 1;

    const value = typeChart[attackType][defenseType];

    return value === undefined ? 1 : value;

}

// -------------------------
// 複合タイプ倍率
// -------------------------
function getEffectiveness(attackType, defendTypes) {

    let multiplier = 1;

    defendTypes.forEach(type => {

        multiplier *= getTypeMultiplier(
            attackType,
            type
        );

    });

    return multiplier;

}

// -------------------------
// 最大倍率取得
// -------------------------
function getBestMultiplier(
    attackTypes,
    defendTypes
) {

    let best = 0;

    attackTypes.forEach(type => {

        const value =
            getEffectiveness(
                type,
                defendTypes
            );

        if (value > best) {

            best = value;

        }

    });

    return best;

}

// -------------------------
// 全タイプ生成
// -------------------------

const ALL_DEFENSE_TYPES =
    createDefenseTypes();

function createDefenseTypes() {

    const list = [];

    // 単タイプ

    TYPES.forEach(type => {

        list.push({

            name: type,

            types: [type]

        });

    });

    // 複合タイプ

    for (let i = 0; i < TYPES.length; i++) {

        for (let j = i + 1; j < TYPES.length; j++) {

            list.push({

                name:
                    TYPES[i] +
                    "・" +
                    TYPES[j],

                types: [

                    TYPES[i],

                    TYPES[j]

                ]

            });

        }

    }

    return list;

}

// -------------------------
// カバー率
// -------------------------

function calculateCoverage(
    attackTypes
) {

    let covered = 0;

    ALL_DEFENSE_TYPES.forEach(defense => {

        const value =
            getBestMultiplier(
                attackTypes,
                defense.types
            );

        if (value > 1) {

            covered++;

        }

    });

    return {

        covered,

        total:
            ALL_DEFENSE_TYPES.length,

        percent:
            (
                covered
                /
                ALL_DEFENSE_TYPES.length
                *
                100
            ).toFixed(1)

    };

}

// -------------------------
// 組み合わせ生成
// -------------------------

function combinationsOf(arr, k) {

    const result = [];

    function helper(start, combo) {

        if (combo.length === k) {
            result.push(combo.slice());
            return;
        }

        for (let i = start; i < arr.length; i++) {

            combo.push(arr[i]);
            helper(i + 1, combo);
            combo.pop();

        }

    }

    helper(0, []);

    return result;

}

// -------------------------
// タイプ別カバー済みビットマスク
// (弱点にできる防御タイプのインデックス集合)
// -------------------------

let typeMaskCache = null;

function getTypeMasks() {

    if (typeMaskCache) return typeMaskCache;

    const masks = {};

    TYPES.forEach(attackType => {

        let mask = 0n;

        ALL_DEFENSE_TYPES.forEach((defense, index) => {

            if (getEffectiveness(attackType, defense.types) > 1) {

                mask |= (1n << BigInt(index));

            }

        });

        masks[attackType] = mask;

    });

    typeMaskCache = masks;

    return masks;

}

function popcount(mask) {

    let count = 0;

    while (mask > 0n) {

        count += Number(mask & 1n);
        mask >>= 1n;

    }

    return count;

}

// -------------------------
// 指定数タイプでの最大カバー率組み合わせ
// -------------------------

function findBestCoverageCombo(size) {

    const masks = getTypeMasks();
    const combos = combinationsOf(TYPES, size);

    let best = -1;
    let bestCombo = null;

    combos.forEach(combo => {

        let mask = 0n;

        combo.forEach(type => {
            mask |= masks[type];
        });

        const covered = popcount(mask);

        if (covered > best) {

            best = covered;
            bestCombo = combo;

        }

    });

    return {

        types: bestCombo,
        covered: best,
        total: ALL_DEFENSE_TYPES.length

    };

}

// -------------------------
// 指定カバー率を超える最少タイプ数の組み合わせ
// -------------------------

function findMinimalComboOverThreshold(thresholdPercent) {

    const masks = getTypeMasks();
    const total = ALL_DEFENSE_TYPES.length;

    const requiredCovered =
        Math.floor(total * thresholdPercent / 100) + 1;

    for (let size = 1; size <= TYPES.length; size++) {

        const combos = combinationsOf(TYPES, size);

        for (const combo of combos) {

            let mask = 0n;

            combo.forEach(type => {
                mask |= masks[type];
            });

            const covered = popcount(mask);

            if (covered >= requiredCovered) {

                return {
                    types: combo,
                    covered,
                    total,
                    size
                };

            }

        }

    }

    return null;

}

// -------------------------
// 追加すると最もカバー率が伸びるタイプ候補
// -------------------------

function findBestNextTypes(currentTypes, count) {

    const masks = getTypeMasks();

    let currentMask = 0n;

    currentTypes.forEach(type => {
        currentMask |= masks[type];
    });

    const currentCovered = popcount(currentMask);

    const candidates = TYPES
        .filter(type => !currentTypes.includes(type))
        .map(type => {

            const mask = currentMask | masks[type];
            const covered = popcount(mask);

            return {
                type,
                covered,
                gain: covered - currentCovered
            };

        })
        .sort((a, b) => b.covered - a.covered)
        .slice(0, count);

    return {

        candidates,
        total: ALL_DEFENSE_TYPES.length

    };

}

// -------------------------
// CSS
// -------------------------

function multiplierClass(value) {

    if (value >= 4)
        return "multiplier4";

    if (value >= 2)
        return "multiplier2";

    if (value === 1)
        return "multiplier1";

    if (value === 0.5)
        return "multiplier05";

    if (value === 0.25)
        return "multiplier025";

    return "multiplier0";

}