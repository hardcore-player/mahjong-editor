/**

 * 每日高难关卡编辑器 — 旧 UI 兼容补丁（普通牌 + 暗牌）

 */

(function () {

    'use strict';



    if (typeof LevelDocument === 'undefined') {

        console.error('LevelDocument 未加载');

        return;

    }



    let levelDoc = null;

    let validationIssues = [];

    let highlightIssueIds = new Set();

    let selectedTypeId = 1;

    let showTypeIdDebug = false;

    const faceImages = new Map();

    let backImage = null;

    const AUTOSAVE_KEY = 'mjDailyEditor.v1';



    const orig = {

        loadFromEditorJSON: typeof loadFromEditorJSON === 'function' ? loadFromEditorJSON : null,

        exportJSON: typeof exportJSON === 'function' ? exportJSON : null,

        serializeState: typeof serializeState === 'function' ? serializeState : null,

        restoreState: typeof restoreState === 'function' ? restoreState : null,

        draw: typeof draw === 'function' ? draw : null,

        paintAt: typeof paintAt === 'function' ? paintAt : null,

        pushHistory: typeof pushHistory === 'function' ? pushHistory : null,

        scheduleAutosave: typeof scheduleAutosave === 'function' ? scheduleAutosave : null,

        drawTile: typeof drawTile === 'function' ? drawTile : null,

        addLayer: typeof addLayer === 'function' ? addLayer : null,

    };



    function pad2(n) {

        return String(n).padStart(2, '0');

    }



    function preloadFaces() {

        for (let i = 1; i <= 31; i++) {

            const img = new Image();

            img.onerror = () => { img._failed = true; };

            img.src = `assets/tile-faces/${pad2(i)}.png`;

            faceImages.set(i, img);

        }

        backImage = new Image();

        backImage.onerror = () => { backImage._failed = true; };

        backImage.src = 'assets/tile-faces/back.png';

    }



    function hideUnsupportedUI() {

        document.title = '每日高难关卡编辑器（普通牌 + 暗牌）';

        const brand = document.querySelector('.brand');

        if (brand) brand.textContent = '每日高难关卡编辑器（普通牌 + 暗牌）';



        ['spitter', 'disc', 'rotation'].forEach((b) => {

            const el = document.querySelector(`.brush-btn[data-brush="${b}"]`);

            if (el) el.remove();

        });

        ['spitterPanel', 'discPanel', 'rotationPanel'].forEach((id) => {

            const el = document.getElementById(id);

            if (el) el.remove();

        });



        const cardGen = document.getElementById('cardGen');

        if (cardGen) cardGen.style.display = 'none';



        const preview = document.getElementById('previewPanel');

        if (preview) preview.style.display = 'none';



        const brushGroup = document.querySelector('#cardBrush .brush-group');

        if (brushGroup && !document.querySelector('.brush-btn[data-brush="eraser"]')) {

            const eraser = document.createElement('div');

            eraser.className = 'brush-btn';

            eraser.dataset.brush = 'eraser';

            eraser.textContent = '🧹 橡皮';

            eraser.onclick = () => setBrush('eraser');

            brushGroup.appendChild(eraser);

        }

    }



    function buildTypeIdPanel() {

        if (document.getElementById('dailyTypeIdPanel')) return;

        const el = document.createElement('div');

        el.id = 'dailyTypeIdPanel';

        el.className = 'card';

        el.innerHTML =

            '<div class="card-head">花色选择</div>' +

            '<div class="card-body">' +

            '<div id="dailyFaceGrid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;max-height:180px;overflow:auto;"></div>' +

            '<div class="row-btns" style="margin-top:8px;">' +

            '<button class="sbtn block" id="dailyAutoAssignBtn">自动分配花色</button>' +

            '<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--sub);">' +

            '<input type="checkbox" id="dailyShowTypeIdDbg"> 显示 typeId（调试）</label>' +

            '</div></div>';

        const sidebar = document.querySelector('.sidebar');

        const brushCard = document.getElementById('cardBrush');

        if (brushCard?.nextSibling) sidebar.insertBefore(el, brushCard.nextSibling);

        else sidebar.appendChild(el);



        const grid = document.getElementById('dailyFaceGrid');

        for (let i = 1; i <= 31; i++) {

            const item = document.createElement('div');

            item.dataset.typeId = String(i);

            item.title = `typeId=${i}`;

            item.style.cssText =

                'border:2px solid transparent;border-radius:4px;padding:2px;cursor:pointer;background:#fff;';

            const img = document.createElement('img');

            img.src = `assets/tile-faces/${pad2(i)}.png`;

            img.alt = String(i);

            img.style.cssText = 'width:100%;display:block;';

            img.onerror = () => { img.style.background = '#ccc'; };

            item.appendChild(img);

            item.onclick = () => selectTypeId(i);

            grid.appendChild(item);

        }

        selectTypeId(1);

        document.getElementById('dailyAutoAssignBtn').onclick = runAutoAssign;

        document.getElementById('dailyShowTypeIdDbg').onchange = (e) => {

            showTypeIdDebug = e.target.checked;

            draw();

        };

    }



    function selectTypeId(id) {

        selectedTypeId = id;

        document.querySelectorAll('#dailyFaceGrid [data-type-id]').forEach((el) => {

            el.style.borderColor = parseInt(el.dataset.typeId, 10) === id ? 'var(--accent)' : 'transparent';

        });

    }



    function updateStatsPanel() {

        let el = document.getElementById('dailyStatsPanel');

        if (!el) {

            el = document.createElement('div');

            el.id = 'dailyStatsPanel';

            el.className = 'card';

            el.innerHTML =

                '<div class="card-head">关卡统计</div><div class="card-body" id="dailyStatsBody"></div>';

            const sidebar = document.querySelector('.sidebar');

            sidebar.insertBefore(el, sidebar.children[1] || null);

        }

        if (!levelDoc) {

            document.getElementById('dailyStatsBody').textContent = '未加载关卡';

            return;

        }

        levelDoc.mergeEditableFromLayers(state.layers);

        try {

            const st = levelDoc.getStats();

            document.getElementById('dailyStatsBody').innerHTML =

                `总牌数 ${st.totalTiles}<br>totalPairs ${st.totalPairs}<br>层数 ${st.layerCount}<br>花色 ${st.typeKindCount}<br>暗牌 ${st.darkCount}`;

        } catch (_) {

            document.getElementById('dailyStatsBody').textContent = '统计暂不可用（请先完善关卡）';

        }

    }



    function renderValidationPanel() {

        let el = document.getElementById('dailyValidatePanel');

        if (!el) {

            el = document.createElement('div');

            el.id = 'dailyValidatePanel';

            el.className = 'card';

            el.innerHTML =

                '<div class="card-head">校验 <button class="sbtn" id="dailyValidateBtn" style="margin-left:auto">运行</button></div><div class="card-body" id="dailyValidateBody" style="max-height:160px;overflow:auto;font-size:11px;"></div>';

            document.querySelector('.sidebar').appendChild(el);

            document.getElementById('dailyValidateBtn').onclick = runValidation;

        }

        const body = document.getElementById('dailyValidateBody');

        if (!validationIssues.length) {

            body.textContent = '点击「运行」执行校验';

            return;

        }

        body.innerHTML = validationIssues

            .map((iss) => {

                const cls =

                    iss.severity === 'ERROR' ? 'color:var(--danger)'

                    : iss.severity === 'WARNING' ? 'color:#b8860b'

                    : 'color:var(--sub)';

                const click =

                    iss.tileIds?.length ?

                        ` style="cursor:pointer;text-decoration:underline" onclick="window.__dailyHighlightIssue(${JSON.stringify(iss.tileIds)})"`

                    :   '';

                return `<div style="${cls}"${click}>${iss.severity} ${iss.code}: ${iss.message}</div>`;

            })

            .join('');

    }



    window.__dailyHighlightIssue = function (ids) {

        highlightIssueIds = new Set(ids || []);

        draw();

    };



    function runValidation() {
        if (!levelDoc || typeof DailyValidation === 'undefined') return;
        levelDoc.mergeEditableFromLayers(state.layers);
        let json;
        try {
            json = levelDoc.exportJson();
        } catch (e) {
            validationIssues = [{ severity: 'ERROR', code: 'export', message: String(e.message || e), tileIds: [] }];
            renderValidationPanel();
            return;
        }
        const result = DailyValidation.validateLevel(json, true);
        validationIssues = result.issues || [];
        renderValidationPanel();
        draw();
    }



    function runAutoAssign() {

        if (!levelDoc || typeof DailyAutoAssign === 'undefined') return;

        const before = serializeState();

        levelDoc.mergeEditableFromLayers(state.layers);

        let json;

        try {

            json = levelDoc.exportJson();

        } catch (e) {

            toast('自动分配失败：' + e.message, 'err');

            return;

        }

        DailyAutoAssign.autoAssignTypeIds(json, { typeKindCount: 16, seed: Date.now() });

        for (const t of json.tiles ?? []) {

            const patch = levelDoc.editedById.get(t.id) || {};

            levelDoc.editedById.set(t.id, { ...patch, typeId: t.typeId });

        }

        for (const t of levelDoc.addedTiles) {

            const nt = (json.tiles ?? []).find((x) => x.id === t.id);

            if (nt) t.typeId = nt.typeId;

        }

        levelDoc.markDirty();

        state.layers = levelDoc.buildEditableLayers();

        pushHistory(before);

        updateStatsPanel();

        draw();

        toast('已自动分配花色', 'ok');

    }



    function applyLevelDocument(doc) {

        levelDoc = doc;

        state.layers = doc.buildEditableLayers();

        state.discs = [];

        state.currentLayer = 0;

        if (state.currentLayer >= state.layers.length) state.currentLayer = state.layers.length - 1;

        updateStatsPanel();

        validationIssues = [];

        renderValidationPanel();

        updateUI();

        updateLegend();

        draw();

    }



    window.loadFromEditorJSON = function (json) {

        const check = LevelDocument.checkImportAllowed(json);

        if (!check.ok) {

            toast(check.message, 'err');

            return;

        }

        const before = serializeState();

        applyLevelDocument(LevelDocument.fromJson(json));

        pushHistory(before);

        updateUndoButtons();

    };



    window.exportJSON = function () {

        if (!levelDoc) {

            toast('请先导入或新建关卡', 'err');

            return;

        }

        levelDoc.mergeEditableFromLayers(state.layers);

        let json;

        try {

            json = levelDoc.exportJson();

        } catch (e) {

            toast('导出失败：' + e.message, 'err');

            return;

        }

        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });

        const a = document.createElement('a');

        a.href = URL.createObjectURL(blob);

        a.download = `level_${json.levelId || 'draft'}.json`;

        a.click();

        toast('已导出 LevelPack JSON', 'ok');

    };



    window.importJSON = function (e) {

        const file = e.target.files[0];

        if (!file) return;

        const reader = new FileReader();

        reader.onload = (event) => {

            try {

                const json = JSON.parse(event.target.result);

                loadFromEditorJSON(json);

                if (LevelDocument.checkImportAllowed(json).ok) toast('导入成功', 'ok');

            } catch (err) {

                toast('导入失败: ' + err.message, 'err');

            }

        };

        reader.readAsText(file);

        e.target.value = '';

    };



    window.serializeState = function () {

        if (levelDoc) levelDoc.mergeEditableFromLayers(state.layers);

        return JSON.stringify({

            layers: state.layers,

            currentLayer: state.currentLayer,

            selectedTypeId,

            doc: levelDoc ?

                {

                    raw: levelDoc.raw,

                    edited: [...levelDoc.editedById.entries()],

                    added: levelDoc.addedTiles,

                    deleted: [...levelDoc.deletedIds],

                    dirty: levelDoc.dirty,

                    sourceFile: levelDoc.sourceFile,

                }

            :   null,

        });

    };



    window.restoreState = function (jsonStr) {

        const obj = JSON.parse(jsonStr);

        state.layers = obj.layers || [{ tiles: {} }];

        state.currentLayer = obj.currentLayer || 0;

        state.discs = [];

        selectedTypeId = obj.selectedTypeId || 1;

        if (obj.doc) {

            levelDoc = LevelDocument.fromJson(obj.doc.raw, obj.doc.sourceFile);

            levelDoc.editedById = new Map(obj.doc.edited || []);

            levelDoc.addedTiles = obj.doc.added || [];

            levelDoc.deletedIds = new Set(obj.doc.deleted || []);

            levelDoc.dirty = !!obj.doc.dirty;

        }

        selectTypeId(selectedTypeId);

        updateStatsPanel();

        updateUI();

        updateLegend();

        draw();

    };



    function drawTileFaces(col, row, layerIdx, tile) {

        if (!tile || tile.type === 'spitter' || tile.type === 'spitterQueue') return;



        const dCol = col + DISPLAY_OFFSET_COL;

        const dRow = row + DISPLAY_OFFSET_ROW;

        const x = BOARD_PAD + dCol * CELL - layerIdx * 3;

        const y = BOARD_PAD + worldTopPad() + dRow * CELL - layerIdx * 3;

        const w = TILE * CELL;

        const h = TILE * CELL;

        const pad = 2;

        const innerX = x + pad + CELL * 0.15;

        const innerY = y + pad + CELL * 0.15;

        const innerW = w - 2 * pad - CELL * 0.3;

        const innerH = h - 2 * pad - CELL * 0.3;



        ctx.save();



        if (tile.type === 'dark') {

            if (backImage && backImage.complete && backImage.naturalWidth && !backImage._failed) {

                ctx.drawImage(backImage, innerX, innerY, innerW, innerH);

            } else {

                ctx.fillStyle = '#3d4a6b';

                ctx.fillRect(innerX, innerY, innerW, innerH);

                ctx.strokeStyle = '#9ab0d8';

                ctx.lineWidth = 1;

                ctx.beginPath();

                ctx.moveTo(innerX, innerY);

                ctx.lineTo(innerX + innerW, innerY + innerH);

                ctx.moveTo(innerX + innerW, innerY);

                ctx.lineTo(innerX, innerY + innerH);

                ctx.stroke();

            }

            if (showTypeIdDebug && tile.typeId != null) {

                ctx.fillStyle = '#fff';

                ctx.font = `bold ${CELL * 0.35}px monospace`;

                ctx.textAlign = 'center';

                ctx.textBaseline = 'middle';

                ctx.fillText(String(tile.typeId), x + w / 2, y + h / 2);

            }

        } else if (tile.type === 'normal' && tile.typeId != null) {

            const faceId = LevelDocument.normalizeFaceId(tile.typeId);

            const img = faceImages.get(faceId);

            if (img && img.complete && img.naturalWidth && !img._failed) {

                ctx.drawImage(img, innerX, innerY, innerW, innerH);

            } else {

                ctx.fillStyle = '#ddd';

                ctx.fillRect(innerX, innerY, innerW, innerH);

                ctx.fillStyle = '#666';

                ctx.font = `${CELL * 0.35}px sans-serif`;

                ctx.textAlign = 'center';

                ctx.textBaseline = 'middle';

                ctx.fillText('?', x + w / 2, y + h / 2);

            }

            if (showTypeIdDebug || state.showTypeId) {

                ctx.fillStyle = 'rgba(0,0,0,0.55)';

                ctx.font = `bold ${CELL * 0.32}px monospace`;

                ctx.textAlign = 'center';

                ctx.textBaseline = 'bottom';

                ctx.fillText(String(tile.typeId), x + w / 2, y + h - pad - 2);

            }

        }



        ctx.restore();

    }



    window.drawTile = function (col, row, layerIdx, tile, isCurrent, isHover, isIssue) {

        orig.drawTile.call(this, col, row, layerIdx, tile, isCurrent, isHover, isIssue);

        if (tile && (tile.type === 'normal' || tile.type === 'dark')) {

            drawTileFaces(col, row, layerIdx, tile);

        }

    };



    window.draw = function () {

        orig.draw.apply(this, arguments);

        if (highlightIssueIds.size && levelDoc) {

            try {

                for (const t of levelDoc.exportJson().tiles ?? []) {

                    if (highlightIssueIds.has(t.id)) {

                        drawTile(t.col, t.row, t.layer, {

                            type: t.isDark ? 'dark' : 'normal',

                            typeId: t.typeId,

                        }, false, false, true);

                    }

                }

            } catch (_) { /* mid-edit */ }

        }

    };



    window.paintAt = function (col, row) {

        if (state.brush === 'eraser') {

            const layer = state.layers[state.currentLayer];

            const key = `${row},${col}`;

            const mcol = mirrorCol(col, state.currentLayer);

            const mkey = `${row},${mcol}`;

            delete layer.tiles[key];

            if (state.symmetric && mcol !== col) delete layer.tiles[mkey];

            draw();

            updateUI();

            return;

        }

        if (state.brush === 'spitter' || state.brush === 'disc' || state.brush === 'rotation') return;

        orig.paintAt.call(this, col, row);

        const layer = state.layers[state.currentLayer];

        const key = `${row},${col}`;

        const cell = layer.tiles[key];

        if (cell && (cell.type === 'normal' || cell.type === 'dark') && cell.typeId == null && state.brush === 'normal') {

            cell.typeId = selectedTypeId;

        }

        const mcol = mirrorCol(col, state.currentLayer);

        if (state.symmetric && mcol !== col) {

            const mcell = layer.tiles[`${row},${mcol}`];

            if (mcell && mcell.type === 'normal' && mcell.typeId == null) {

                mcell.typeId = selectedTypeId;

            }

        }

    };



    window.pushHistory = function (beforeSnapshot) {

        orig.pushHistory.call(this, beforeSnapshot);

        updateStatsPanel();

    };



    window.scheduleAutosave = function () {

        clearTimeout(window.__dailyAutosaveTimer);

        window.__dailyAutosaveTimer = setTimeout(() => {

            try {

                localStorage.setItem(AUTOSAVE_KEY, serializeState());

            } catch (_) {}

        }, 400);

        if (orig.scheduleAutosave) orig.scheduleAutosave();

    };



    window.setBrush = function (brush) {

        if (brush === 'spitter' || brush === 'disc' || brush === 'rotation') return;

        state.brush = brush;

        document.querySelectorAll('.brush-btn').forEach((b) => b.classList.toggle('active', b.dataset.brush === brush));

    };



    window.addLayer = function () {

        if (state.layers.length > LevelDocument.MAX_LAYER) {

            toast(`最多支持 L0～L${LevelDocument.MAX_LAYER}`, 'err');

            return;

        }

        orig.addLayer.call(this);

    };



    window.dailyEditorBootstrap = function () {

        window.checkNewVersion = function () {};

        hideUnsupportedUI();

        buildTypeIdPanel();

        preloadFaces();

        renderValidationPanel();



        try {

            const saved = localStorage.getItem(AUTOSAVE_KEY);

            if (saved) {

                restoreState(saved);

                toast('已恢复本地草稿', 'ok');

            } else {

                levelDoc = LevelDocument.fromJson({

                    levelId: 90001,

                    totalPairs: 0,

                    tiles: [],

                    specialTiles: [],

                    discs: [],

                    rotation: null,

                });

                applyLevelDocument(levelDoc);

            }

        } catch (_) {

            /* ignore */

        }



        window.init = function () {

            updateUI();

            updateLegend();

            resizeCanvas();

            fitView();

            updateUndoButtons();

        };

        init();

    };



    window.__getLevelDocument = () => levelDoc;

    window.__getEditorExportJson = () => {

        if (!levelDoc) return null;

        levelDoc.mergeEditableFromLayers(state.layers);

        return levelDoc.exportJson();

    };

    window.__checkImportAllowed = (json) => LevelDocument.checkImportAllowed(json);

})();


