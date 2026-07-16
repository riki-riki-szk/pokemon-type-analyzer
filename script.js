// ======================================
// Pokemon Type Analyzer
// script.js Ver0.6
// Part 1 / 6
// ======================================

const TYPE_CLASS = {
    "ノーマル":"normal",
    "ほのお":"fire",
    "みず":"water",
    "でんき":"electric",
    "くさ":"grass",
    "こおり":"ice",
    "かくとう":"fighting",
    "どく":"poison",
    "じめん":"ground",
    "ひこう":"flying",
    "エスパー":"psychic",
    "むし":"bug",
    "いわ":"rock",
    "ゴースト":"ghost",
    "ドラゴン":"dragon",
    "あく":"dark",
    "はがね":"steel",
    "フェアリー":"fairy"
};

const selectedTypes = new Set();
const typeButtons = {};

// 現在選択中のセル
let selectedCell = null;

// ポケモン一覧の取得リクエスト管理用
let pokemonListRequestId = 0;

const typeList = document.getElementById("type-list");
const selectedArea = document.getElementById("selected-types");
const selectedCountArea = document.getElementById("selected-count");
const selectedCoverageInline = document.getElementById("selected-coverage-inline");
const matrixTable = document.getElementById("matrix-table");
const matrixPanel = document.getElementById("matrix-panel");
const detailPanel = document.getElementById("detail-panel");
const detailArea = document.getElementById("detail");
const autoSelectStatus = document.getElementById("auto-select-status");
const autoSelectThresholdButton = document.getElementById("auto-select-threshold");
const clearSelectionButton = document.getElementById("clear-selection");

initialize();

function initialize(){

    createTypeButtons();

    setupAutoSelectButtons();

    clearSelectionButton.onclick=()=>{

        applySelection([]);

        autoSelectStatus.textContent="";

    };

    refresh();

}

function refresh(){

    updateSelectedTypes();

    updateCoverage();

    createMatrix();

}

function toggleType(type){

    if(selectedTypes.has(type)){

        selectedTypes.delete(type);

        typeButtons[type].classList.remove("active");

    }else{

        selectedTypes.add(type);

        typeButtons[type].classList.add("active");

    }

    refresh();

}

function applySelection(types){

    selectedTypes.clear();

    TYPES.forEach(type=>{

        typeButtons[type].classList.remove("active");

    });

    types.forEach(type=>{

        selectedTypes.add(type);

        typeButtons[type].classList.add("active");

    });

    refresh();

}

function setupAutoSelectButtons(){

    document.querySelectorAll(".auto-select-button[data-size]").forEach(button=>{

        button.onclick=()=>{

            const size = Number(button.dataset.size);

            autoSelectStatus.textContent = "計算中...";

            setTimeout(()=>{

                const result = findBestCoverageCombo(size);

                applySelection(result.types);

                const percent =
                    (result.covered / result.total * 100).toFixed(1);

                autoSelectStatus.textContent =
                    `${size}タイプで最大カバー率: ${result.covered} / ${result.total} (${percent}%) → ` +
                    result.types.join("・");

            }, 10);

        };

    });

    autoSelectThresholdButton.onclick=()=>{

        autoSelectStatus.textContent = "計算中...";

        setTimeout(()=>{

            const result = findMinimalComboOverThreshold(99);

            applySelection(result.types);

            const percent =
                (result.covered / result.total * 100).toFixed(1);

            autoSelectStatus.textContent =
                `カバー率99%超えの最少構成: ${result.size}タイプ (${result.covered} / ${result.total} = ${percent}%) → ` +
                result.types.join("・");

        }, 10);

    };

}

function createTypeButtons(){

    TYPES.forEach(type=>{

        const button=document.createElement("button");

        button.className=
            "type-button "+TYPE_CLASS[type];

        button.textContent=type;

        button.onclick=()=>{

            toggleType(type);

        };

        typeButtons[type]=button;

        typeList.appendChild(button);

    });

}

function updateSelectedTypes(){

    selectedCountArea.textContent=
        `${selectedTypes.size}種類選択中`;

    selectedArea.innerHTML="";

    if(selectedTypes.size===0){

        selectedArea.textContent="選択なし";

        return;

    }

    [...selectedTypes].forEach(type=>{

        const chip=document.createElement("div");

        chip.className=
            "selected-chip "+TYPE_CLASS[type];

        chip.textContent=type;

        chip.title="クリックで解除";

        chip.onclick=()=>{

            toggleType(type);

        };

        selectedArea.appendChild(chip);

    });

}

function updateCoverage(){

    const result=
        calculateCoverage(
            [...selectedTypes]
        );

    selectedCoverageInline.textContent=
        `カバー率 ${result.covered} / ${result.total} (${result.percent}%)`;

}
// ======================================
// Part 2 / 6
// マトリクス生成
// ======================================

function createMatrix(){

    matrixTable.innerHTML = "";

    const headerRow = document.createElement("tr");

    const corner = document.createElement("th");
    corner.textContent = "-";
    corner.className = "corner-cell";
    headerRow.appendChild(corner);

    TYPES.forEach(type=>{

        const th = document.createElement("th");

        th.textContent = type;

        th.className = TYPE_CLASS[type] + " col-header";

        headerRow.appendChild(th);

    });

    matrixTable.appendChild(headerRow);

    // -----------

    for(let row=-1; row<TYPES.length; row++){

        const tr = document.createElement("tr");

        const rowHeader =
            document.createElement("th");

        if(row==-1){

            rowHeader.textContent="-";

            rowHeader.className="corner-cell";

        }else{

            rowHeader.textContent=
                TYPES[row];

            rowHeader.className=
                TYPE_CLASS[TYPES[row]];

        }

        tr.appendChild(rowHeader);

        // ----------------

        for(let col=0; col<TYPES.length; col++){

            const td =
                document.createElement("td");

            // 左下は表示しない

            if(row>=0 && col<row){

                td.style.background="#f5f5f5";

                tr.appendChild(td);

                continue;

            }

            // 同タイプは存在しない

            if(row>=0 && row===col){

                td.textContent="－";

                td.style.color="#999";

                tr.appendChild(td);

                continue;

            }

            let defendTypes;

            // 単タイプ

            if(row==-1){

                defendTypes=[

                    TYPES[col]

                ];

            }
            // 複合タイプ

            else{

                defendTypes=[

                    TYPES[row],

                    TYPES[col]

                ];

            }

            const multiplier =
                getBestMultiplier(

                    [...selectedTypes],

                    defendTypes

                );

            td.textContent = formatMultiplier(multiplier);

            td.className =
                multiplierClass(
                    multiplier
                );

            td.dataset.types =
                defendTypes.join("・");

            td.dataset.multiplier =
                multiplier;

            td.onclick=()=>{

                showDetail(
                    defendTypes,
                    multiplier
                );

            };

            tr.appendChild(td);

        }

        matrixTable.appendChild(tr);

    }

    syncDetailPanelSize();

}

// -------------------------
// 詳細パネルのサイズをマトリクスに合わせる
// -------------------------

function syncDetailPanelSize(){

    if(window.innerWidth <= 960){

        detailPanel.style.maxWidth = "";
        detailPanel.style.maxHeight = "";

        return;

    }

    const rect = matrixPanel.getBoundingClientRect();

    detailPanel.style.maxWidth = rect.width + "px";
    detailPanel.style.maxHeight = rect.height + "px";

}
// ======================================
// Part 3 / 6
// 詳細表示
// ======================================

function showDetail(defendTypes, maxMultiplier){

    let html = "";

    html += "<h3>";
    html += defendTypes.join("・");
    html += "</h3>";

    html += "<hr>";

    html += "<p>";
    html += "<b>最大倍率 : ";
    html += maxMultiplier;
    html += "倍</b>";
    html += "</p>";

    // -------------------------

    const weak = [];
    const normal = [];
    const resist = [];
    const immune = [];

    TYPES.forEach(type=>{

        const value =
            getEffectiveness(
                type,
                defendTypes
            );

        if(value > 1){

            weak.push({
                type,
                value
            });

        }
        else if(value == 1){

            normal.push(type);

        }
        else if(value == 0){

            immune.push(type);

        }
        else{

            resist.push({
                type,
                value
            });

        }

    });

    // -------------------------

    html += "<h4>弱点</h4>";

    if(weak.length==0){

        html += "なし";

    }else{

        weak.forEach(item=>{

            html +=
                item.type +
                " (" +
                item.value +
                "倍)<br>";

        });

    }

    // -------------------------

    html += "<hr>";

    html += "<h4>半減</h4>";

    if(resist.length==0){

        html += "なし";

    }else{

        resist.forEach(item=>{

            html +=
                item.type +
                " (" +
                item.value +
                "倍)<br>";

        });

    }

    // -------------------------

    html += "<hr>";

    html += "<h4>無効</h4>";

    if(immune.length==0){

        html += "なし";

    }else{

        immune.forEach(type=>{

            html +=
                type +
                "<br>";

        });

    }

    detailArea.innerHTML = html;

}
// ======================================
// Part 4 / 6
// 選択セル・表示改善
// ======================================

// ----------------------------
// セル選択
// ----------------------------

function selectCell(cell){

    if(selectedCell){

        selectedCell.style.outline = "";
        selectedCell.style.outlineOffset = "";

    }

    selectedCell = cell;

    selectedCell.style.outline = "3px solid #2563eb";
    selectedCell.style.outlineOffset = "-3px";

}

// ----------------------------
// 倍率文字表示
// ----------------------------

function formatMultiplier(value){

    switch(value){

        case 4:
            return "4";

        case 2:
            return "2";

        case 1:
            return "1";

        case 0.5:
            return "0.5";

        case 0.25:
            return "0.25";

        case 0:
            return "0";

        default:
            return value;

    }

}

// ----------------------------
// 詳細タイトル
// ----------------------------

function createDetailTitle(defendTypes){

    if(defendTypes.length===1){

        return defendTypes[0];

    }

    return defendTypes[0] + "・" + defendTypes[1];

}
// ======================================
// Part 5 / 6
// 詳細表示改善
// ======================================

function createTypeGrid(title, list){

    let html = "";

    html += "<div class='detail-group-title'>";
    html += title;
    html += "</div>";

    if(list.length === 0){

        return html + "なし";

    }

    html += "<div class='detail-grid'>";

    list.forEach(item=>{

        html +=
            "<div class='detail-cell " +
            multiplierClass(item.value) +
            "'><span>" +
            item.type +
            "</span><span class='detail-value'>" +
            formatMultiplier(item.value) +
            "倍</span></div>";

    });

    html += "</div>";

    return html;

}

// ======================================
// showDetail 上書き版
// ======================================

function showDetail(defendTypes, maxMultiplier){

    const weak = [];
    const normal = [];
    const resist = [];
    const immune = [];

    TYPES.forEach(type=>{

        const value =
            getEffectiveness(
                type,
                defendTypes
            );

        if(value > 1){

            weak.push({
                type:type,
                value:value
            });

        }
        else if(value === 1){

            normal.push({
                type:type,
                value:value
            });

        }
        else if(value === 0){

            immune.push({
                type:type,
                value:value
            });

        }
        else{

            resist.push({
                type:type,
                value:value
            });

        }

    });

    let html = "";

    html += "<h3>";
    html += createDetailTitle(defendTypes);
    html += "</h3>";

    html += "<hr>";

    html +=
        "<b>最大倍率：</b>" +
        formatMultiplier(maxMultiplier) +
        "倍";

    html += createTypeGrid("弱点", weak);

    html += createTypeGrid("等倍", normal);

    html += createTypeGrid("半減", resist);

    html += createTypeGrid("無効", immune);

    html += "<hr>";

    const pokemonNote =
        defendTypes.length === 1
            ? "(最終進化形・単タイプのみ)"
            : "(最終進化形のみ)";

    html += "<div class='detail-group-title'>該当するポケモン"+pokemonNote+"</div>";
    html += "<div id='pokemon-list' class='pokemon-list'>読み込み中...</div>";
    html += "<p class='external-note'>※外部サービス(PokeAPI)から取得し、進化系統の最終形態のみを表示しています。表示に時間がかかったり、取得できない場合があります。</p>";

    detailArea.innerHTML = html;

    loadPokemonList(defendTypes);

}
// ======================================
// Part 6 / 6
// Ver0.6 Finish
// ======================================

// ----------------------------
// 初期詳細表示
// ----------------------------

function showWelcome(){

    detailArea.innerHTML = `
        <h3>Pokemon Type Analyzer</h3>

        <hr>

        <p>
            攻撃タイプを選択してください。
        </p>

        <p>
            表のセルをクリックすると、
            右側に詳細が表示されます。
        </p>

        <hr>

        <b>倍率表示</b>

        <table style="
            margin-top:10px;
            border-collapse:collapse;
            width:100%;
        ">

            <tr>
                <td class="multiplier4">4</td>
                <td>4倍</td>
            </tr>

            <tr>
                <td class="multiplier2">2</td>
                <td>2倍</td>
            </tr>

            <tr>
                <td class="multiplier1">1</td>
                <td>等倍</td>
            </tr>

            <tr>
                <td class="multiplier05">0.5</td>
                <td>半減</td>
            </tr>

            <tr>
                <td class="multiplier025">0.25</td>
                <td>1/4</td>
            </tr>

            <tr>
                <td class="multiplier0">0</td>
                <td>無効</td>
            </tr>

        </table>
    `;

}

// ----------------------------
// 初回表示
// ----------------------------

showWelcome();


// ----------------------------
// Escapeキーで選択解除
// ----------------------------

document.addEventListener("keydown",event=>{

    if(event.key !== "Escape"){

        return;

    }

    if(selectedCell){

        selectedCell.style.outline="";

        selectedCell.style.outlineOffset="";

        selectedCell=null;

    }

    showWelcome();

});


// ----------------------------
// リサイズ時再描画
// ----------------------------

window.addEventListener("resize",()=>{

    createMatrix();

});


// ----------------------------
// リフレッシュを上書き
// ----------------------------

function refresh(){

    updateSelectedTypes();

    updateCoverage();

    createMatrix();

    if(selectedCell===null){

        showWelcome();

    }

}

// ======================================
// PokeAPI 連携
// 該当ポケモン一覧の取得
// ======================================

async function loadPokemonList(defendTypes){

    const requestId = ++pokemonListRequestId;

    const listEl = document.getElementById("pokemon-list");

    try{

        const apiTypes = defendTypes.map(type=>TYPE_CLASS[type]);

        const responses = await Promise.all(
            apiTypes.map(slug=>

                fetch("https://pokeapi.co/api/v2/type/"+slug)
                    .then(res=>res.json())

            )
        );

        if(requestId !== pokemonListRequestId) return;

        let pokemonNames;

        if(responses.length === 1){

            pokemonNames = responses[0].pokemon.map(p=>p.pokemon.name);

        }else{

            const namesB = new Set(
                responses[1].pokemon.map(p=>p.pokemon.name)
            );

            pokemonNames = responses[0].pokemon
                .map(p=>p.pokemon.name)
                .filter(name=>namesB.has(name));

        }

        if(pokemonNames.length === 0){

            listEl.textContent = "該当するポケモンが見つかりませんでした。";

            return;

        }

        const requireSingleType = defendTypes.length === 1;

        const infos = await mapWithConcurrencyLimit(
            pokemonNames,
            8,
            name=>fetchSpeciesInfo(name, requireSingleType)
        );

        if(requestId !== pokemonListRequestId) return;

        const finalOnly = infos.filter(info=>info && info.isFinal);

        if(finalOnly.length === 0){

            listEl.textContent = "該当する最終進化形のポケモンが見つかりませんでした。";

            return;

        }

        const uniqueNames = [...new Set(
            finalOnly.map(info=>info.name)
        )];

        const displayNames = uniqueNames.slice(0, 24);

        listEl.innerHTML = displayNames
            .map(name=>"<span class='pokemon-chip'>"+name+"</span>")
            .join("");

        const remaining = uniqueNames.length - displayNames.length;

        if(remaining > 0){

            listEl.innerHTML +=
                "<span class='pokemon-chip more'>他"+remaining+"匹</span>";

        }

    }catch(e){

        if(requestId !== pokemonListRequestId) return;

        listEl.textContent = "ポケモン一覧の取得に失敗しました(通信環境をご確認ください)。";

    }

}

// 同時リクエスト数を制限しながらmapする
// (モバイル回線等での大量同時リクエストによる失敗・遅延を防ぐ)
async function mapWithConcurrencyLimit(items, limit, fn){

    const results = new Array(items.length);
    let index = 0;

    async function worker(){

        while(index < items.length){

            const current = index++;

            results[current] = await fn(items[current]);

        }

    }

    const workerCount = Math.min(limit, items.length);

    const workers = [];

    for(let i=0; i<workerCount; i++){

        workers.push(worker());

    }

    await Promise.all(workers);

    return results;

}

// evolution-chain のURLごとにキャッシュ(同じ進化系統の再取得を防ぐ)
const evolutionChainCache = new Map();

function findEvolutionNode(node, targetName){

    if(node.species.name === targetName) return node;

    for(const child of node.evolves_to){

        const found = findEvolutionNode(child, targetName);

        if(found) return found;

    }

    return null;

}

async function isFinalEvolution(speciesData){

    const chainUrl = speciesData.evolution_chain.url;

    if(!evolutionChainCache.has(chainUrl)){

        evolutionChainCache.set(
            chainUrl,
            fetch(chainUrl).then(res=>res.json())
        );

    }

    const chainData = await evolutionChainCache.get(chainUrl);

    const node = findEvolutionNode(chainData.chain, speciesData.name);

    // 系統内で見つからない場合は安全側(表示する)に倒す
    return node ? node.evolves_to.length === 0 : true;

}

async function fetchSpeciesInfo(name, requireSingleType){

    try{

        // 単タイプ検索の場合、複合タイプ持ちのポケモンは除外する
        if(requireSingleType){

            const pokeRes = await fetch(
                "https://pokeapi.co/api/v2/pokemon/"+name
            );

            if(pokeRes.ok){

                const pokeData = await pokeRes.json();

                if(pokeData.types.length > 1) return null;

            }

        }

        let res = await fetch(
            "https://pokeapi.co/api/v2/pokemon-species/"+name
        );

        // メガシンカ・リージョンフォーム等はベース種名で再試行
        if(!res.ok){

            const base = name.split("-")[0];

            res = await fetch(
                "https://pokeapi.co/api/v2/pokemon-species/"+base
            );

        }

        if(!res.ok) return null;

        const data = await res.json();

        const jaEntry =
            data.names.find(n=>n.language.name === "ja-Hrkt") ||
            data.names.find(n=>n.language.name === "ja");

        const isFinal = await isFinalEvolution(data);

        return {
            name: jaEntry ? jaEntry.name : name,
            isFinal: isFinal
        };

    }catch(e){

        return null;

    }

}