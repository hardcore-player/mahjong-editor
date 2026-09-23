/**
 * 每日高难关卡编辑器 — 旧 UI 兼容补丁（普通牌 + 暗牌）
 * 策划只编辑布局与暗牌；花色由 backwardFill + replay 生成
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
    let devDebugMode = false;
    const faceImages = new Map();
    let backImage = null;
    const AUTOSAVE_KEY = 'mjDailyEditor.v1';

    const SOLVABLE_STATUS = {
        NONE: 'none',
        GENERATED: 'generated',
        VERIFIED: 'verified',
        FAILED: 'failed',
        STALE: 'layout_stale',
    };

    const STATUS_LABEL = {
        none: '尚未生成',
        generated: '已生成，待验证',
        verified: '已验证可解',
        failed: '生成失败',
        layout_stale: '布局已修改，需要重新生成',
    };

    let solvableState = {
        status: SOLVABLE_STATUS.NONE,
        layoutFingerprint: null,
        solution: null,
        seed: null,
        lastError: null,
    };

    let typeAssignPast = [];
    let typeAssignFuture = [];

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

        const typeIdToggle = document.getElementById('typeIdToggle');
        if (typeIdToggle) typeIdToggle.style.display = 'none';

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

    function buildSolvablePanel() {
        if (document.getElementById('dailySolvablePanel')) return;
        const el = document.createElement('div');
        el.id = 'dailySolvablePanel';
        el.className = 'card';
        el.innerHTML =
            '<div class="card-head">关卡完成</div>' +
            '<div class="card-body">' +
            '<div id="dailySolvableStatus" style="font-size:12px;margin-bottom:8px;padding:8px;border-radius:6px;background:#f6ecd8;color:var(--accent2);">尚未生成</div>' +
            '<button class="sbtn block" id="dailyGenerateSolvableBtn" style="font-weight:600;">生成可解花色</button>' +
            '<div id="dailySolvableHint" style="font-size:10px;color:var(--sub);margin-top:6px;">布局完成后点击生成；验证通过后才可导出。</div>' +
            '</div>';
        const sidebar = document.querySelector('.sidebar');
        sidebar.insertBefore(el, sidebar.firstChild);
        document.getElementById('dailyGenerateSolvableBtn').onclick = runGenerateSolvable;
    }

    function buildDevDebugPanel() {
        if (document.getElementById('dailyDevDebugPanel')) return;
        const el = document.createElement('div');
        el.id = 'dailyDevDebugPanel';
        el.className = 'card';
        el.style.display = 'none';
        el.innerHTML =
            '<div class="card-head">开发调试模式</div>' +
            '<div class="card-body">' +
            '<div id="dailyTypeIdPanel">' +
            '<div style="font-size:11px;color:var(--sub);margin-bottom:6px;">花色选择（调试）</div>' +
            '<div id="dailyFaceGrid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;max-height:180px;overflow:auto;"></div>' +
            '<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--sub);">' +
            '<input type="checkbox" id="dailyShowTypeIdDbg"> 显示 typeId（调试）</label>' +
            '</div></div>';
        document.querySelector('.sidebar').appendChild(el);

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
        document.getElementById('dailyShowTypeIdDbg').onchange = (e) => {
            showTypeIdDebug = e.target.checked;
            draw();
        };

        const toggle = document.createElement('div');
        toggle.className = 'chip';
        toggle.id = 'dailyDevDebugToggle';
        toggle.title = '显示开发调试面板';
        toggle.innerHTML = '<span class="dot"></span>调试';
        toggle.onclick = () => {
            devDebugMode = !devDebugMode;
            toggle.classList.toggle('on', devDebugMode);
            el.style.display = devDebugMode ? '' : 'none';
        };
        const topbar = document.querySelector('.topbar');
        if (topbar) topbar.appendChild(toggle);
    }

    function selectTypeId(id) {
        selectedTypeId = id;
        document.querySelectorAll('#dailyFaceGrid [data-type-id]').forEach((el) => {
            el.style.borderColor = parseInt(el.dataset.typeId, 10) === id ? 'var(--accent)' : 'transparent';
        });
    }

    function getCurrentLayoutFingerprint() {
        if (!levelDoc || typeof DailySolvableFill === 'undefined') return null;
        try {
            levelDoc.mergeEditableFromLayers(state.layers);
            const json = levelDoc.exportJson();
            return DailySolvableFill.computeLayoutFingerprint(json);
        } catch (_) {
            return null;
        }
    }

    function updateSolvableStatusUI() {
        const statusEl = document.getElementById('dailySolvableStatus');
        const btn = document.getElementById('dailyGenerateSolvableBtn');
        if (!statusEl) return;

        const label = STATUS_LABEL[solvableState.status] || solvableState.status;
        statusEl.textContent = solvableState.lastError && solvableState.status === SOLVABLE_STATUS.FAILED
            ? `${label}：${solvableState.lastError}`
            : label;

        const colors = {
            none: { bg: '#f0f0f0', color: 'var(--sub)' },
            generated: { bg: '#fff3cd', color: '#856404' },
            verified: { bg: '#d4edda', color: 'var(--ok)' },
            failed: { bg: '#f8d7da', color: 'var(--danger)' },
            layout_stale: { bg: '#ffe8cc', color: '#b45309' },
        };
        const c = colors[solvableState.status] || colors.none;
        statusEl.style.background = c.bg;
        statusEl.style.color = c.color;

        if (btn) {
            btn.disabled = false;
            btn.textContent = solvableState.status === SOLVABLE_STATUS.VERIFIED ? '重新生成可解花色' : '生成可解花色';
        }
    }

    function resetSolvableState(next) {
        solvableState = {
            status: next?.status ?? SOLVABLE_STATUS.NONE,
            layoutFingerprint: next?.layoutFingerprint ?? null,
            solution: next?.solution ?? null,
            seed: next?.seed ?? null,
            lastError: next?.lastError ?? null,
        };
        updateSolvableStatusUI();
    }

    function markLayoutStaleIfNeeded() {
        if (!solvableState.layoutFingerprint) return;
        const fp = getCurrentLayoutFingerprint();
        if (fp == null) return;
        if (fp !== solvableState.layoutFingerprint) {
            if (
                solvableState.status === SOLVABLE_STATUS.VERIFIED ||
                solvableState.status === SOLVABLE_STATUS.GENERATED
            ) {
                solvableState.status = SOLVABLE_STATUS.STALE;
                solvableState.lastError = null;
                updateSolvableStatusUI();
            }
        }
    }

    function afterLayoutEdit() {
        if (levelDoc) {
            levelDoc.mergeEditableFromLayers(state.layers);
            syncDocIdsToLayers();
        }
        markLayoutStaleIfNeeded();
        updateStatsPanel();
        scheduleAutosave();
    }

    function captureGeometrySignature() {
        const tiles = [];
        state.layers.forEach((layer, layerIdx) => {
            Object.entries(layer?.tiles || {}).forEach(([key, cell]) => {
                const [row, col] = key.split(',').map(Number);
                tiles.push({
                    id: cell._docId ?? null,
                    layer: layerIdx,
                    row,
                    col,
                    isDark: cell.type === 'dark',
                });
            });
        });
        tiles.sort(
            (a, b) =>
                a.layer - b.layer
                || a.row - b.row
                || a.col - b.col
                || (a.id ?? 0) - (b.id ?? 0),
        );
        return JSON.stringify(tiles);
    }

    function countBoardTiles() {
        let n = 0;
        state.layers.forEach((layer) => {
            n += Object.keys(layer?.tiles || {}).length;
        });
        return n;
    }

    function captureTypeIdMap() {
        const map = {};
        state.layers.forEach((layer) => {
            Object.values(layer?.tiles || {}).forEach((cell) => {
                if (cell?._docId != null) map[cell._docId] = cell.typeId ?? null;
            });
        });
        return map;
    }

    function applyTypeIdMap(map) {
        state.layers.forEach((layer) => {
            Object.values(layer?.tiles || {}).forEach((cell) => {
                if (cell?._docId != null && Object.prototype.hasOwnProperty.call(map, cell._docId)) {
                    cell.typeId = map[cell._docId];
                }
            });
        });
        if (levelDoc) levelDoc.applyTypeIdsOnly(map);
    }

    function syncDocIdsToLayers() {
        if (!levelDoc) return;
        for (const t of levelDoc.addedTiles) {
            const key = `${t.row},${t.col}`;
            const cell = state.layers[t.layer]?.tiles?.[key];
            if (cell) cell._docId = t.id;
        }
        for (const [id, patch] of levelDoc.editedById) {
            const key = `${patch.row},${patch.col}`;
            const cell = state.layers[patch.layer]?.tiles?.[key];
            if (cell) cell._docId = id;
        }
    }

    function applyTypeIdsToLayersOnly(assignmentById) {
        state.layers.forEach((layer) => {
            Object.values(layer?.tiles || {}).forEach((cell) => {
                if (cell?._docId != null && assignmentById[cell._docId] != null) {
                    cell.typeId = assignmentById[cell._docId];
                }
            });
        });
    }

    function pushTypeAssignUndo(beforeMap) {
        typeAssignPast.push(beforeMap);
        if (typeAssignPast.length > 100) typeAssignPast.shift();
        typeAssignFuture = [];
        updateUndoButtons();
    }

    function undoTypeAssign() {
        if (!typeAssignPast.length) return false;
        typeAssignFuture.push(captureTypeIdMap());
        applyTypeIdMap(typeAssignPast.pop());
        return true;
    }

    function redoTypeAssign() {
        if (!typeAssignFuture.length) return false;
        typeAssignPast.push(captureTypeIdMap());
        applyTypeIdMap(typeAssignFuture.pop());
        return true;
    }

    function runGenerateSolvable() {
        if (!levelDoc || typeof DailySolvableFill === 'undefined') return;

        const fullSnapshot = serializeState();
        const savedLayer = state.currentLayer;

        try {
            levelDoc.mergeEditableFromLayers(state.layers);
            syncDocIdsToLayers();

            const geoBefore = captureGeometrySignature();
            const tileCountBefore = countBoardTiles();
            const typeBefore = captureTypeIdMap();

            let json;
            try {
                json = levelDoc.exportJson();
            } catch (e) {
                throw new Error(e.message || String(e));
            }

            const result = DailySolvableFill.planTypeAssignments(json.tiles);
            if (!result.ok) {
                restoreState(fullSnapshot);
                toast(result.error || '生成失败', 'err');
                resetSolvableState({ status: SOLVABLE_STATUS.FAILED, lastError: result.error });
                draw();
                return;
            }

            applyTypeIdsToLayersOnly(result.assignedById);
            levelDoc.applyTypeIdsOnly(result.assignedById);

            if (typeof window.__generateTestHook === 'function') {
                window.__generateTestHook();
            }

            const geoAfter = captureGeometrySignature();
            const tileCountAfter = countBoardTiles();

            if (geoBefore !== geoAfter || tileCountBefore !== tileCountAfter) {
                restoreState(fullSnapshot);
                toast('花色生成失败，布局已恢复', 'err');
                resetSolvableState({ status: SOLVABLE_STATUS.FAILED, lastError: '布局签名不一致' });
                draw();
                return;
            }

            state.currentLayer = savedLayer;
            solvableState = {
                status: SOLVABLE_STATUS.VERIFIED,
                layoutFingerprint: result.layoutFingerprint || DailySolvableFill.computeLayoutFingerprint(json),
                solution: result.solution,
                seed: result.seed,
                lastError: null,
            };
            pushTypeAssignUndo(typeBefore);
            updateSolvableStatusUI();
            updateStatsPanel();
            draw();
            toast(`已生成并验证可解花色（${result.solution.length} 步）`, 'ok');
        } catch (e) {
            restoreState(fullSnapshot);
            toast('花色生成失败，布局已恢复', 'err');
            resetSolvableState({ status: SOLVABLE_STATUS.FAILED, lastError: String(e.message || e) });
            draw();
        }
    }

    function verifyImportedSolvable(json) {
        if (typeof DailySolvableFill === 'undefined') return;
        const tiles = DailySolvableFill.getDailyTiles(json);
        const hasAllTypeIds = tiles.length > 0 && tiles.every((t) => t.typeId != null && Number.isFinite(t.typeId));
        if (!hasAllTypeIds) {
            resetSolvableState({ status: SOLVABLE_STATUS.NONE, layoutFingerprint: getCurrentLayoutFingerprint() });
            return;
        }
        const result = DailySolvableFill.verifyImportedLevel(json);
        if (result.ok && result.status === 'verified') {
            solvableState = {
                status: SOLVABLE_STATUS.VERIFIED,
                layoutFingerprint: result.layoutFingerprint,
                solution: result.solution,
                seed: null,
                lastError: null,
            };
            toast('导入关卡已验证可解，保留原花色', 'ok');
        } else if (result.status === 'generated') {
            solvableState = {
                status: SOLVABLE_STATUS.GENERATED,
                layoutFingerprint: result.layoutFingerprint,
                solution: null,
                seed: null,
                lastError: result.error,
            };
            toast('导入关卡求解超时，待验证', 'err');
        } else {
            resetSolvableState({
                status: SOLVABLE_STATUS.NONE,
                layoutFingerprint: getCurrentLayoutFingerprint(),
                lastError: result.error,
            });
        }
        updateSolvableStatusUI();
    }

    function canExportFormal() {
        const msg = '请先生成并验证可解花色，再导出关卡。';
        if (!levelDoc) return { ok: false, message: msg };
        if (solvableState.status !== SOLVABLE_STATUS.VERIFIED) {
            return { ok: false, message: msg };
        }
        if (solvableState.status === SOLVABLE_STATUS.STALE) {
            return { ok: false, message: msg };
        }

        levelDoc.mergeEditableFromLayers(state.layers);
        let json;
        try {
            json = levelDoc.exportJson();
        } catch (e) {
            return { ok: false, message: e.message || msg };
        }

        const tiles = DailySolvableFill?.getDailyTiles(json) ?? [];
        if (tiles.length % 2 !== 0) return { ok: false, message: msg };
        if (tiles.some((t) => t.typeId == null)) return { ok: false, message: msg };
        if (DailySolvableFill && !DailySolvableFill.allTypeCountsEven(tiles)) {
            return { ok: false, message: msg };
        }

        if (solvableState.solution?.length && DailySolvableFill) {
            const replay = DailySolvableFill.replaySolution(tiles, solvableState.solution);
            if (!replay.ok) return { ok: false, message: msg };
        }

        if (typeof DailyValidation !== 'undefined') {
            const v = DailyValidation.validateLevel(json, true);
            if (!v.ok || (v.errors ?? 0) > 0) return { ok: false, message: msg };
        }

        const fp = DailySolvableFill?.computeLayoutFingerprint(json);
        if (fp && solvableState.layoutFingerprint && fp !== solvableState.layoutFingerprint) {
            return { ok: false, message: msg };
        }

        return { ok: true, json };
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
            const solvable = document.getElementById('dailySolvablePanel');
            if (solvable?.nextSibling) sidebar.insertBefore(el, solvable.nextSibling);
            else sidebar.appendChild(el);
        }
        if (!levelDoc) {
            document.getElementById('dailyStatsBody').textContent = '未加载关卡';
            return;
        }
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
        verifyImportedSolvable(json);
    };

    window.exportJSON = function () {
        const gate = canExportFormal();
        if (!gate.ok) {
            toast(gate.message, 'err');
            return;
        }
        const json = gate.json;
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
            solvableState,
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
        solvableState = obj.solvableState || {
            status: SOLVABLE_STATUS.NONE,
            layoutFingerprint: null,
            solution: null,
            seed: null,
            lastError: null,
        };
        if (obj.doc) {
            levelDoc = LevelDocument.fromJson(obj.doc.raw, obj.doc.sourceFile);
            levelDoc.editedById = new Map(obj.doc.edited || []);
            levelDoc.addedTiles = obj.doc.added || [];
            levelDoc.deletedIds = new Set(obj.doc.deleted || []);
            levelDoc.dirty = !!obj.doc.dirty;
        }
        selectTypeId(selectedTypeId);
        updateSolvableStatusUI();
        updateStatsPanel();
        updateUI();
        updateLegend();
        draw();
    };

    function drawPlaceholderFace(innerX, innerY, innerW, innerH, x, y, w, h) {
        ctx.fillStyle = '#e8e4dc';
        ctx.fillRect(innerX, innerY, innerW, innerH);
        ctx.strokeStyle = '#b8b0a0';
        ctx.lineWidth = 1;
        ctx.strokeRect(innerX, innerY, innerW, innerH);
        ctx.fillStyle = '#9a9080';
        ctx.font = `bold ${CELL * 0.28}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x + w / 2, y + h / 2);
    }

    function drawTileFaces(col, row, layerIdx, tile) {
        if (!tile || tile.type === 'spitter' || tile.type === 'spitterQueue') return;

        const rect = cellToScreen(row, col, layerIdx, state.currentLayer);
        const x = rect.x;
        const y = rect.y;
        const w = rect.w;
        const h = rect.h;
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
        } else if (tile.type === 'normal') {
            const showRealFace =
                tile.typeId != null && solvableState.status !== SOLVABLE_STATUS.NONE;
            if (showRealFace) {
                const faceId = LevelDocument.normalizeFaceId(tile.typeId);
                const img = faceImages.get(faceId);
                if (img && img.complete && img.naturalWidth && !img._failed) {
                    ctx.drawImage(img, innerX, innerY, innerW, innerH);
                } else {
                    drawPlaceholderFace(innerX, innerY, innerW, innerH, x, y, w, h);
                }
            } else {
                drawPlaceholderFace(innerX, innerY, innerW, innerH, x, y, w, h);
            }
            if (showTypeIdDebug && tile.typeId != null) {
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

    function paintAtDaily(col, row) {
        const layer = state.layers[state.currentLayer];
        if (!layer || col < -5 || col > 5 || row < -8 || row > 6) return;

        const key = `${row},${col}`;
        const mcol = mirrorCol(col, state.currentLayer);
        const mkey = `${row},${mcol}`;

        if (state.brush === 'eraser' || state.paintMode === 'remove') {
            const hit = findTileCoveringCell(row, col, state.currentLayer);
            if (hit) {
                delete layer.tiles[hit.key];
                if (state.symmetric) {
                    const mc = mirrorCol(hit.col, state.currentLayer);
                    if (mc !== hit.col) delete layer.tiles[`${hit.row},${mc}`];
                }
            }
            draw();
            updateUI();
            afterLayoutEdit();
            return;
        }

        if (state.brush !== 'normal' && state.brush !== 'dark') return;

        if (!isPlaceable(layer, key)) return;
        if (state.symmetric && mcol !== col && !isPlaceable(layer, mkey)) return;

        if (state.currentLayer > 0) {
            if (!hasSupportAtLayer(state.currentLayer, col, row)) return;
            if (state.symmetric && mcol !== col && !hasSupportAtLayer(state.currentLayer, mcol, row)) return;
        }

        const newCells = tileOccupiesCells(key);
        if (layer.tiles[key]) {
            const oldCells = tileOccupiesCells(key);
            if (![...newCells].every((c) => oldCells.has(c))) return;
        }
        if (state.symmetric && mcol !== col && layer.tiles[mkey]) {
            const oldCells = tileOccupiesCells(mkey);
            if (![...tileOccupiesCells(mkey)].every((c) => oldCells.has(c))) return;
        }

        const existing = layer.tiles[key];
        const tileData = {
            type: state.brush,
            typeId: existing?.typeId != null ? existing.typeId : null,
        };
        if (existing?._docId != null) tileData._docId = existing._docId;

        layer.tiles[key] = tileData;

        if (state.symmetric && mcol !== col) {
            const mExisting = layer.tiles[mkey];
            const mTile = { ...tileData };
            if (mExisting?._docId != null) mTile._docId = mExisting._docId;
            layer.tiles[mkey] = mTile;
        }

        draw();
        updateUI();
        afterLayoutEdit();
    }

    window.paintAt = function (col, row) {
        if (state.brush === 'spitter' || state.brush === 'disc' || state.brush === 'rotation') return;
        paintAtDaily(col, row);
    };

    window.pushHistory = function (beforeSnapshot) {
        orig.pushHistory.call(this, beforeSnapshot);
        afterLayoutEdit();
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
        afterLayoutEdit();
    };

    const origUpdateUndoButtons = typeof updateUndoButtons === 'function' ? updateUndoButtons : null;
    window.updateUndoButtons = function () {
        if (origUpdateUndoButtons) origUpdateUndoButtons.call(this);
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn && typeAssignPast.length > 0) undoBtn.disabled = false;
        if (redoBtn && typeAssignFuture.length > 0) redoBtn.disabled = false;
    };

    const origUndo = typeof undo === 'function' ? undo : null;
    const origRedo = typeof redo === 'function' ? redo : null;

    window.undo = function () {
        if (undoTypeAssign()) {
            markLayoutStaleIfNeeded();
            updateStatsPanel();
            scheduleAutosave();
            draw();
            return;
        }
        if (origUndo) origUndo();
        afterLayoutEdit();
        draw();
    };

    window.redo = function () {
        if (redoTypeAssign()) {
            markLayoutStaleIfNeeded();
            updateStatsPanel();
            scheduleAutosave();
            draw();
            return;
        }
        if (origRedo) origRedo();
        afterLayoutEdit();
        draw();
    };

    window.dailyEditorBootstrap = function () {
        window.checkNewVersion = function () {};
        hideUnsupportedUI();
        buildSolvablePanel();
        buildDevDebugPanel();
        preloadFaces();
        renderValidationPanel();
        resetSolvableState();

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
    window.__getSolvableState = () => ({ ...solvableState });
    window.__canExportFormal = () => canExportFormal();
    window.__runGenerateSolvable = () => runGenerateSolvable();
    window.__toggleDevDebug = () => {
        const toggle = document.getElementById('dailyDevDebugToggle');
        if (toggle) toggle.click();
    };
    window.__captureGeometrySignature = () => captureGeometrySignature();
    window.__captureTypeIdMap = () => captureTypeIdMap();
    window.__countBoardTiles = () => countBoardTiles();
    window.__getTileScreenCenter = (row, col, layerIdx) => {
        const r = cellToScreen(row, col, layerIdx, state.currentLayer);
        return {
            wx: r.x + r.w / 2,
            wy: r.y + r.h / 2,
            row,
            col,
            layer: layerIdx,
        };
    };
    window.__worldToScreen = (wx, wy) => ({ x: wx * view.scale + view.ox, y: wy * view.scale + view.oy });
    window.__getHoverScreenCenter = () => {
        if (!state.hoverCell) return null;
        const r = cellToScreen(state.hoverCell.row, state.hoverCell.col, state.currentLayer, state.currentLayer);
        return { wx: r.x + r.w / 2, wy: r.y + r.h / 2 };
    };
    window.__screenToCell = (px, py) => screenToGridCell(px, py);
    window.__screenToGridCell = (px, py) => screenToGridCell(px, py);
    window.__findTileCoveringCell = (row, col, layerIdx) => findTileCoveringCell(row, col, layerIdx);
    window.__getGridCellScreenPoint = (row, col, layerIdx) => {
        const r = cellToScreen(row, col, layerIdx, state.currentLayer);
        return { wx: r.x + CELL / 2, wy: r.y + CELL / 2, row, col, layer: layerIdx };
    };
    window.__setView = (scale, ox, oy) => {
        if (scale != null) view.scale = scale;
        if (ox != null) view.ox = ox;
        if (oy != null) view.oy = oy;
        draw();
    };
    window.__fitView = () => fitView();
    window.__setCurrentLayer = (n) => {
        state.currentLayer = Math.max(0, Math.min(n, state.layers.length - 1));
        updateUI();
        draw();
    };
    window.__ensureLayers = (count) => {
        while (state.layers.length < count + 1) addLayer();
    };
    window.__setShowAll = (v) => {
        state.showAll = !!v;
        const chip = document.getElementById('allToggle');
        if (chip) chip.classList.toggle('active', state.showAll);
        draw();
    };
    window.__setGenerateTestHook = (fn) => {
        window.__generateTestHook = typeof fn === 'function' ? fn : null;
    };
    window.__getTileKeyAt = (layerIdx, row, col) => {
        const key = `${row},${col}`;
        return state.layers[layerIdx]?.tiles?.[key] ? key : null;
    };
    window.__getView = () => ({ scale: view.scale, ox: view.ox, oy: view.oy });
    window.__centerViewOnCell = (row, col, layerIdx, scale) => {
        const rect = cellToScreen(row, col, layerIdx, layerIdx);
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const w = canvasWrap.clientWidth;
        const h = canvasWrap.clientHeight;
        view.scale = scale != null ? scale : view.scale;
        view.ox = w / 2 - cx * view.scale;
        view.oy = h / 2 - cy * view.scale;
        draw();
    };
})();
