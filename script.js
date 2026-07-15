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

const typeList = document.getElementById("type-list");
const selectedArea = document.getElementById("selected-types");
const selectedCountArea = document.getElementById("selected-count");
const selectedCoverageInline = document.getElementById("selected-coverage-inline");
const matrixTable = document.getElementById("matrix-table");
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

        th.className = TYPE_CLASS[type];

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

    detailArea.innerHTML = html;

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