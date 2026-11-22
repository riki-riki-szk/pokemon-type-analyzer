// ======================================
// Pokemon Type Analyzer
// defense.js
// 防御相性モード
// ======================================
//
// 攻撃モード: 技のタイプを選び、171通りの相手に弱点を突ける範囲を見る
// 防御モード: 手持ち(最大6体)のタイプを選び、
//             18種の攻撃タイプを半減以下で受けられるか・弱点が偏っていないかを見る
//
// マトリクス表は防御モードでは「今のパーティに加えると穴がいくつ埋まるか」の
// ヒートマップとして再利用する。

(function(){

    const MAX_PARTY = 6;
    const FULL_MASK = (1 << 18) - 1;

    const modeButtons =
        Array.from(document.querySelectorAll(".mode-button"));

    if(modeButtons.length === 0) return;

    const modeNote = document.getElementById("mode-note");
    const partyArea = document.getElementById("defense-party");
    const resistArea = document.getElementById("defense-resist");
    const summaryArea = document.getElementById("defense-summary");
    const statusArea = document.getElementById("defense-status");
    const countBadge = document.getElementById("defense-count");
    const coverageBadge = document.getElementById("defense-coverage");

    const MODE_NOTE = {
        attack:
            "技のタイプを選ぶと、171通りの相手に対して弱点を突ける範囲(カバー率)を計算します。",
        defense:
            "手持ちポケモンのタイプを選ぶと、18種の攻撃タイプのうち何種を半減以下で受けられるか、弱点がどこに偏っているかを計算します。"
    };

    let mode = "attack";
    let party = [];

    // ----------------------------
    // 171通りの防御タイプ情報
    // ----------------------------

    function popcount(value){

        let count = 0;

        while(value){

            value &= value - 1;
            count++;

        }

        return count;

    }

    function createInfo(types){

        let resist = 0;
        let weak = 0;
        let immune = 0;

        TYPES.forEach((attackType, bit)=>{

            const value = getEffectiveness(attackType, types);

            if(value === 0){

                immune |= 1 << bit;
                resist |= 1 << bit;

            }else if(value < 1){

                resist |= 1 << bit;

            }else if(value > 1){

                weak |= 1 << bit;

            }

        });

        return {
            types: types,
            key: types.join("・"),
            resist: resist,
            weak: weak,
            immune: immune
        };

    }

    const ALL_COMBOS = [];

    TYPES.forEach(type=>{

        ALL_COMBOS.push(createInfo([type]));

    });

    for(let i=0; i<TYPES.length; i++){

        for(let j=i+1; j<TYPES.length; j++){

            ALL_COMBOS.push(
                createInfo([TYPES[i], TYPES[j]])
            );

        }

    }

    const comboByKey = new Map();

    ALL_COMBOS.forEach(combo=>{

        comboByKey.set(combo.key, combo);

    });

    // マトリクスのセルと同じ順序(TYPES順)に直す
    function normalizeTypes(types){

        return [...types].sort(
            (a,b)=>TYPES.indexOf(a)-TYPES.indexOf(b)
        );

    }

    function findCombo(types){

        return comboByKey.get(
            normalizeTypes(types).join("・")
        ) || null;

    }

    // ----------------------------
    // パーティ操作
    // ----------------------------

    function inParty(combo){

        return party.some(member=>member.key === combo.key);

    }

    function toggleTypes(types){

        const combo = findCombo(types);

        if(!combo) return;

        const index =
            party.findIndex(member=>member.key === combo.key);

        if(index >= 0){

            party.splice(index, 1);

            setStatus("");

        }else{

            if(party.length >= MAX_PARTY){

                setStatus("パーティは"+MAX_PARTY+"体までです。");

                return;

            }

            party.push(combo);

            setStatus("");

        }

        renderDefense();

    }

    function setParty(list, message){

        party = list.slice(0, MAX_PARTY);

        renderDefense();

        setStatus(message || "");

    }

    function setStatus(text){

        statusArea.textContent = text;

    }

    // ----------------------------
    // 集計
    // ----------------------------

    function analyze(list){

        const resistCount = new Array(TYPES.length).fill(0);
        const weakCount = new Array(TYPES.length).fill(0);
        const immuneCount = new Array(TYPES.length).fill(0);

        list.forEach(member=>{

            TYPES.forEach((type, bit)=>{

                const flag = 1 << bit;

                if(member.resist & flag) resistCount[bit]++;
                if(member.weak & flag) weakCount[bit]++;
                if(member.immune & flag) immuneCount[bit]++;

            });

        });

        let covered = 0;
        let stacked = 0;
        let holes = 0;

        TYPES.forEach((type, bit)=>{

            if(resistCount[bit] > 0) covered++;

            if(weakCount[bit] >= 2) stacked++;

            if(resistCount[bit] === 0 && weakCount[bit] > 0) holes++;

        });

        return {
            resistCount: resistCount,
            weakCount: weakCount,
            immuneCount: immuneCount,
            covered: covered,
            stacked: stacked,
            holes: holes
        };

    }

    function unionResist(list){

        let mask = 0;

        list.forEach(member=>{

            mask |= member.resist;

        });

        return mask;

    }

    // 受けられていない(半減以下が0体の)攻撃タイプ
    function uncoveredMask(){

        return FULL_MASK & ~unionResist(party);

    }

    // ----------------------------
    // 表示
    // ----------------------------

    function renderDefense(){

        renderParty();

        const result = analyze(party);

        countBadge.textContent = party.length + "体";

        coverageBadge.textContent =
            "受けられるタイプ " + result.covered + " / " + TYPES.length;

        if(party.length === 0){

            summaryArea.textContent = "";

        }else{

            const parts = [];

            parts.push("弱点が重なるタイプ " + result.stacked);
            parts.push("誰も受けられないタイプ " + (TYPES.length - result.covered));

            summaryArea.textContent = parts.join(" ・ ");

        }

        renderResist(result);

        paintMatrix();

    }

    function renderParty(){

        partyArea.innerHTML = "";

        if(party.length === 0){

            partyArea.textContent =
                "マトリクス表のセル、または使用率ランキングのポケモンをクリックして追加してください。";

            return;

        }

        party.forEach((member, index)=>{

            const chip = document.createElement("button");

            chip.type = "button";
            chip.className = "defense-member-chip";
            chip.title = "クリックで外す";

            const no = document.createElement("span");
            no.className = "defense-member-no";
            no.textContent = index + 1;
            chip.appendChild(no);

            member.types.forEach(type=>{

                const typeChip = document.createElement("span");
                typeChip.className =
                    "defense-member-type " + (TYPE_CLASS[type] || "");
                typeChip.textContent = type;
                chip.appendChild(typeChip);

            });

            const remove = document.createElement("span");
            remove.className = "defense-member-remove";
            remove.textContent = "✕";
            chip.appendChild(remove);

            chip.onclick = ()=>toggleTypes(member.types);

            partyArea.appendChild(chip);

        });

    }

    function renderResist(result){

        resistArea.innerHTML = "";

        if(party.length === 0) return;

        const title = document.createElement("div");
        title.className = "detail-group-title";
        title.textContent = "攻撃タイプごとの受け(弱点/半減以下の体数)";
        resistArea.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "defense-grid";

        TYPES.forEach((type, bit)=>{

            const resist = result.resistCount[bit];
            const weak = result.weakCount[bit];
            const immune = result.immuneCount[bit];

            const cell = document.createElement("div");

            let state = "plain";

            if(weak >= 2 || (weak > 0 && resist === 0)){

                state = "danger";

            }else if(resist > 0){

                state = "safe";

            }

            cell.className =
                "defense-cell-item defense-" + state +
                " " + (TYPE_CLASS[type] || "");

            const name = document.createElement("span");
            name.textContent = type;
            cell.appendChild(name);

            const counts = document.createElement("span");
            counts.className = "defense-counts";

            const label = [];

            label.push("弱" + weak);
            label.push(immune > 0 ? "半" + resist + "(無" + immune + ")" : "半" + resist);

            counts.textContent = label.join(" / ");
            cell.appendChild(counts);

            cell.title =
                type + "技: 弱点 " + weak + "体 / 半減以下 " + resist + "体" +
                (immune > 0 ? "(うち無効 " + immune + "体)" : "") +
                (weak >= 2 ? " — 弱点が重なっています" : "") +
                (resist === 0 && weak > 0 ? " — 受けられる味方がいません" : "");

            grid.appendChild(cell);

        });

        resistArea.appendChild(grid);

    }

    // ----------------------------
    // マトリクスをヒートマップとして塗る
    // ----------------------------

    const MULTIPLIER_CLASSES = [
        "multiplier4","multiplier2","multiplier1",
        "multiplier05","multiplier025","multiplier0"
    ];

    function clearMatrixPaint(){

        matrixTable.querySelectorAll("td.defense-painted").forEach(td=>{

            td.classList.remove("defense-painted","defense-in-party");

            for(let level=0; level<=4; level++){

                td.classList.remove("defense-heat-"+level);

            }

            const num = td.querySelector(".defense-num");
            if(num) num.remove();

            const badge = td.querySelector(".defense-party-no");
            if(badge) badge.remove();

        });

    }

    function paintMatrix(){

        if(mode !== "defense"){

            clearMatrixPaint();

            return;

        }

        const uncovered = uncoveredMask();

        // 穴が無くなったら「埋められる穴の数」は全て0になってしまうので、
        // そのタイプ自体が半減以下にできるタイプ数を表示に切り替える
        const showTotal = uncovered === 0;

        const gainOf = combo=>
            showTotal
                ? popcount(combo.resist)
                : popcount(combo.resist & uncovered);

        // 最大値を基準に4段階へ正規化する
        let maxGain = 0;

        ALL_COMBOS.forEach(combo=>{

            const gain = gainOf(combo);

            if(gain > maxGain) maxGain = gain;

        });

        ALL_COMBOS.forEach(combo=>{

            const td = matrixTable.querySelector(
                'td[data-types="'+combo.key+'"]'
            );

            if(!td) return;

            // 倍率表示を消す(ランキングのバッジは残す)
            Array.from(td.childNodes).forEach(node=>{

                if(node.nodeType === 3) node.remove();

            });

            MULTIPLIER_CLASSES.forEach(name=>{

                td.classList.remove(name);

            });

            td.classList.add("defense-painted");

            const gain = gainOf(combo);

            for(let level=0; level<=4; level++){

                td.classList.remove("defense-heat-"+level);

            }

            const level =
                (gain === 0 || maxGain === 0)
                    ? 0
                    : Math.max(1, Math.ceil(gain / maxGain * 4));

            td.classList.add("defense-heat-" + level);

            let num = td.querySelector(".defense-num");

            if(!num){

                num = document.createElement("span");
                num.className = "defense-num";
                td.appendChild(num);

            }

            num.textContent = gain > 0 ? gain : "";

            const index =
                party.findIndex(member=>member.key === combo.key);

            let badge = td.querySelector(".defense-party-no");

            if(index >= 0){

                td.classList.add("defense-in-party");

                if(!badge){

                    badge = document.createElement("span");
                    badge.className = "defense-party-no";
                    td.appendChild(badge);

                }

                badge.textContent = index + 1;

            }else{

                td.classList.remove("defense-in-party");

                if(badge) badge.remove();

            }

            td.title =
                combo.key +
                (showTotal
                    ? " — 半減以下にできるタイプ " + gain + "種"
                    : " — 加えると新たに受けられるタイプ " + gain + "種") +
                (index >= 0 ? "(パーティに編成中)" : "");

        });

    }

    // ----------------------------
    // 自動編成
    // ----------------------------
    //
    // 「どのタイプ集合を最少何体で受けられるか」を全2^18通りについて
    // 動的計画法で一度だけ求めておく。これ1つで
    // 「N体での最大」「18タイプ全ての最少体数」の両方に答えられる。

    let solver = null;

    function buildSolver(){

        if(solver) return solver;

        const distance = new Uint8Array(FULL_MASK + 1).fill(255);
        const choice = new Int32Array(FULL_MASK + 1).fill(-1);
        const previous = new Int32Array(FULL_MASK + 1).fill(-1);

        distance[0] = 0;

        for(let mask=0; mask<FULL_MASK; mask++){

            if(distance[mask] === 255) continue;

            // 未被覆の最小ビットは必ずどれかが埋める(探索の枝刈り)
            let bit = 0;

            while(mask & (1 << bit)) bit++;

            const next = distance[mask] + 1;

            for(let k=0; k<ALL_COMBOS.length; k++){

                const resist = ALL_COMBOS[k].resist;

                if(!(resist & (1 << bit))) continue;

                const merged = mask | resist;

                if(distance[merged] > next){

                    distance[merged] = next;
                    choice[merged] = k;
                    previous[merged] = mask;

                }

            }

        }

        solver = {
            distance: distance,
            choice: choice,
            previous: previous
        };

        return solver;

    }

    function reconstruct(mask){

        const data = buildSolver();
        const list = [];

        let current = mask;

        while(current > 0 && data.choice[current] >= 0){

            list.push(ALL_COMBOS[data.choice[current]]);

            current = data.previous[current];

        }

        return list.reverse();

    }

    // 受けられるタイプ数を保ったまま、弱点の重なりが少ない構成に置き換える
    function reduceStackedWeakness(list, targetMask){

        let best = list.slice();
        let bestScore = weaknessScore(best);

        for(let pass=0; pass<4; pass++){

            let improved = false;

            for(let i=0; i<best.length; i++){

                for(let k=0; k<ALL_COMBOS.length; k++){

                    const candidate = ALL_COMBOS[k];

                    if(best.some((member, index)=>
                        index !== i && member.key === candidate.key)) continue;

                    const trial = best.slice();
                    trial[i] = candidate;

                    if((unionResist(trial) & targetMask) !== targetMask) continue;

                    const score = weaknessScore(trial);

                    if(score < bestScore){

                        best = trial;
                        bestScore = score;
                        improved = true;

                    }

                }

            }

            if(!improved) break;

        }

        return best;

    }

    // 受けられるタイプ数が頭打ちになった後の「残り枠」を埋める。
    // 受けを厚く(2体以上で受けられるタイプを増やす)しつつ、
    // 弱点が重ならない相手を選ぶ。
    function fillToSize(list, size){

        while(list.length < size){

            let bestCandidate = null;
            let bestScore = Infinity;

            for(let k=0; k<ALL_COMBOS.length; k++){

                const candidate = ALL_COMBOS[k];

                if(list.some(member=>member.key === candidate.key)) continue;

                const trial = list.concat([candidate]);
                const score = redundancyScore(trial);

                if(score < bestScore){

                    bestScore = score;
                    bestCandidate = candidate;

                }

            }

            if(!bestCandidate) break;

            list.push(bestCandidate);

        }

        return list;

    }

    function redundancyScore(list){

        const result = analyze(list);

        let totalWeak = 0;
        let totalResist = 0;

        result.weakCount.forEach(value=>{ totalWeak += value; });
        result.resistCount.forEach(value=>{ totalResist += value; });

        // 弱点の重なりを最優先で避け、次に受けの厚みを増やす
        return result.stacked * 10000 + totalWeak * 10 - totalResist;

    }

    function weaknessScore(list){

        const result = analyze(list);

        let totalWeak = 0;

        result.weakCount.forEach(value=>{

            totalWeak += value;

        });

        // 弱点の重なりを最優先で減らし、次に弱点の総数を減らす
        return result.stacked * 1000 + totalWeak;

    }

    function searchBestOfSize(size){

        const data = buildSolver();

        let bestMask = 0;
        let bestCount = -1;

        for(let mask=0; mask<=FULL_MASK; mask++){

            if(data.distance[mask] > size) continue;

            const count = popcount(mask);

            if(count > bestCount){

                bestCount = count;
                bestMask = mask;

            }

        }

        let list = reconstruct(bestMask);

        const minimumForBest = list.length;

        list = fillToSize(list, size);

        list = reduceStackedWeakness(list, bestMask);

        const result = analyze(list);

        const note =
            minimumForBest < size
                ? "(" + minimumForBest + "体で上限に達するため、残りは受けを厚くしています)"
                : "";

        setParty(
            list,
            list.length + "体で " + result.covered + " / " + TYPES.length +
            "タイプを半減以下 ・ 弱点が重なるタイプ " + result.stacked + note
        );

    }

    function searchMinimum(){

        const data = buildSolver();

        if(data.distance[FULL_MASK] === 255){

            setStatus("18タイプ全てを受けられる構成は見つかりませんでした。");

            return;

        }

        let list = reconstruct(FULL_MASK);

        list = reduceStackedWeakness(list, FULL_MASK);

        const result = analyze(list);

        setParty(
            list,
            "18タイプ全てを半減以下で受けられる最少構成は " + list.length +
            "体 ・ 弱点が重なるタイプ " + result.stacked
        );

    }

    // ----------------------------
    // モード切替
    // ----------------------------

    function setMode(next){

        if(mode === next) return;

        mode = next;

        document.body.classList.toggle(
            "defense-mode",
            mode === "defense"
        );

        modeButtons.forEach(button=>{

            button.classList.toggle(
                "active",
                button.dataset.mode === mode
            );

        });

        modeNote.textContent = MODE_NOTE[mode];

        // 倍率表示とヒートマップを引き直す
        createMatrix();

        if(mode === "defense"){

            renderDefense();

        }

    }

    modeButtons.forEach(button=>{

        button.onclick = ()=>setMode(button.dataset.mode);

    });

    // ----------------------------
    // 入力(マトリクスのセル / ランキング)
    // ----------------------------

    // セルのonclick(詳細表示)より先に拾うのでキャプチャ段階で登録する
    matrixTable.addEventListener("click", event=>{

        if(mode !== "defense") return;

        const td = event.target.closest("td[data-types]");

        if(!td || !matrixTable.contains(td)) return;

        toggleTypes(td.dataset.types.split("・"));

    }, true);

    document.getElementById("defense-clear").onclick = ()=>{

        setParty([], "");

    };

    document.querySelectorAll("[data-defense-size]").forEach(button=>{

        button.onclick = ()=>{

            setStatus("計算中...");

            // 計算前に「計算中」を描画させる
            setTimeout(()=>{

                searchBestOfSize(Number(button.dataset.defenseSize));

            }, 0);

        };

    });

    document.getElementById("defense-minimum").onclick = ()=>{

        setStatus("計算中...");

        setTimeout(searchMinimum, 0);

    };

    // ranking.js から参照する
    window.defenseMode = {

        isActive: ()=>mode === "defense",
        toggleTypes: toggleTypes

    };

    // マトリクス再描画のたびにヒートマップを塗り直す
    const originalCreateMatrix = createMatrix;

    createMatrix = function(){

        originalCreateMatrix();

        paintMatrix();

    };

    renderDefense();

})();
