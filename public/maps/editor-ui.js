/**
 * UI do Editor de Mapas
 */

class MapEditorUI {
    constructor(mapSystem) {
        this.mapSystem = mapSystem;
        this.container = null;
        this.isVisible = false;

        this.createUI();
        this.setupKeyboard();
        this.setupEvents();
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'map-editor-ui';
        this.container.innerHTML = `
            <style>
                #map-editor-ui {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: rgba(0,0,0,0.85);
                    color: white;
                    padding: 15px;
                    border-radius: 8px;
                    font-family: 'Segoe UI', sans-serif;
                    font-size: 13px;
                    min-width: 250px;
                    z-index: 1000;
                    display: none;
                }
                #map-editor-ui.visible { display: block; }
                #map-editor-ui h3 {
                    margin: 0 0 10px 0;
                    padding-bottom: 8px;
                    border-bottom: 1px solid #444;
                    font-size: 14px;
                }
                #map-editor-ui .section {
                    margin-bottom: 12px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid #333;
                }
                #map-editor-ui .section:last-child {
                    border-bottom: none;
                    margin-bottom: 0;
                }
                #map-editor-ui label {
                    display: block;
                    color: #aaa;
                    font-size: 11px;
                    margin-bottom: 4px;
                }
                #map-editor-ui button {
                    background: #2a5298;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 2px;
                    font-size: 12px;
                }
                #map-editor-ui button:hover { background: #3a6ab8; }
                #map-editor-ui button.danger { background: #982a2a; }
                #map-editor-ui button.danger:hover { background: #b83a3a; }
                #map-editor-ui input, #map-editor-ui select {
                    background: #222;
                    color: white;
                    border: 1px solid #444;
                    padding: 5px 8px;
                    border-radius: 4px;
                    width: calc(100% - 18px);
                    margin-bottom: 5px;
                }
                #map-editor-ui .btn-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }
                #map-editor-ui .info {
                    background: #1a1a2e;
                    padding: 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    color: #8af;
                }
                #map-editor-ui .shortcut {
                    color: #6a6;
                    font-family: monospace;
                }
            </style>

            <h3>Editor de Mapa</h3>

            <div class="section">
                <label>Objeto Selecionado</label>
                <div id="selected-info" class="info">Nenhum</div>
            </div>

            <div class="section">
                <label>Mover <span class="shortcut">[WASD + QE]</span></label>
                <div class="btn-row">
                    <button onclick="mapEditor.move(-1, 0, 0)">X-</button>
                    <button onclick="mapEditor.move(1, 0, 0)">X+</button>
                    <button onclick="mapEditor.move(0, 0, -1)">Z-</button>
                    <button onclick="mapEditor.move(0, 0, 1)">Z+</button>
                    <button onclick="mapEditor.move(0, -1, 0)">Y-</button>
                    <button onclick="mapEditor.move(0, 1, 0)">Y+</button>
                </div>
            </div>

            <div class="section">
                <label>Rotacionar/Escalar <span class="shortcut">[R/T F/G]</span></label>
                <div class="btn-row">
                    <button onclick="mapEditor.rotate(-15)">Rot -15</button>
                    <button onclick="mapEditor.rotate(15)">Rot +15</button>
                    <button onclick="mapEditor.scale(0.9)">Scale -</button>
                    <button onclick="mapEditor.scale(1.1)">Scale +</button>
                </div>
            </div>

            <div class="section">
                <label>Ações <span class="shortcut">[Del Ctrl+D Ctrl+Z]</span></label>
                <div class="btn-row">
                    <button onclick="mapEditor.duplicate()">Duplicar</button>
                    <button onclick="mapEditor.delete()" class="danger">Deletar</button>
                    <button onclick="mapEditor.undo()">Desfazer</button>
                </div>
            </div>

            <div class="section">
                <label>Adicionar Objeto</label>
                <select id="add-object-type">
                    <option value="box">Cubo</option>
                    <option value="plane">Plano</option>
                    <option value="sphere">Esfera</option>
                    <option value="cylinder">Cilindro</option>
                </select>
                <button onclick="mapEditor.addPrimitive()">Adicionar</button>
            </div>

            <div class="section">
                <label>Salvar/Carregar</label>
                <input type="text" id="map-name" placeholder="Nome do mapa">
                <div class="btn-row">
                    <button onclick="mapEditor.save()">Salvar</button>
                    <button onclick="mapEditor.load()">Carregar</button>
                    <button onclick="mapEditor.download()">Download</button>
                </div>
                <div id="saved-maps" style="margin-top:8px; font-size:11px; color:#888;"></div>
            </div>

            <div class="section">
                <label>Atalhos</label>
                <div style="font-size:11px; color:#888;">
                    <span class="shortcut">F1</span> Toggle Editor |
                    <span class="shortcut">ESC</span> Deselect<br>
                    <span class="shortcut">WASD</span> Move XZ |
                    <span class="shortcut">QE</span> Move Y<br>
                    <span class="shortcut">R/T</span> Rotate |
                    <span class="shortcut">F/G</span> Scale
                </div>
            </div>
        `;

        document.body.appendChild(this.container);
        this.updateSavedMaps();
    }

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;

            const step = e.shiftKey ? 0.1 : 1;

            switch(e.key.toLowerCase()) {
                case 'f1':
                    e.preventDefault();
                    this.toggle();
                    break;
                case 'w': this.move(0, 0, -step); break;
                case 's': this.move(0, 0, step); break;
                case 'a': this.move(-step, 0, 0); break;
                case 'd': this.move(step, 0, 0); break;
                case 'q': this.move(0, -step, 0); break;
                case 'e': this.move(0, step, 0); break;
                case 'r': this.rotate(-15); break;
                case 't': this.rotate(15); break;
                case 'f': this.scale(0.9); break;
                case 'g': this.scale(1.1); break;
                case 'delete': this.delete(); break;
                case 'escape': this.mapSystem.deselectObject(); break;
                case 'z':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.undo();
                    }
                    break;
            }
        });
    }

    setupEvents() {
        window.addEventListener('mapObjectSelected', (e) => {
            const { id, config } = e.detail;
            const info = document.getElementById('selected-info');
            if (info) {
                info.innerHTML = `
                    <b>${config.name || id}</b><br>
                    Pos: ${config.position?.x?.toFixed(1) || 0}, ${config.position?.y?.toFixed(1) || 0}, ${config.position?.z?.toFixed(1) || 0}
                `;
            }
        });
    }

    toggle() {
        this.isVisible = !this.isVisible;
        this.container.classList.toggle('visible', this.isVisible);

        if (this.isVisible) {
            this.mapSystem.enableEditMode();
        } else {
            this.mapSystem.disableEditMode();
        }
    }

    move(x, y, z) {
        this.mapSystem.moveSelected(x, y, z);
    }

    rotate(angle) {
        this.mapSystem.rotateSelected(angle);
    }

    scale(factor) {
        this.mapSystem.scaleSelected(factor);
    }

    delete() {
        this.mapSystem.deleteSelected();
    }

    duplicate() {
        this.mapSystem.duplicateSelected();
    }

    undo() {
        this.mapSystem.undo();
    }

    addPrimitive() {
        const type = document.getElementById('add-object-type').value;
        this.mapSystem.addObject({
            primitive: type,
            position: { x: 0, y: 0.5, z: 0 },
            name: `New ${type}`
        });
    }

    save() {
        const name = document.getElementById('map-name').value || 'Mapa sem nome';
        this.mapSystem.saveToLocalStorage(name);
        this.updateSavedMaps();
    }

    load() {
        const name = document.getElementById('map-name').value;
        if (name) {
            this.mapSystem.loadFromLocalStorage(name);
        }
    }

    download() {
        this.mapSystem.downloadMap();
    }

    updateSavedMaps() {
        const div = document.getElementById('saved-maps');
        const maps = this.mapSystem.listSavedMaps();
        if (maps.length > 0) {
            div.innerHTML = 'Salvos: ' + maps.join(', ');
        } else {
            div.innerHTML = 'Nenhum mapa salvo';
        }
    }
}

window.MapEditorUI = MapEditorUI;

// Global helper
window.mapEditor = null;
