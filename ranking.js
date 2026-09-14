// ======================================
// Pokemon Type Analyzer
// ranking.js
// ポケモンチャンピオンズ 使用率ランキング連携
// ======================================
//
// data/champions_ranking.json(GitHub Actionsで毎日生成)を読み込み、
// マトリクス右側にランキングパネルを表示する。
// チェックしたポケモンのタイプはマトリクス上に順位バッジとして反映される。

(function(){

    const RANKING_URL = "data/champions_ranking.json";
    const SHOW_N = 30;

    const panel = document.getElementById("ranking-panel");
    if(!panel) return;

    const listArea = document.getElementById("ranking-list");
    const summaryArea = document.getElementById("ranking-summary");
    const metaArea = document.getElementById("ranking-meta");
    const tabButtons = Array.from(panel.querySelectorAll(".ranking-tab"));

    let rankingData = null;
    let currentFormat = "singles";

    // チェック状態: key = format + ":" + id + ":" + formKey
    const checkedForms = new Map();

    // ----------------------------
    // 読み込み
    // ----------------------------

    async function loadRanking(){

        try{

            const res = await fetch(RANKING_URL, {cache:"no-cache"});

            if(!res.ok) throw new Error("HTTP "+res.status);

            rankingData = await res.json();

            renderMeta();
            renderList();
            applyRankingMarkers();

        }catch(e){

            listArea.textContent = "ランキングデータを読み込めませんでした。";

        }

    }

    function renderMeta(){

        const parts = [];

        if(rankingData.season){
            parts.push("シーズン"+rankingData.season);
        }

        if(rankingData.dataDate){
            // DD/MM/YYYY → YYYY/MM/DD
            const d = rankingData.dataDate.split("/");
            if(d.length === 3) parts.push(d[2]+"/"+d[1]+"/"+d[0]+"時点");
        }

        metaArea.textContent = parts.join(" ・ ");

    }

    // ----------------------------
    // 一覧描画
    // ----------------------------

    function currentEntries(){

        if(!rankingData) return [];

        const list = rankingData.formats[currentFormat] || [];

        return list.slice(0, SHOW_N);

    }

    function formKey(entry, form){

        return currentFormat+":"+entry.id+":"+form.key;

    }

    function isChecked(entry, form){

        return checkedForms.has(formKey(entry, form));

    }

    function setChecked(entry, form, on){

        const key = formKey(entry, form);

        if(on){
            checkedForms.set(key, {entry:entry, form:form, format:currentFormat});
        }else{
            checkedForms.delete(key);
        }

    }

    function createTypeChips(types){

        const wrap = document.createElement("span");
        wrap.className = "ranking-types";

        types.forEach(type=>{

            const chip = document.createElement("span");
            chip.className = "ranking-type-chip "+(TYPE_CLASS[type] || "");
            chip.textContent = type;
            wrap.appendChild(chip);

        });

        return wrap;

    }

    function renderList(){

        listArea.innerHTML = "";

        const entries = currentEntries();

        if(entries.length === 0){
            listArea.textContent = "データがありません。";
            return;
        }

        entries.forEach(entry=>{

            const row = document.createElement("div");
            row.className = "ranking-row";

            const main = document.createElement("div");
            main.className = "ranking-main";

            const mainCheck = document.createElement("input");
            mainCheck.type = "checkbox";
            mainCheck.className = "ranking-check";
            mainCheck.title = "チェックするとマトリクスに反映";

            const rankNo = document.createElement("span");
            rankNo.className = "ranking-no";
            rankNo.textContent = entry.rank;

            const name = document.createElement("button");
            name.type = "button";
            name.className = "ranking-name";
            name.textContent = entry.name;
            name.title = "クリックで詳細を表示";

            main.appendChild(mainCheck);
            main.appendChild(rankNo);
            main.appendChild(name);

            row.appendChild(main);

            const single = entry.forms.length === 1;

            if(single){

                const form = entry.forms[0];

                main.appendChild(createTypeChips(form.types));

                mainCheck.checked = isChecked(entry, form);

                mainCheck.onchange = ()=>{
                    setChecked(entry, form, mainCheck.checked);
                    applyRankingMarkers();
                };

                name.onclick = ()=>showFormDetail(form);

            }else{

                const formsArea = document.createElement("div");
                formsArea.className = "ranking-forms";

                const subChecks = [];

                entry.forms.forEach(form=>{

                    const label = document.createElement("label");
                    label.className = "ranking-form";

                    const check = document.createElement("input");
                    check.type = "checkbox";
                    check.className = "ranking-check";
                    check.checked = isChecked(entry, form);

                    const formName = document.createElement("span");
                    formName.className = "ranking-form-name";
                    formName.textContent = form.label;

                    label.appendChild(check);
                    label.appendChild(formName);
                    label.appendChild(createTypeChips(form.types));

                    if(form.rate !== null && form.rate !== undefined){
                        const rate = document.createElement("span");
                        rate.className = "ranking-rate";
                        rate.textContent = form.rate+"%";
                        rate.title = "持ち物(メガストーン)採用率から推定";
                        label.appendChild(rate);
                    }

                    check.onchange = ()=>{
                        setChecked(entry, form, check.checked);
                        syncMainCheck();
                        applyRankingMarkers();
                    };

                    subChecks.push({form:form, input:check});

                    formsArea.appendChild(label);

                });

                row.appendChild(formsArea);

                function syncMainCheck(){

                    const on = subChecks.filter(s=>s.input.checked).length;

                    mainCheck.checked = on > 0;
                    mainCheck.indeterminate = on > 0 && on < subChecks.length;

                }

                syncMainCheck();

                // 行頭チェック: ONなら採用率の高いフォームを、OFFなら全フォームを解除
                mainCheck.onchange = ()=>{

                    const turnOn = mainCheck.checked;

                    subChecks.forEach(s=>{

                        const on = turnOn ? !!s.form.default : false;

                        s.input.checked = on;
                        setChecked(entry, s.form, on);

                    });

                    syncMainCheck();
                    applyRankingMarkers();

                };

                name.onclick = ()=>{

                    const checkedForm =
                        subChecks.find(s=>s.input.checked);

                    const target =
                        checkedForm
                            ? checkedForm.form
                            : (entry.forms.find(f=>f.default) || entry.forms[0]);

                    showFormDetail(target);

                };

            }

            listArea.appendChild(row);

        });

    }

    // ----------------------------
    // 詳細表示(既存のshowDetailを利用)
    // ----------------------------

    function showFormDetail(form){

        const types = normalizeTypes(form.types);

        const multiplier =
            getBestMultiplier([...selectedTypes], types);

        showDetail(types, multiplier);

        const cell = findCell(types);

        if(cell){

            cell.scrollIntoView({block:"nearest", inline:"nearest"});

        }

    }

    // ----------------------------
    // マトリクスへの反映
    // ----------------------------

    // マトリクスのセルと同じ順序(TYPES順)に並べ替える
    function normalizeTypes(types){

        return [...types].sort((a,b)=>TYPES.indexOf(a)-TYPES.indexOf(b));

    }

    function findCell(types){

        const key = normalizeTypes(types).join("・");

        return matrixTable.querySelector(
            'td[data-types="'+key+'"]'
        );

    }

    function applyRankingMarkers(){

        // 既存のマーカーを除去
        matrixTable.querySelectorAll("td.ranking-marked").forEach(td=>{

            td.classList.remove("ranking-marked");
            td.removeAttribute("title");

            const mark = td.querySelector(".ranking-mark");
            if(mark) mark.remove();

        });

        // 現在のフォーマットのチェック分をセルごとに集約
        const byCell = new Map();

        checkedForms.forEach(item=>{

            if(item.format !== currentFormat) return;

            const key = normalizeTypes(item.form.types).join("・");

            if(!byCell.has(key)) byCell.set(key, []);

            byCell.get(key).push(item);

        });

        byCell.forEach((items, key)=>{

            const td = matrixTable.querySelector(
                'td[data-types="'+key+'"]'
            );

            if(!td) return;

            items.sort((a,b)=>a.entry.rank-b.entry.rank);

            td.classList.add("ranking-marked");

            const mark = document.createElement("span");
            mark.className = "ranking-mark";
            mark.textContent =
                items.length === 1
                    ? items[0].entry.rank
                    : items[0].entry.rank+"+";

            td.appendChild(mark);

            td.title = items.map(i=>{
                const label = i.form.label ? "("+i.form.label+")" : "";
                return i.entry.rank+"位 "+i.entry.name+label;
            }).join("\n");

        });

        updateSummary();

    }

    function updateSummary(){

        const items =
            [...checkedForms.values()]
                .filter(i=>i.format === currentFormat);

        if(items.length === 0){

            summaryArea.textContent =
                "チェックしたポケモンのタイプがマトリクスに表示されます。";

            return;

        }

        const attack = [...selectedTypes];

        let weak = 0;
        let resist = 0;

        items.forEach(i=>{

            const m = getBestMultiplier(attack, i.form.types);

            if(m >= 2) weak++;
            else if(m < 1) resist++;

        });

        if(attack.length === 0){

            summaryArea.textContent =
                "チェック中 "+items.length+"体 ・ 攻撃タイプを選ぶと弱点を突ける数が表示されます";

            return;

        }

        summaryArea.textContent =
            "チェック中 "+items.length+"体 ・ 弱点を突ける "+weak+"体 ・ 半減以下 "+resist+"体";

    }

    // ----------------------------
    // 操作ボタン
    // ----------------------------

    function checkTop(n){

        currentEntries().slice(0, n).forEach(entry=>{

            entry.forms.forEach(form=>{

                const on = entry.forms.length === 1 || !!form.default;

                setChecked(entry, form, on);

            });

        });

        renderList();
        applyRankingMarkers();

    }

    function clearChecks(){

        [...checkedForms.keys()].forEach(key=>{

            if(key.startsWith(currentFormat+":")) checkedForms.delete(key);

        });

        renderList();
        applyRankingMarkers();

    }

    tabButtons.forEach(button=>{

        button.onclick = ()=>{

            currentFormat = button.dataset.format;

            tabButtons.forEach(b=>b.classList.toggle("active", b === button));

            renderList();
            applyRankingMarkers();

        };

    });

    panel.querySelectorAll("[data-check-top]").forEach(button=>{

        button.onclick = ()=>checkTop(Number(button.dataset.checkTop));

    });

    const clearButton = document.getElementById("ranking-clear");
    if(clearButton) clearButton.onclick = clearChecks;

    // ----------------------------
    // マトリクス再描画のたびにマーカーを付け直す
    // ----------------------------

    const originalCreateMatrix = createMatrix;

    createMatrix = function(){

        originalCreateMatrix();

        applyRankingMarkers();

    };

    loadRanking();

})();
