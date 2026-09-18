// ======================================
// Pokemon Type Analyzer
// ranking.js
// ポケモンチャンピオンズ 使用率ランキング連携
// ======================================
//
// data/champions_ranking.json(GitHub Actionsで毎日生成)を読み込み、
// マトリクス右側にランキングパネルを表示する。
// 選択したポケモンのタイプはマトリクス上に順位バッジとして反映される。

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
            syncRankingPanelSize();
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

            const multi = entry.forms.length > 1;

            // 採用率の高いフォーム(default)を先頭にする
            const forms = [...entry.forms].sort(
                (a,b)=>(b.default ? 1 : 0)-(a.default ? 1 : 0)
            );

            forms.forEach(form=>{

                listArea.appendChild(
                    createFormButton(entry, form, multi)
                );

            });

        });

    }

    // 1フォーム = 1ボタン。攻撃タイプのボタンと同じくクリックでON/OFF
    function createFormButton(entry, form, multi){

        const button = document.createElement("button");
        button.type = "button";
        button.className = "ranking-item";

        if(multi && !form.default){
            button.classList.add("ranking-item-sub");
        }

        button.classList.toggle("active", isChecked(entry, form));

        const rankNo = document.createElement("span");
        rankNo.className = "ranking-no";
        rankNo.textContent = entry.rank;

        if(entry.rank <= 3) rankNo.classList.add("ranking-no-top");

        const name = document.createElement("span");
        name.className = "ranking-name";
        name.textContent = entry.name;

        button.appendChild(rankNo);
        button.appendChild(name);

        if(multi){

            const formName = document.createElement("span");
            formName.className = "ranking-form-name";
            formName.textContent = form.label;
            button.appendChild(formName);

        }

        button.appendChild(createTypeChips(form.types));

        if(multi && form.rate !== null && form.rate !== undefined){

            const rate = document.createElement("span");
            rate.className = "ranking-rate";
            rate.textContent = form.rate+"%";
            rate.title = "持ち物(メガストーン)採用率から推定";
            button.appendChild(rate);

        }

        button.title =
            "クリックでマトリクスに反映/解除"+
            (multi ? "(通常とメガは別々に選べます)" : "");

        button.onclick = ()=>{

            const on = !isChecked(entry, form);

            setChecked(entry, form, on);

            button.classList.toggle("active", on);

            applyRankingMarkers();

            // ONにしたときはそのタイプの詳細も表示する
            if(on) showFormDetail(form);

        };

        return button;

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
                "ポケモンをクリックすると、そのタイプがマトリクスに表示されます。";

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
                "選択中 "+items.length+"体 ・ 攻撃タイプを選ぶと弱点を突ける数が表示されます";

            return;

        }

        summaryArea.textContent =
            "選択中 "+items.length+"体 ・ 弱点を突ける "+weak+"体 ・ 半減以下 "+resist+"体";

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

        syncRankingPanelSize();

        applyRankingMarkers();

    };

    // 3カラム表示のときはランキングの高さをマトリクスに合わせる
    function syncRankingPanelSize(){

        if(window.innerWidth <= 1400){

            panel.style.maxHeight = "";

            return;

        }

        // 詳細パネルと同じ高さ基準(マトリクスの実高さ)に揃える
        if(typeof syncDetailPanelSize === "function") syncDetailPanelSize();

        const rect = matrixPanel.getBoundingClientRect();

        panel.style.maxHeight = rect.height + "px";

    }

    syncRankingPanelSize();

    // フォント読み込み後に高さが変わることがあるので、読み込み完了時にもう一度合わせる
    window.addEventListener("load", syncRankingPanelSize);

    loadRanking();

})();
