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
    const heatNote = document.getElementById("defense-heat-note");
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

    // ゲーム内に実在するタイプ構成(data/champions_ranking.json の typings)
    // 自動編成が存在しない組み合わせを提案しないように使う
    let existingTypings = null;
    let searchPool = null;

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

    function examplesOf(combo){

        if(!existingTypings) return null;

        return existingTypings.get(combo.key) || null;

    }

    function isReal(combo){

        return !existingTypings || existingTypings.has(combo.key);

    }

    function pool(){

        return searchPool || ALL_COMBOS;

    }


    async function loadTypings(){

        try{

            const res = await fetch("data/champions_ranking.json", {cache:"no-cache"});

            if(!res.ok) throw new Error("HTTP "+res.status);

            const data = await res.json();

            if(!Array.isArray(data.typings) || data.typings.length === 0) return;

            existingTypings = new Map();

            data.typings.forEach(item=>{

                const key = normalizeTypes(item.types).join("・");

                existingTypings.set(key, {
                    names: item.names || [],
                    count: item.count || 0
                });

            });

            searchPool =
                ALL_COMBOS.filter(combo=>existingTypings.has(combo.key));

            // 候補が変わるので探索結果のキャッシュを捨てる
            solver = null;
            coreSolutions = [];
            coreIndex = 0;
            lastSearch = null;

            if(mode === "defense") renderDefense();

        }catch(e){

            // 取得できなければ171通り全てを候補として扱う(従来どおり)
            existingTypings = null;
            searchPool = null;

        }

    }

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

        lastSearch = null;
        coreSolutions = [];
        coreIndex = 0;

        if(alternativeButton) alternativeButton.disabled = true;

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

            summaryArea.textContent =
                "ポケモンを選ぶと、弱点の重なりと受けられないタイプを集計します。";

            summaryArea.classList.add("defense-summary-empty");

        }else{

            summaryArea.classList.remove("defense-summary-empty");

            const parts = [];

            parts.push("弱点が重なるタイプ " + result.stacked);
            parts.push("誰も受けられないタイプ " + (TYPES.length - result.covered));

            summaryArea.textContent = parts.join(" ・ ");

        }

        renderResist(result);

        paintMatrix();

        renderHeatNote();

    }

    function renderHeatNote(){

        if(!heatNote) return;

        const covered = uncoveredMask() === 0 && party.length > 0;

        const lines = [];

        if(covered){

            lines.push(
                "※18タイプ全てを半減以下で受けられています。" +
                "埋めるべき穴が残っていないため、マトリクス表には何も表示していません。"
            );

        }else{

            lines.push(
                "※マトリクス表の数字は「そのタイプをパーティに加えると、" +
                "新たに受けられるようになるタイプの数」です。濃いセルほど穴を埋められます。"
            );

        }

        if(existingTypings){

            lines.push(
                "薄く表示されているセルは、該当するポケモンがゲーム内に存在しない組み合わせです" +
                "(自動編成では選ばれません)。"
            );

        }

        heatNote.textContent = lines.join(" ");

    }

    function renderParty(){

        partyArea.innerHTML = "";

        if(party.length === 0){

            partyArea.textContent =
                "マトリクス表やランキングのポケモンをクリックで追加";

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

            const examples = examplesOf(member);

            const note = document.createElement("span");
            note.className = "defense-member-example";

            if(examples){

                note.textContent = examples.names.slice(0, 2).join("、");

                chip.title =
                    examples.names.join("、") +
                    (examples.count > examples.names.length
                        ? " ほか" + (examples.count - examples.names.length) + "種類"
                        : "") + " / クリックで外す";

            }else if(existingTypings){

                note.textContent = "該当なし";
                note.classList.add("defense-member-none");
                chip.title = "この組み合わせのポケモンはいません / クリックで外す";

            }

            chip.appendChild(note);

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

        // パーティが空でも枠ごと描く。
        // 空のときだけ消すと、その分だけマトリクス表が上下に動いてしまうため。
        const empty = party.length === 0;

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

            if(empty){

                state = "plain";

            }else if(weak >= 2 || (weak > 0 && resist === 0)){

                state = "danger";

            }else if(resist > 0){

                state = "safe";

            }

            cell.className = "defense-cell-item defense-" + state;

            const name = document.createElement("span");
            name.className =
                "defense-type-chip " + (TYPE_CLASS[type] || "");
            name.textContent = type;
            cell.appendChild(name);

            const badges = document.createElement("span");
            badges.className = "defense-badges";

            badges.appendChild(
                createBadge("弱", weak, "weak", empty)
            );

            badges.appendChild(
                createBadge("半", resist, "resist", empty, immune)
            );

            cell.appendChild(badges);

            cell.title = empty
                ? type + "技に対する受け(パーティ未選択)"
                : type + "技: 弱点 " + weak + "体 / 半減以下 " + resist + "体" +
                (immune > 0 ? "(うち無効 " + immune + "体)" : "") +
                (weak >= 2 ? " — 弱点が重なっています" : "") +
                (resist === 0 && weak > 0 ? " — 受けられる味方がいません" : "");

            if(empty) cell.classList.add("defense-cell-empty");

            grid.appendChild(cell);

        });

        resistArea.appendChild(grid);

    }

    // 「弱2」「半1」のような数のバッジ。0のときは灰色にして目立たせない。
    function createBadge(label, value, kind, empty, immune){

        const badge = document.createElement("span");

        badge.className =
            "defense-badge defense-badge-" + kind +
            (empty || value === 0 ? " defense-badge-zero" : "");

        const text = document.createElement("span");
        text.className = "defense-badge-label";
        text.textContent = label;
        badge.appendChild(text);

        const count = document.createElement("span");
        count.className = "defense-badge-count";
        count.textContent = empty ? "—" : value;
        badge.appendChild(count);

        if(!empty && immune > 0){

            const mark = document.createElement("span");
            mark.className = "defense-badge-immune";
            mark.textContent = "無" + immune;
            badge.appendChild(mark);

        }

        return badge;

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

            td.classList.remove("defense-painted","defense-in-party","defense-unreal");

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

        const gainOf = combo=>popcount(combo.resist & uncovered);

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

            const examples = examplesOf(combo);

            td.classList.toggle("defense-unreal", !isReal(combo));

            let title =
                combo.key + " — 加えると新たに受けられるタイプ " + gain + "種";

            if(examples){

                title += "\n" + examples.names.join("、") +
                    (examples.count > examples.names.length
                        ? " ほか" + (examples.count - examples.names.length) + "種類"
                        : "");

            }else if(existingTypings){

                title += "\nこの組み合わせのポケモンはいません";

            }

            if(index >= 0) title += "\n(パーティに編成中)";

            td.title = title;

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

    // 直前に実行した探索(「別の構成」で繰り返すため)
    let lastSearch = null;

    // 同点の最適解を全て列挙したもの(「別の構成」で順に見せる)
    let coreSolutions = [];
    let coreIndex = 0;

    function buildSolver(){

        if(solver) return solver;

        const candidates = pool();

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

            for(let k=0; k<candidates.length; k++){

                const resist = candidates[k].resist;

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
            previous: previous,
            candidates: candidates
        };

        return solver;

    }

    function reconstruct(mask){

        const data = buildSolver();
        const list = [];

        let current = mask;

        while(current > 0 && data.choice[current] >= 0){

            list.push(data.candidates[data.choice[current]]);

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

                const candidates = pool();

                for(let k=0; k<candidates.length; k++){

                    const candidate = candidates[k];

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

            const candidates = pool();

            for(let k=0; k<candidates.length; k++){

                const candidate = candidates[k];

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

    // 受けられるタイプ数が最大になるマスクと、それに必要な最少体数を求める
    function bestTarget(size){

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

        return {
            mask: bestMask,
            count: bestCount,
            coreSize: data.distance[bestMask]
        };

    }

    // 受けられるタイプ数がちょうど targetCount になる size 体の組み合わせを全て列挙する。
    // 候補123通り・3体までなら30万通り程度なので総当たりで足りる。
    // (覆うタイプの組み合わせ自体が複数ありうるので、マスクではなく数で判定する)
    const MAX_ENUMERATE_SIZE = 3;

    function enumerateCores(targetCount, size){

        const candidates = pool();
        const found = [];

        if(size <= 0 || size > MAX_ENUMERATE_SIZE) return found;

        if(size === 1){

            candidates.forEach(a=>{

                if(popcount(a.resist) === targetCount) found.push([a]);

            });

            return found;

        }

        for(let i=0; i<candidates.length; i++){

            const a = candidates[i];

            for(let j=i+1; j<candidates.length; j++){

                const ab = a.resist | candidates[j].resist;

                if(size === 2){

                    if(popcount(ab) === targetCount){

                        found.push([a, candidates[j]]);

                    }

                    continue;

                }

                for(let k=j+1; k<candidates.length; k++){

                    if(popcount(ab | candidates[k].resist) === targetCount){

                        found.push([a, candidates[j], candidates[k]]);

                    }

                }

            }

        }

        return found;

    }

    // 弱点の重なりが少ない順に並べ、同点なら弱点の総数が少ない順にする
    function sortCores(list){

        return list
            .map(core=>({core: core, score: weaknessScore(core)}))
            .sort((a,b)=>a.score - b.score || 0)
            .map(item=>item.core);

    }

    // 列挙した解のうち coreIndex 番目を反映する。
    // 体数指定の場合は、足りない枠を受けの厚みで埋める。
    function applyCore(){

        const core = coreSolutions[coreIndex];
        const coreSize = core.length;

        const list =
            lastSearch.kind === "minimum"
                ? core.slice()
                : fillToSize(core.slice(), lastSearch.size);

        const result = analyze(list);

        const parts = [];

        if(lastSearch.kind === "minimum"){

            parts.push(
                "18タイプ全てを半減以下で受けられる最少構成は " + list.length + "体"
            );

        }else{

            parts.push(
                list.length + "体で " + result.covered + " / " + TYPES.length +
                "タイプを半減以下"
            );

        }

        parts.push("弱点が重なるタイプ " + result.stacked);

        if(list.length > coreSize){

            parts.push(
                coreSize + "体で上限に達するため残りは受けを厚くしています"
            );

        }

        if(coreSolutions.length > 1){

            parts.push(
                coreSolutions.length + "通り中 " + (coreIndex + 1) + "番目"
            );

        }

        setParty(list, parts.join(" ・ "));

    }

    function startSearch(search){

        const size = search.kind === "size" ? search.size : MAX_PARTY;
        const target = bestTarget(size);

        if(target.coreSize === 255){

            setStatus("条件を満たす構成は見つかりませんでした。");

            return;

        }

        if(search.kind === "minimum" && target.mask !== FULL_MASK){

            setStatus("18タイプ全てを受けられる構成は見つかりませんでした。");

            return;

        }

        lastSearch = {
            kind: search.kind,
            size: size,
            mask: target.mask,
            count: target.count,
            coreSize: target.coreSize
        };

        coreSolutions = sortCores(
            enumerateCores(target.count, target.coreSize)
        );

        coreIndex = 0;

        if(coreSolutions.length === 0){

            // 列挙できない体数(4体以上が必要な場合)は動的計画法の解を1つだけ使う
            coreSolutions = [reduceStackedWeakness(
                reconstruct(target.mask), target.mask
            )];

        }

        applyCore();

        alternativeButton.disabled = coreSolutions.length <= 1;

    }

    // 同じ条件のまま、次の同点解を見せる
    function searchAlternative(){

        if(!lastSearch || coreSolutions.length <= 1) return;

        coreIndex = (coreIndex + 1) % coreSolutions.length;

        applyCore();

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

    const alternativeButton =
        document.getElementById("defense-alternative");

    function runWithStatus(action){

        setStatus("計算中...");

        // 「計算中」を先に描画させてから計算に入る
        setTimeout(action, 0);

    }

    document.querySelectorAll("[data-defense-size]").forEach(button=>{

        button.onclick = ()=>runWithStatus(()=>{

            startSearch({
                kind: "size",
                size: Number(button.dataset.defenseSize)
            });

        });

    });

    document.getElementById("defense-minimum").onclick = ()=>{

        runWithStatus(()=>startSearch({kind:"minimum"}));

    };

    alternativeButton.onclick = ()=>{

        runWithStatus(searchAlternative);

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

    loadTypings();

})();
