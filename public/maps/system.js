/**
 * Sistema de Mapas Editável
 * - Carrega mapas de configs JSON
 * - Permite edição em tempo real
 * - Salva mapas customizados
 */

class MapSystem {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        this.objects = new Map(); // id -> { mesh, config }
        this.selectedObject = null;
        this.editMode = false;

        this.modelCache = new Map(); // path -> geometry
        this.textureCache = new Map(); // path -> texture

        this.loader = new (window.GLTFLoader || THREE.GLTFLoader)();
        this.textureLoader = new THREE.TextureLoader();

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.gridHelper = null;
        this.transformControls = null;

        this.currentMap = null;
        this.undoStack = [];
    }

    async loadMap(configUrl) {
        console.log(`[MapSystem] Loading map: ${configUrl}`);

        const response = await fetch(configUrl);
        const config = await response.json();

        this.currentMap = config;
        this.clearMap();

        // Load each object
        for (const obj of config.objects || []) {
            await this.addObject(obj);
        }

        console.log(`[MapSystem] Loaded ${this.objects.size} objects`);
        return config;
    }

    clearMap() {
        for (const [id, data] of this.objects) {
            this.scene.remove(data.mesh);
        }
        this.objects.clear();
        this.selectedObject = null;
    }

    async addObject(config) {
        const id = config.id || `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        let mesh;

        if (config.model) {
            // Load GLB/OBJ model
            mesh = await this.loadModel(config.model);
        } else if (config.primitive) {
            // Create primitive (box, plane, etc)
            mesh = this.createPrimitive(config.primitive);
        } else {
            // Default cube placeholder
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
            mesh = new THREE.Mesh(geo, mat);
        }

        // Apply transform
        if (config.position) {
            mesh.position.set(config.position.x || 0, config.position.y || 0, config.position.z || 0);
        }
        if (config.rotation) {
            mesh.rotation.set(
                (config.rotation.x || 0) * Math.PI / 180,
                (config.rotation.y || 0) * Math.PI / 180,
                (config.rotation.z || 0) * Math.PI / 180
            );
        }
        if (config.scale) {
            const s = typeof config.scale === 'number' ? config.scale : 1;
            mesh.scale.set(
                config.scale.x || s,
                config.scale.y || s,
                config.scale.z || s
            );
        }

        // Apply texture
        if (config.texture) {
            const texture = await this.loadTexture(config.texture);
            if (mesh.material) {
                mesh.material.map = texture;
                mesh.material.needsUpdate = true;
            }
        }

        mesh.userData.mapObjectId = id;
        mesh.userData.config = config;

        this.scene.add(mesh);
        this.objects.set(id, { mesh, config: { ...config, id } });

        return id;
    }

    async loadModel(path) {
        if (this.modelCache.has(path)) {
            return this.modelCache.get(path).clone();
        }

        return new Promise((resolve, reject) => {
            this.loader.load(
                path,
                (gltf) => {
                    const model = gltf.scene;
                    this.modelCache.set(path, model);
                    resolve(model.clone());
                },
                undefined,
                (error) => {
                    console.warn(`[MapSystem] Failed to load model: ${path}`, error);
                    // Return placeholder
                    const geo = new THREE.BoxGeometry(1, 1, 1);
                    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
                    resolve(new THREE.Mesh(geo, mat));
                }
            );
        });
    }

    async loadTexture(path) {
        if (this.textureCache.has(path)) {
            return this.textureCache.get(path);
        }

        return new Promise((resolve) => {
            this.textureLoader.load(
                path,
                (texture) => {
                    this.textureCache.set(path, texture);
                    resolve(texture);
                },
                undefined,
                () => resolve(null)
            );
        });
    }

    createPrimitive(type) {
        let geo;
        switch (type) {
            case 'plane':
                geo = new THREE.PlaneGeometry(10, 10);
                break;
            case 'box':
                geo = new THREE.BoxGeometry(1, 1, 1);
                break;
            case 'sphere':
                geo = new THREE.SphereGeometry(0.5, 32, 32);
                break;
            case 'cylinder':
                geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
                break;
            default:
                geo = new THREE.BoxGeometry(1, 1, 1);
        }

        const mat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        return new THREE.Mesh(geo, mat);
    }

    // ===== EDIT MODE =====

    enableEditMode() {
        this.editMode = true;

        // Add grid
        if (!this.gridHelper) {
            this.gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
            this.gridHelper.position.y = 0.01;
        }
        this.scene.add(this.gridHelper);

        // Setup mouse events
        this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this));
        this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));

        console.log('[MapSystem] Edit mode enabled');
    }

    disableEditMode() {
        this.editMode = false;

        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }

        this.deselectObject();

        console.log('[MapSystem] Edit mode disabled');
    }

    onMouseClick(event) {
        if (!this.editMode) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const meshes = Array.from(this.objects.values()).map(o => o.mesh);
        const intersects = this.raycaster.intersectObjects(meshes, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj && !obj.userData.mapObjectId) {
                obj = obj.parent;
            }
            if (obj) {
                this.selectObject(obj.userData.mapObjectId);
            }
        } else {
            this.deselectObject();
        }
    }

    onMouseMove(event) {
        // Hover highlight could go here
    }

    selectObject(id) {
        this.deselectObject();

        const data = this.objects.get(id);
        if (!data) return;

        this.selectedObject = id;

        // Add selection highlight
        const box = new THREE.BoxHelper(data.mesh, 0x00ff00);
        box.name = 'selectionBox';
        this.scene.add(box);

        console.log(`[MapSystem] Selected: ${id}`);

        // Emit event for UI
        window.dispatchEvent(new CustomEvent('mapObjectSelected', {
            detail: { id, config: data.config }
        }));
    }

    deselectObject() {
        if (this.selectedObject) {
            const box = this.scene.getObjectByName('selectionBox');
            if (box) this.scene.remove(box);
            this.selectedObject = null;
        }
    }

    moveSelected(dx, dy, dz) {
        if (!this.selectedObject) return;

        const data = this.objects.get(this.selectedObject);
        if (!data) return;

        // Save undo state
        this.saveUndo();

        data.mesh.position.x += dx;
        data.mesh.position.y += dy;
        data.mesh.position.z += dz;

        data.config.position = {
            x: data.mesh.position.x,
            y: data.mesh.position.y,
            z: data.mesh.position.z
        };

        // Update selection box
        const box = this.scene.getObjectByName('selectionBox');
        if (box) box.update();
    }

    rotateSelected(angle) {
        if (!this.selectedObject) return;

        const data = this.objects.get(this.selectedObject);
        if (!data) return;

        this.saveUndo();

        data.mesh.rotation.y += angle * Math.PI / 180;

        data.config.rotation = {
            x: data.mesh.rotation.x * 180 / Math.PI,
            y: data.mesh.rotation.y * 180 / Math.PI,
            z: data.mesh.rotation.z * 180 / Math.PI
        };
    }

    scaleSelected(factor) {
        if (!this.selectedObject) return;

        const data = this.objects.get(this.selectedObject);
        if (!data) return;

        this.saveUndo();

        data.mesh.scale.multiplyScalar(factor);

        data.config.scale = {
            x: data.mesh.scale.x,
            y: data.mesh.scale.y,
            z: data.mesh.scale.z
        };

        const box = this.scene.getObjectByName('selectionBox');
        if (box) box.update();
    }

    deleteSelected() {
        if (!this.selectedObject) return;

        const data = this.objects.get(this.selectedObject);
        if (!data) return;

        this.saveUndo();

        this.scene.remove(data.mesh);
        this.objects.delete(this.selectedObject);
        this.deselectObject();
    }

    duplicateSelected() {
        if (!this.selectedObject) return;

        const data = this.objects.get(this.selectedObject);
        if (!data) return;

        const newConfig = JSON.parse(JSON.stringify(data.config));
        delete newConfig.id;
        newConfig.position.x += 2;

        this.addObject(newConfig);
    }

    // ===== SAVE/LOAD =====

    saveUndo() {
        const state = this.exportMap();
        this.undoStack.push(JSON.stringify(state));
        if (this.undoStack.length > 50) {
            this.undoStack.shift();
        }
    }

    undo() {
        if (this.undoStack.length === 0) return;

        const state = JSON.parse(this.undoStack.pop());
        this.loadMapFromConfig(state);
    }

    exportMap() {
        const objects = [];

        for (const [id, data] of this.objects) {
            objects.push({
                id,
                ...data.config,
                position: {
                    x: data.mesh.position.x,
                    y: data.mesh.position.y,
                    z: data.mesh.position.z
                },
                rotation: {
                    x: data.mesh.rotation.x * 180 / Math.PI,
                    y: data.mesh.rotation.y * 180 / Math.PI,
                    z: data.mesh.rotation.z * 180 / Math.PI
                },
                scale: {
                    x: data.mesh.scale.x,
                    y: data.mesh.scale.y,
                    z: data.mesh.scale.z
                }
            });
        }

        return {
            name: this.currentMap?.name || 'Custom Map',
            version: 1,
            created: new Date().toISOString(),
            objects
        };
    }

    async loadMapFromConfig(config) {
        this.currentMap = config;
        this.clearMap();

        for (const obj of config.objects || []) {
            await this.addObject(obj);
        }
    }

    saveToLocalStorage(name) {
        const data = this.exportMap();
        data.name = name;

        const maps = JSON.parse(localStorage.getItem('customMaps') || '{}');
        maps[name] = data;
        localStorage.setItem('customMaps', JSON.stringify(maps));

        console.log(`[MapSystem] Saved map: ${name}`);
    }

    loadFromLocalStorage(name) {
        const maps = JSON.parse(localStorage.getItem('customMaps') || '{}');
        if (maps[name]) {
            this.loadMapFromConfig(maps[name]);
        }
    }

    listSavedMaps() {
        const maps = JSON.parse(localStorage.getItem('customMaps') || '{}');
        return Object.keys(maps);
    }

    downloadMap() {
        const data = this.exportMap();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${data.name.replace(/\s+/g, '_')}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }
}

// Export for use
window.MapSystem = MapSystem;
